import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";

export type BreakdownQuery = { from?: string; to?: string; yearId?: string; termId?: string };
type Line = { name: string; group: string; amount: Prisma.Decimal; count: number };

const FEE_CATEGORY_LABELS: Record<string, string> = {
  TUITION: "Tuition / school fees", ADMISSION: "Admission", REGISTRATION: "Registration", EXAM: "Examination",
  LIBRARY: "Library", LABORATORY: "Laboratory", SPORTS: "Sports", TRANSPORT: "Transport", MEAL: "Meals",
  UNIFORM: "Uniform", BOOKS: "Books & stationery", TECHNOLOGY: "Technology", HOSTEL: "Hostel",
  INSURANCE: "Insurance", DEVELOPMENT: "Development levy", OTHER: "Other",
};
const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  SALARY: "Salaries", UTILITIES: "Utilities", SUPPLIES: "Supplies", MAINTENANCE: "Maintenance", TRANSPORT: "Transport",
  RENT: "Rent", INSURANCE: "Insurance", TAXES: "Taxes", OTHER: "Other",
};
const INCOME_CATEGORY_LABELS: Record<string, string> = {
  SCHOOL_FEES: "School fees", ADMISSION_FEE: "Admission fees", DONATION: "Donations", GRANT: "Grants", OTHER: "Other income",
};
/** Posting references that are fee collections or accounting plumbing, already shown as fee components. */
const FEE_OR_SYSTEM_REFERENCES = ["PAYMENT", "PAYMENT_REVERSAL", "BILL", "ACCRUAL_CUTOVER"];

const iso = /^\d{4}-\d{2}-\d{2}$/;
const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toFixed(2);
const share = (part: Prisma.Decimal, total: Prisma.Decimal) => (total.isZero() ? "0.0" : part.div(total).mul(100).toFixed(1));

function shape(lines: Map<string, Line>, total: Prisma.Decimal) {
  return [...lines.values()]
    .sort((a, b) => b.amount.comparedTo(a.amount) || a.name.localeCompare(b.name))
    .map(line => ({ name: line.name, group: line.group, amount: money(line.amount), count: line.count, sharePercent: share(line.amount, total) }));
}
function add(lines: Map<string, Line>, name: string, group: string, amount: Prisma.Decimal, count = 1) {
  const key = `${group}\u0000${name}`;
  const current = lines.get(key);
  if (current) { current.amount = current.amount.add(amount); current.count += count; }
  else lines.set(key, { name, group, amount, count });
}
const sum = (lines: Iterable<Line>) => [...lines].reduce((total, line) => total.add(line.amount), new Prisma.Decimal(0));

/**
 * Read-only income and expenditure breakdowns for the accountant's finance reports. Fee receipts are split by
 * the fee component they were allocated to (school fees, stationery and so on), never re-derived from totals,
 * so the components always add up to what was collected; anything not itemised is shown, not hidden.
 */
@Injectable()
export class FinanceBreakdownService {
  constructor(private readonly prisma: PrismaService) {}

  private async period(schoolId: string, query: BreakdownQuery) {
    const db = this.prisma.client;
    for (const [label, value] of [["start date", query.from], ["end date", query.to]] as const) {
      if (value && !iso.test(value)) throw new BadRequestException(`Enter the ${label} as YYYY-MM-DD.`);
    }
    let from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : null;
    let to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : null;
    const scope = query.termId
      ? await db.term.findFirst({ where: { id: query.termId, academicYear: { schoolId } }, select: { startDate: true, endDate: true } })
      : query.yearId ? await db.academicYear.findFirst({ where: { id: query.yearId, schoolId }, select: { startDate: true, endDate: true } }) : null;
    if ((query.termId || query.yearId) && !scope) throw new BadRequestException("The selected academic period was not found.");
    if (scope) {
      from = from && from > scope.startDate ? from : scope.startDate;
      to = to && to < scope.endDate ? to : scope.endDate;
    }
    if (from && to && from > to) throw new BadRequestException("Start date must be before or equal to end date.");
    return { from, to, label: { from: from?.toISOString().slice(0, 10) ?? null, to: to?.toISOString().slice(0, 10) ?? null } };
  }

