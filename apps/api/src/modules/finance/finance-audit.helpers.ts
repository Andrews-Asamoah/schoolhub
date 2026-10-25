import type { Prisma } from "@prisma/client";

/** Pure helpers for the finance audit-log viewer (no database access, easy to unit test). */

const starts = (value: string): Prisma.AuditLogWhereInput => ({ entityType: { startsWith: value } });
const contains = (value: string): Prisma.AuditLogWhereInput => ({ entityType: { contains: value } });

/** Everything that counts as a finance audit entry: in-transaction entries plus request-level ones. */
export const FINANCE_AUDIT_SCOPE: Prisma.AuditLogWhereInput[] = [
  starts("FINANCE"),
  starts("PAYMENT"),
  starts("PAYROLL"),
  { entityType: { in: ["EXPENSE", "FEE_STRUCTURE"] } },
  { action: { in: ["PAYMENT_RECORDED", "BILL_GENERATED"] } },
];

export const FINANCE_AUDIT_CATEGORIES = {
  PAYMENTS: [starts("PAYMENT"), contains("payments"), { action: "PAYMENT_RECORDED" }],
  EXPENSES: [starts("EXPENSE"), contains("expenses"), contains("expenditure")],
  BILLING: [starts("FEE_STRUCTURE"), contains("fee-structures"), contains("bills"), contains("fee-item"), { action: "BILL_GENERATED" }],
  PAYROLL: [starts("PAYROLL"), contains("payroll")],
  CONCESSIONS: [contains("scholarships"), contains("sibling-discount"), contains("concessions")],
  SETTINGS: [starts("FINANCE_PERIOD_LOCK"), contains("period-lock"), contains("fee-reminders")],
} satisfies Record<string, Prisma.AuditLogWhereInput[]>;

export type FinanceAuditCategory = keyof typeof FINANCE_AUDIT_CATEGORIES;
export const FINANCE_AUDIT_CATEGORY_KEYS = Object.keys(FINANCE_AUDIT_CATEGORIES) as FinanceAuditCategory[];

export interface FinanceAuditQuery {
  category?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: string | number;
}

export const DEFAULT_AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_PAGE_SIZE = 100;

export function clampPageSize(raw: string | number | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_AUDIT_PAGE_SIZE;
  return Math.min(Math.floor(value), MAX_AUDIT_PAGE_SIZE);
}

/** Returns a Prisma `where` for one school, or throws a readable message for bad input. */
export function buildFinanceAuditWhere(schoolId: string, query: FinanceAuditQuery): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [{ OR: FINANCE_AUDIT_SCOPE }];
  if (query.category) {
    const fragments = FINANCE_AUDIT_CATEGORIES[query.category as FinanceAuditCategory];
    if (!fragments) throw new Error("Choose a valid audit category.");
    and.push({ OR: fragments });
  }
  const createdAt: Prisma.DateTimeFilter = {};
  if (query.from) {
    const from = new Date(`${query.from}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime())) throw new Error("Enter a valid start date.");
    createdAt.gte = from;
  }
  if (query.to) {
    const to = new Date(`${query.to}T23:59:59.999Z`);
    if (Number.isNaN(to.getTime())) throw new Error("Enter a valid end date.");
    createdAt.lte = to;
  }
  if (createdAt.gte && createdAt.lte && createdAt.gte > createdAt.lte) {
    throw new Error("The start date must be on or before the end date.");
  }
  if (createdAt.gte || createdAt.lte) and.push({ createdAt });
  return { schoolId, AND: and };
}

const ROUTE_LABELS: Array<[RegExp, string | Record<string, string>]> = [
  [/payments\/[^/\s]+\/reverse/, "Reversed a payment"],
  [/period-lock/, "Changed the closed-period date"],
  [/payroll\/salaries/, "Changed a salary"],
  [/payroll\/[^/\s]+\/status/, "Changed a payroll run's status"],
  [/payroll/, { POST: "Generated a payroll draft" }],
  [/fee-structures/, { POST: "Created a fee structure", PUT: "Edited a fee structure", PATCH: "Archived or reactivated a fee structure" }],
  [/scholarships/, { POST: "Awarded a scholarship", PATCH: "Activated or deactivated a scholarship" }],
  [/sibling-discount/, { POST: "Created a sibling discount rule", PATCH: "Activated or deactivated a sibling discount rule" }],
  [/fee-reminders\/[^/\s]+\/send/, "Sent fee reminders"],
  [/fee-reminders/, { POST: "Created or extended a reminder schedule", PATCH: "Paused or resumed a reminder schedule" }],
  [/expenditure-categories/, "Changed expense categories"],
  [/fee-item-registry/, "Changed fee item categories"],
  [/payments/, "Recorded a payment"],
  [/expenses/, "Recorded an expense"],
  [/bills\/generate/, "Generated student bills"],
];

/** A short, human sentence for an audit row. */
export function describeFinanceAudit(entityType: string, action: string): string {
  if (entityType === "PAYMENT" && action === "PAYMENT_RECORDED") return "Recorded a payment";
  if (entityType === "PAYMENT_REVERSAL") return "Reversed a payment";
  if (entityType === "EXPENSE") return "Recorded an expense";
  if (action === "BILL_GENERATED") return "Generated student bills";
  if (entityType.startsWith("PAYROLL_SALARY")) return "Changed a salary";
  if (entityType === "PAYROLL_RECORD") return "Updated a payroll run's status";
  if (entityType === "FINANCE_PERIOD_LOCK") return "Changed the closed-period date";

  const match = /^FINANCE (\w+) (\S+)/.exec(entityType);
  if (match) {
    const [, method, path] = match as unknown as [string, string, string];
    for (const [pattern, label] of ROUTE_LABELS) {
      if (!pattern.test(path)) continue;
      if (typeof label === "string") return label;
      if (label[method]) return label[method]!;
    }
    return `${method} ${path}`;
  }
  return entityType;
}

/** Best-effort category for display; mirrors FINANCE_AUDIT_CATEGORIES. */
export function categoryOf(entityType: string, action: string): FinanceAuditCategory | "OTHER" {
  const text = entityType.toLowerCase();
  if (entityType.startsWith("PAYMENT") || text.includes("payments") || action === "PAYMENT_RECORDED") return "PAYMENTS";
  if (entityType.startsWith("EXPENSE") || text.includes("expenses") || text.includes("expenditure")) return "EXPENSES";
  if (text.includes("period-lock") || entityType.startsWith("FINANCE_PERIOD_LOCK") || text.includes("fee-reminders")) return "SETTINGS";
  if (entityType.startsWith("PAYROLL") || text.includes("payroll")) return "PAYROLL";
  if (text.includes("scholarships") || text.includes("sibling-discount") || text.includes("concessions")) return "CONCESSIONS";
  if (entityType.startsWith("FEE_STRUCTURE") || text.includes("fee-structures") || text.includes("bills") || text.includes("fee-item") || action === "BILL_GENERATED") return "BILLING";
  return "OTHER";
}
