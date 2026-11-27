import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { PayrollSettingsService } from "./payroll-settings.service.js";

export type ActionSeverity = "critical" | "warning" | "info";
export type ActionItem = {
  id: string; severity: ActionSeverity; title: string; detail: string;
  /** SchoolHub page id to open (the same ids as the sidebar routes). */
  page: string; count?: number; amount?: string;
};
const ORDER: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2 };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 86_400_000;

/** Statutory returns for a payroll month fall due on the 15th of the next month (the SSNIT schedule a day earlier). */
export function statutoryDueDate(month: number, year: number) {
  return new Date(Date.UTC(year, month, 15));
}
export function daysBetween(from: Date, to: Date) {
  return Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) / DAY_MS);
}

/**
 * One read-only answer to "what needs my attention today?". Everything is derived from existing records, so
 * it never goes stale and needs no setup; each item opens the page where the accountant can resolve it.
 */
@Injectable()
export class FinanceActionCentreService {
  constructor(private readonly prisma: PrismaService, private readonly payrollSettings: PayrollSettingsService) {}

  async get(schoolId: string, options: { includePayroll: boolean }, now = new Date()) {
    const db = this.prisma.client;
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    const today = new Date(Date.UTC(year, month - 1, now.getUTCDate()));
    const money = (value: Prisma.Decimal | null | undefined) => (value ?? new Prisma.Decimal(0)).toFixed(2);
    const salaryGap = { schoolId, isActive: true, deletedAt: null, OR: [{ monthlySalary: null }, { monthlySalary: { lte: 0 } }] };

    const [overdue, journals, reconciliations, reminders, payroll] = await Promise.all([
      db.bill.aggregate({
        where: { schoolId, status: { notIn: ["CANCELLED", "WAIVED"] }, balanceAmount: { gt: 0 }, dueDate: { lt: today } },
        _sum: { balanceAmount: true }, _count: { _all: true },
      }),
      db.financeManualJournal.count({ where: { schoolId, status: "PENDING_APPROVAL" } }),
      db.financeBankReconciliation.groupBy({
        by: ["status"], where: { schoolId, supersededBy: null, status: { in: ["DRAFT", "PENDING"] } },
        _count: { _all: true },
      }),
      db.feeReminderSchedule.count({
        where: { schoolId, isActive: true, sendInApp: true, installments: { some: { sent: false, sendDate: { lte: today } } } },
      }),
      options.includePayroll ? this.payrollSignals(schoolId, month, year, salaryGap) : Promise.resolve(null),
    ]);

    const items: ActionItem[] = [];
    if (payroll) {
      const label = `${MONTHS[month - 1]} ${year}`;
      if (!payroll.readiness.ready) {
        items.push({ id: "payroll-settings", severity: "critical", page: "payroll", title: `Payroll can’t be calculated for ${label}`,
          detail: payroll.readiness.problems[0] ?? "Approved PAYE or SSNIT settings are missing.", count: payroll.readiness.pendingDrafts || undefined });
      }
      if (payroll.missingSalary > 0) {
        items.push({ id: "payroll-salaries", severity: "warning", page: "payroll", count: payroll.missingSalary,
          title: `${payroll.missingSalary} active employee${payroll.missingSalary === 1 ? "" : "s"} without a salary`,
          detail: "They are left out of payroll drafts until a monthly salary is set." });
      }
      if (!payroll.runThisMonth && payroll.readiness.ready) {
        items.push({ id: "payroll-generate", severity: now.getUTCDate() >= 20 ? "warning" : "info", page: "payroll",
          title: `No payroll run for ${label} yet`, detail: "Generate the draft, review it and approve it so salaries and statutory returns are ready on time." });
      }
      if (payroll.drafts > 0) {
        items.push({ id: "payroll-drafts", severity: "warning", page: "payroll", count: payroll.drafts,
          title: `${payroll.drafts} payroll draft${payroll.drafts === 1 ? "" : "s"} awaiting approval`, detail: "Review the payslips and approve, or cancel the draft." });
      }
      if (payroll.approved > 0) {
        items.push({ id: "payroll-unpaid", severity: "warning", page: "payroll", count: payroll.approved,
          title: `${payroll.approved} approved payroll run${payroll.approved === 1 ? "" : "s"} not yet marked paid`, detail: "Record the disbursement once salaries have been paid." });
      }
      if (payroll.latestRun) {
        const due = statutoryDueDate(payroll.latestRun.month, payroll.latestRun.year);
        const days = daysBetween(today, due);
        const period = `${MONTHS[payroll.latestRun.month - 1]} ${payroll.latestRun.year}`;
        if (days < 0 && days >= -30) {
          items.push({ id: "statutory-overdue", severity: "warning", page: "payroll",
            title: `${period} PAYE and SSNIT returns were due ${-days} day${days === -1 ? "" : "s"} ago`,
            detail: "Download both schedules from the payroll run and confirm they were filed." });
        } else if (days >= 0 && days <= 7) {
          items.push({ id: "statutory-due", severity: "info", page: "payroll",
            title: `${period} PAYE and SSNIT returns due ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
            detail: "Download the PAYE return and SSNIT schedule from the approved payroll run." });
        }
      }
    }
    if (overdue._count._all > 0) {
      items.push({ id: "receivables-overdue", severity: "warning", page: "outstanding", count: overdue._count._all, amount: money(overdue._sum.balanceAmount),
        title: `${overdue._count._all} overdue invoice${overdue._count._all === 1 ? "" : "s"}`, detail: "Past their due date with a balance remaining. Send reminders or follow up." });
    }
    if (journals > 0) {
      items.push({ id: "journals-pending", severity: "warning", page: "finance-reports", count: journals,
        title: `${journals} manual journal${journals === 1 ? "" : "s"} awaiting approval`, detail: "Another authorised user must approve them before they post." });
    }
    const pendingReconciliations = reconciliations.find(row => row.status === "PENDING")?._count._all ?? 0;
    if (pendingReconciliations > 0) {
      items.push({ id: "reconciliations-pending", severity: "warning", page: "finance-reports", count: pendingReconciliations,
        title: `${pendingReconciliations} bank reconciliation${pendingReconciliations === 1 ? "" : "s"} awaiting approval`, detail: "Review and approve so the period can close." });
    }
    const draftReconciliations = reconciliations.find(row => row.status === "DRAFT")?._count._all ?? 0;
    if (draftReconciliations > 0) {
      items.push({ id: "reconciliations-draft", severity: "info", page: "finance-reports", count: draftReconciliations,
        title: `${draftReconciliations} draft bank reconciliation${draftReconciliations === 1 ? "" : "s"}`, detail: "Review suggested bank matches, reconcile remaining lines and submit." });
    }
    if (reminders > 0) {
      items.push({ id: "fee-reminders-due", severity: "warning", page: "fee-reminders", count: reminders,
        title: `${reminders} fee reminder schedule${reminders === 1 ? "" : "s"} ready to review`,
        detail: "Preview eligible families and confirm in-app delivery." });
    }
    items.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
    return { generatedAt: now.toISOString(), items };
  }

  private async payrollSignals(schoolId: string, month: number, year: number, salaryGap: Prisma.TeacherWhereInput & Prisma.StaffWhereInput) {
    const db = this.prisma.client;
    const [readiness, runThisMonth, grouped, latestRun, teachers, staff] = await Promise.all([
      this.payrollSettings.readiness(schoolId, month, year),
      db.payrollRecord.count({ where: { schoolId, month, year, status: { not: "CANCELLED" } } }),
      db.payrollRecord.groupBy({ by: ["status"], where: { schoolId, status: { in: ["DRAFT", "APPROVED"] } }, _count: { _all: true } }),
      db.payrollRecord.findFirst({ where: { schoolId, status: { in: ["APPROVED", "PAID"] } }, orderBy: [{ year: "desc" }, { month: "desc" }], select: { month: true, year: true } }),
      db.teacher.count({ where: salaryGap }),
      db.staff.count({ where: salaryGap }),
    ]);
    const count = (status: string) => grouped.find(row => row.status === status)?._count._all ?? 0;
    return { readiness, runThisMonth: runThisMonth > 0, drafts: count("DRAFT"), approved: count("APPROVED"), latestRun, missingSalary: teachers + staff };
  }
}
