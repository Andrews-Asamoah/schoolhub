import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type FinanceAdjustmentKind } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";

const zero = new Prisma.Decimal(0);
const activeDraftStates = ["DRAFT", "PENDING_APPROVAL", "APPROVED"] as const;
const day = (date: Date) => date.toISOString().slice(0, 10);

export type AdjustmentDraftInput = {
  billId: string;
  kind: FinanceAdjustmentKind;
  reasonCode: string;
  reason: string;
  effectiveDate: string;
  lines: Array<{ billItemId: string; amount: string }>;
};

function money(value: string): Prisma.Decimal {
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(value)) {
    throw new BadRequestException("Amounts must be non-negative currency values with no more than two decimals.");
  }
  const amount = new Prisma.Decimal(value);
  if (!amount.isFinite() || amount.lte(0)) throw new BadRequestException("Each adjustment amount must be positive.");
  return amount;
}

function exactDate(value: string): Date {
  const date = new Date(value + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || day(date) !== value) {
    throw new BadRequestException("Enter a real effective date as YYYY-MM-DD.");
  }
  if (value > day(new Date())) throw new BadRequestException("Financial adjustments cannot be effective in the future.");
  return date;
}

/**
 * P3 preparation workflow. All records created here are DRAFT and have zero financial impact.
 * Posting/approval cannot be enabled before P2 immutable journals and accounting policy sign-off.
 * In particular, it is unsafe to repurpose a paid receipt as a credit or cancel a paid bill here.
 */
@Injectable()
export class FinanceRevenueAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async preflight(schoolId: string) {
    const [settings, accrual, pendingDrafts] = await Promise.all([
      this.prisma.client.financeSettings.findUnique({ where: { schoolId } }),
      this.prisma.client.financeAccrualState.findUnique({ where: { schoolId } }),
      this.prisma.client.financeBillAdjustment.count({
        where: { schoolId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } },
      }),
    ]);
    const blockers = [
      "P2 immutable journal-entry, reversal and system-account controls are required before P3 posting.",
      "P3 journal-backed credits, refunds and deferred-revenue posting have not been activated.",
    ];
    if (!accrual) blockers.push("School accrual cutover must reconcile before P3 posting.");
    if (!settings?.revenuePolicyApprovedAt) blockers.push("Accountant must approve the school revenue-recognition and adjustment policy.");
    return {
      schoolId, pendingDrafts, canPost: false, blockers,
      configuredFlags: {
        adjustments: settings?.p3AdjustmentsEnabled ?? false,
        credits: settings?.p3CreditsEnabled ?? false,
        deferredRevenue: settings?.p3DeferredRevenueEnabled ?? false,
      },
      accountingBasis: accrual ? "ACCRUAL" : "LEGACY",
    };
  }

  async list(schoolId: string, take = 50) {
    return this.prisma.client.financeBillAdjustment.findMany({
      where: { schoolId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(take, 1), 100),
      include: { lines: true },
    });
  }

  async createDraft(schoolId: string, actorId: string, input: AdjustmentDraftInput) {
    const date = exactDate(input.effectiveDate);
    if (!["CREDIT_NOTE", "WRITE_OFF", "WAIVER"].includes(input.kind)) {
      throw new BadRequestException("This adjustment kind is not yet supported for draft preparation.");
    }
    if (input.reason.trim().length < 10 || input.reasonCode.trim().length < 2) {
      throw new BadRequestException("Provide a reason code and a meaningful reason.");
    }
    if (!input.lines.length || input.lines.length > 100) {
      throw new BadRequestException("Provide between one and 100 bill-item adjustment lines.");
    }
    const parsed = input.lines.map(line => ({ billItemId: line.billItemId, amount: money(line.amount) }));
    if (new Set(parsed.map(line => line.billItemId)).size !== parsed.length) {
      throw new BadRequestException("A bill item can only occur once in an adjustment.");
    }
    const total = parsed.reduce((sum, line) => sum.plus(line.amount), zero);

    return this.prisma.client.$transaction(async tx => {
      // One school-level lock serialises competing drafts and reserves outstanding amounts.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('finance-adjustment-drafts'))`;
      const bill = await tx.bill.findFirst({
        where: { id: input.billId, schoolId },
        include: { items: { select: { id: true, balanceAmount: true } } },
      });
      if (!bill) throw new NotFoundException("Invoice not found in this school.");
      if (bill.billType !== "INVOICE" || ["CANCELLED", "WAIVED"].includes(bill.status)) {
        throw new ConflictException("Only an active issued invoice can be adjusted.");
      }
      if (bill.balanceAmount.lte(0)) {
        throw new ConflictException("This draft workflow only supports unpaid balances; paid credits need the P3 student-credit liability.");
      }
      const lock = await tx.financePeriodLock.findUnique({ where: { schoolId } });
      if (lock && date <= lock.lockedThrough) throw new ConflictException("Effective date is in a locked accounting period.");

      const reservations = await tx.financeBillAdjustmentLine.findMany({
        where: { adjustment: { schoolId, billId: bill.id, status: { in: [...activeDraftStates] } } },
        select: { billItemId: true, amount: true },
      });
      const reservedByItem = new Map<string, Prisma.Decimal>();
      for (const row of reservations) {
        reservedByItem.set(row.billItemId, (reservedByItem.get(row.billItemId) ?? zero).plus(row.amount));
      }
      const items = new Map(bill.items.map(item => [item.id, item]));
      for (const line of parsed) {
        const item = items.get(line.billItemId);
        if (!item) throw new BadRequestException("Every line must belong to the selected invoice.");
        const available = item.balanceAmount.minus(reservedByItem.get(line.billItemId) ?? zero);
        if (line.amount.gt(available)) {
          throw new ConflictException("An adjustment exceeds the unreserved outstanding value of its invoice component.");
        }
      }
      const reservedTotal = reservations.reduce((sum, row) => sum.plus(row.amount), zero);
      if (total.plus(reservedTotal).gt(bill.balanceAmount)) {
        throw new ConflictException("Adjustment drafts cannot exceed the invoice's unreserved open balance.");
      }
      const prefix = "ADJ-" + date.getUTCFullYear() + "-";
      const latest = await tx.financeBillAdjustment.findFirst({
        where: { schoolId, adjustmentNumber: { startsWith: prefix } },
        orderBy: { adjustmentNumber: "desc" },
        select: { adjustmentNumber: true },
      });
      const previous = latest?.adjustmentNumber.slice(prefix.length) ?? "0";
      const next = Number(previous) + 1;
      if (!Number.isSafeInteger(next)) throw new ConflictException("Adjustment numbering needs administrator review.");
      return tx.financeBillAdjustment.create({
        data: {
          schoolId, billId: bill.id, studentId: bill.studentId, kind: input.kind,
          amount: total, reasonCode: input.reasonCode.trim(), reason: input.reason.trim(),
          effectiveDate: date, createdById: actorId, status: "DRAFT",
          adjustmentNumber: prefix + String(next).padStart(6, "0"),
          lines: { create: parsed },
        },
        include: { lines: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async discardDraft(schoolId: string, id: string) {
    const deleted = await this.prisma.client.financeBillAdjustment.deleteMany({
      where: { id, schoolId, status: "DRAFT" },
    });
    if (deleted.count !== 1) throw new NotFoundException("Draft adjustment not found or already submitted.");
    return { id, deleted: true };
  }
}
