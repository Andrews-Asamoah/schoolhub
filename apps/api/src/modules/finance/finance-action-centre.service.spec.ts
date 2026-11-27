import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { daysBetween, FinanceActionCentreService, statutoryDueDate } from "./finance-action-centre.service.js";

type Overrides = { ready?: boolean; drafts?: number; approved?: number; runThisMonth?: number; missing?: number; overdue?: number; latestRun?: { month: number; year: number } | null };
function build(o: Overrides = {}) {
  const client = {
    bill: { aggregate: async () => ({ _count: { _all: o.overdue ?? 0 }, _sum: { balanceAmount: new Prisma.Decimal("1250.5") } }) },
    financeManualJournal: { count: async () => 0 },
    financeBankReconciliation: { count: async () => 0 },
    payrollRecord: {
      count: async () => o.runThisMonth ?? 1,
      groupBy: async () => [{ status: "DRAFT", _count: { _all: o.drafts ?? 0 } }, { status: "APPROVED", _count: { _all: o.approved ?? 0 } }],
      findFirst: async () => o.latestRun ?? null,
    },
    teacher: { count: async () => o.missing ?? 0 },
    staff: { count: async () => 0 },
  };
  const settings = { readiness: async () => ({ ready: o.ready ?? true, problems: o.ready === false ? ["Missing approved PAYE schedule"] : [], pendingDrafts: 0 }) };
  return new FinanceActionCentreService({ client } as never, settings as never);
}
const NOV_27 = new Date("2026-11-27T10:00:00Z");

describe("statutory due dates", () => {
  it("falls on the 15th of the following month, across year end", () => {
    expect(statutoryDueDate(10, 2026).toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(statutoryDueDate(12, 2026).toISOString().slice(0, 10)).toBe("2027-01-15");
  });
  it("counts whole days ignoring the time of day", () => {
    expect(daysBetween(new Date("2026-11-27T23:00:00Z"), new Date("2026-12-15T01:00:00Z"))).toBe(18);
  });
});

describe("accountant action centre", () => {
  it("reports nothing when everything is in order", async () => {
    const { items } = await build({ runThisMonth: 1 }).get("s1", { includePayroll: true }, NOV_27);
    expect(items).toEqual([]);
  });
  it("puts a blocking payroll setup problem first, ahead of warnings", async () => {
    const { items } = await build({ ready: false, overdue: 3, drafts: 1 }).get("s1", { includePayroll: true }, NOV_27);
    expect(items[0]).toMatchObject({ id: "payroll-settings", severity: "critical", page: "payroll" });
    expect(items.map(i => i.id)).toContain("receivables-overdue");
    expect(items.find(i => i.id === "receivables-overdue")).toMatchObject({ count: 3, amount: "1250.50" });
  });
  it("asks for the month's run after the 20th, and flags overdue returns", async () => {
    const { items } = await build({ runThisMonth: 0, latestRun: { month: 10, year: 2026 } }).get("s1", { includePayroll: true }, NOV_27);
    expect(items.find(i => i.id === "payroll-generate")).toMatchObject({ severity: "warning" });
    expect(items.find(i => i.id === "statutory-overdue")?.title).toContain("12 days ago");
  });
  it("leaves payroll items out for roles that may not see payroll", async () => {
    const { items } = await build({ ready: false, drafts: 2, missing: 4, overdue: 1 }).get("s1", { includePayroll: false }, NOV_27);
    expect(items.map(i => i.id)).toEqual(["receivables-overdue"]);
  });
});