  async income(schoolId: string, query: BreakdownQuery) {
    const db = this.prisma.client;
    const { from, to, label } = await this.period(schoolId, query);
    const conditions = [Prisma.sql`p."schoolId" = ${schoolId}`, Prisma.sql`p."status" = 'COMPLETED'`];
    if (from) conditions.push(Prisma.sql`p."paymentDate" >= ${from}`);
    if (to) conditions.push(Prisma.sql`p."paymentDate" <= ${to}`);
    const paymentWhere: Prisma.PaymentWhereInput = {
      schoolId, status: "COMPLETED", paymentDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
    };

    const [components, receipts, other] = await Promise.all([
      db.$queryRaw<Array<{ component: string; category: string; amount: Prisma.Decimal; receipts: number }>>(Prisma.sql`
        SELECT COALESCE(NULLIF(fr."name", ''), NULLIF(fi."name", ''), bi."description") AS "component",
               COALESCE(cfc."name", fi."category"::text, 'OTHER') AS "category",
               COALESCE(SUM(pi."amount"), 0)::numeric AS "amount",
               COUNT(DISTINCT p."id")::int AS "receipts"
        FROM "payment_items" pi
        INNER JOIN "payments" p ON p."id" = pi."paymentId"
        INNER JOIN "bill_items" bi ON bi."id" = pi."billItemId"
        INNER JOIN "bills" b ON b."id" = bi."billId"
        LEFT JOIN "fee_items" fi ON fi."id" = bi."feeItemId"
        LEFT JOIN "fee_item_registry" fr ON fr."id" = fi."registryItemId"
        LEFT JOIN "custom_fee_categories" cfc ON cfc."id" = fi."customCategoryId"
        WHERE ${Prisma.join([...conditions, ...(query.termId ? [Prisma.sql`b."termId" = ${query.termId}`] : []),
          ...(query.yearId && !query.termId ? [Prisma.sql`b."academicYearId" = ${query.yearId}`] : [])], " AND ")}
        GROUP BY 1, 2
      `),
      db.payment.aggregate({ where: paymentWhere, _sum: { amount: true }, _count: { _all: true } }),
      db.transaction.findMany({
        where: {
          schoolId, transactionType: "INCOME",
          OR: [{ referenceType: null }, { referenceType: { notIn: FEE_OR_SYSTEM_REFERENCES } }],
          transactionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
        },
        select: { amount: true, category: true, customCategory: { select: { name: true } } },
      }),
    ]);

    const feeLines = new Map<string, Line>();
    for (const row of components) {
      add(feeLines, row.component, FEE_CATEGORY_LABELS[row.category] ?? row.category, new Prisma.Decimal(row.amount), row.receipts);
    }
    const itemised = sum(feeLines.values());
    const collected = new Prisma.Decimal(receipts._sum.amount ?? 0);
    // Only meaningful when the whole receipt is in scope; a term filter intentionally counts just that term's items.
    const scopedToAcademicPeriod = !!(query.termId || query.yearId);
    const unitemised = scopedToAcademicPeriod ? new Prisma.Decimal(0) : Prisma.Decimal.max(collected.sub(itemised), 0);
    if (unitemised.gt(0)) add(feeLines, "Not itemised (receipts without fee-item detail)", "Unallocated", unitemised, 0);
    const feesTotal = itemised.add(unitemised);

    const otherLines = new Map<string, Line>();
    for (const row of other) {
      const name = row.customCategory?.name ?? INCOME_CATEGORY_LABELS[row.category ?? "OTHER"] ?? "Other income";
      add(otherLines, name, "Other income", new Prisma.Decimal(row.amount));
    }
    const otherTotal = sum(otherLines.values());
    const totalIncome = feesTotal.add(otherTotal);
    const groups = new Map<string, Line>();
    for (const line of feeLines.values()) add(groups, line.group, "fees", line.amount, line.count);

    return {
      period: label,
      totalIncome: money(totalIncome),
      feesCollected: {
        total: money(feesTotal), receiptCount: receipts._count._all,
        components: shape(feeLines, feesTotal),
        byCategory: shape(groups, feesTotal).map(({ name, amount, sharePercent }) => ({ name, amount, sharePercent })),
      },
      otherIncome: { total: money(otherTotal), items: shape(otherLines, otherTotal) },
      note: scopedToAcademicPeriod
        ? "Counts only the receipt amounts allocated to bills in the selected academic period."
        : null,
    };
  }

  async expenditure(schoolId: string, query: BreakdownQuery) {
    const db = this.prisma.client;
    const { from, to, label } = await this.period(schoolId, query);
    const dateRange = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const [expenses, payslips] = await Promise.all([
      db.expense.findMany({
        where: { schoolId, ...(from || to ? { date: dateRange } : {}) },
        select: { amount: true, category: true, customCategory: { select: { name: true } }, registryCategory: { select: { name: true } } },
      }),
      // Payroll leaves the books when a payslip is paid: gross pay plus the employer's pension contribution.
      db.payslip.findMany({
        where: { payrollRecord: { schoolId }, paymentStatus: "COMPLETED", ...(from || to ? { paidAt: dateRange } : {}) },
        select: { grossSalary: true, ssnitEmployer: true },
      }),
    ]);

    const lines = new Map<string, Line>();
    for (const row of expenses) {
      const name = row.registryCategory?.name ?? row.customCategory?.name ?? EXPENSE_CATEGORY_LABELS[row.category ?? "OTHER"] ?? "Other";
      add(lines, name, "Expenses", new Prisma.Decimal(row.amount));
    }
    const payroll = payslips.reduce((total, p) => total.add(p.grossSalary).add(p.ssnitEmployer), new Prisma.Decimal(0));
    if (payroll.gt(0)) add(lines, "Payroll (gross salaries + employer SSNIT)", "Payroll", payroll, payslips.length);
    const total = sum(lines.values());
    return {
      period: label,
      total: money(total),
      recordedExpenses: money(sum([...lines.values()].filter(l => l.group === "Expenses"))),
      payroll: money(payroll),
      categories: shape(lines, total),
    };
  }
}
