import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { FinanceLedgerIntegrityService } from "./finance-ledger-integrity.service.js";
import { FinanceService } from "./finance.service.js";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const block = (key: string, label: string, passed: boolean, detail?: unknown) => ({
  key, label, severity: "BLOCKING" as const, result: (passed ? "PASS" : "FAIL") as "PASS" | "FAIL",
  detail: (detail ?? null) as Prisma.InputJsonValue | null,
});

/**
 * P4 closing preparation and audit trail, deliberately independent of the old
 * finance-period-lock endpoint. No method can change a period to CLOSED or
 * manufacture a reporting snapshot until the P2/P3/P5/P6 controls are installed.
 */
@Injectable()
export class FinancePeriodPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinanceLedgerIntegrityService,
    private readonly finance: FinanceService,
  ) {}

  private monthDates(year: number, month: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException("Enter a valid accounting month and year.");
    }
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0));
    if (endDate > new Date()) throw new BadRequestException("Cannot prepare a period before its final day.");
    return { startDate, endDate };
  }

  async list(schoolId: string) {
    return this.prisma.client.financeAccountingPeriod.findMany({
      where: { schoolId }, orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: 36, include: { _count: { select: { closingRuns: true, snapshots: true } } },
    });
  }

  async readiness(schoolId: string, year: number, month: number) {
    const { startDate, endDate } = this.monthDates(year, month);
    const [ledger, receivables, settings, pendingAdjustments, unapprovedPayroll, period, accrual] = await Promise.all([
      this.ledger.check(schoolId),
      this.finance.getReceivablesCloseReadiness(schoolId),
      this.prisma.client.financeSettings.findUnique({ where: { schoolId } }),
      this.prisma.client.financeBillAdjustment.count({
        where: {
          schoolId, effectiveDate: { gte: startDate, lte: endDate },
          status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] },
        },
      }),
      this.prisma.client.payrollRecord.count({
        where: { schoolId, year, month, status: { in: ["DRAFT"] } },
      }),
      this.prisma.client.financeAccountingPeriod.findUnique({
        where: { schoolId_type_startDate: { schoolId, type: "MONTH", startDate } },
      }),
      this.prisma.client.financeAccrualState.findUnique({ where: { schoolId } }),
    ]);
    const currentDate = iso(new Date());
    const periodAsOf = iso(endDate);
    const checks = [
      block("I1", "Debits and credits reconcile and posting pairs are valid", ledger.I1.status === "PASS", ledger.I1),
      block("I2", "Cached balances reconcile to postings", ledger.I2.status === "PASS", ledger.I2),
      block("AR", "Receivables control and student balances reconcile", receivables.closeReady && periodAsOf === currentDate, {
        sourceBasis: receivables.basis,
        reportingDate: receivables.asOf,
        periodEnd: periodAsOf,
        checks: receivables.checks,
        warning: "Current-day receivables cannot certify a historical month-end snapshot.",
      }),
      block("PENDING_ADJUSTMENTS", "No unresolved financial adjustments", pendingAdjustments === 0, { count: pendingAdjustments }),
      block("PAYROLL", "No unapproved payroll drafts for the month", unapprovedPayroll === 0, { count: unapprovedPayroll }),
      block("P2_LEDGER", "P2 immutable journals, reversals and opening balances verified", false, {
        reason: "P2 journal-entry and database immutability gates have not been signed off on main.",
      }),
      block("P3_REVENUE", "P3 revenue schedules, credits and policies reconciled", false, {
        revenuePolicyApproved: Boolean(settings?.revenuePolicyApprovedAt),
        accrualActive: Boolean(accrual),
        adjustmentsEnabled: settings?.p3AdjustmentsEnabled ?? false,
      }),
      block("P5_RECONCILIATIONS", "Each cash/bank/wallet account has an approved period-end reconciliation", false),
      block("P6_STATUTORY", "Payroll liabilities and statutory remittances reconcile", false),
      block("INDEPENDENT_APPROVAL", "An independent approver must authorise a period close", false),
    ];
    return {
      schoolId, name: String(year) + "-" + String(month).padStart(2, "0"),
      startDate: iso(startDate), endDate: periodAsOf,
      status: period?.status ?? "NOT_CREATED",
      alreadyClosed: period?.status === "CLOSED",
      checks, passed: checks.every(check => check.result === "PASS"),
      canClose: false,
      message: "Preparation-only checks. No close is permitted until the P2/P3/P5/P6 exit gates and independent approvals are implemented.",
    };
  }

  async prepare(schoolId: string, actorId: string, year: number, month: number) {
    const report = await this.readiness(schoolId, year, month);
    const { startDate, endDate } = this.monthDates(year, month);
    return this.prisma.client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('finance-period-prepare'))`;
      const period = await tx.financeAccountingPeriod.upsert({
        where: { schoolId_type_startDate: { schoolId, type: "MONTH", startDate } },
        create: { schoolId, type: "MONTH", name: report.name, startDate, endDate, status: "OPEN" },
        update: {},
      });
      if (period.status !== "OPEN") throw new ConflictException("Only an OPEN accounting period can be prepared.");
      const closingRun = await tx.financePeriodClosingRun.create({
        data: {
          periodId: period.id, startedById: actorId, passed: false,
          checks: {
            create: report.checks.map(check => ({
              key: check.key, label: check.label, severity: check.severity,
              result: check.result, detail: check.detail ?? Prisma.JsonNull,
            })),
          },
        },
        include: { checks: true },
      });
      return {
        period, closingRun, canClose: false,
        warning: "This records the observed checks only; no snapshot, posting, period lock or close approval was created.",
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
