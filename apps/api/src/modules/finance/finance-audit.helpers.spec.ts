import { describe, expect, it } from "vitest";
import { buildFinanceAuditWhere, categoryOf, clampPageSize, describeFinanceAudit } from "./finance-audit.helpers.js";

describe("describeFinanceAudit", () => {
  it("labels in-transaction entries", () => {
    expect(describeFinanceAudit("PAYMENT", "PAYMENT_RECORDED")).toBe("Recorded a payment");
    expect(describeFinanceAudit("PAYMENT_REVERSAL", "UPDATE")).toBe("Reversed a payment");
    expect(describeFinanceAudit("EXPENSE", "CREATE")).toBe("Recorded an expense");
    expect(describeFinanceAudit("FEE_STRUCTURE", "BILL_GENERATED")).toBe("Generated student bills");
    expect(describeFinanceAudit("PAYROLL_SALARY_TEACHER", "UPDATE")).toBe("Changed a salary");
    expect(describeFinanceAudit("PAYROLL_RECORD", "UPDATE")).toBe("Updated a payroll run's status");
    expect(describeFinanceAudit("FINANCE_PERIOD_LOCK", "UPDATE")).toBe("Changed the closed-period date");
  });
  it("labels request-level entries by route and method", () => {
    expect(describeFinanceAudit("FINANCE POST /finance/fee-structures", "CREATE")).toBe("Created a fee structure");
    expect(describeFinanceAudit("FINANCE PUT /finance/fee-structures/:id", "UPDATE")).toBe("Edited a fee structure");
    expect(describeFinanceAudit("FINANCE PATCH /finance/payroll/:recordId/status", "UPDATE")).toBe("Changed a payroll run's status");
    expect(describeFinanceAudit("FINANCE POST /finance/scholarships", "CREATE")).toBe("Awarded a scholarship");
    expect(describeFinanceAudit("FINANCE POST /finance/fee-reminders/:id/send", "CREATE")).toBe("Sent fee reminders");
  });
  it("falls back to the raw route for unknown requests", () => {
    expect(describeFinanceAudit("FINANCE DELETE /finance/other", "UPDATE")).toBe("DELETE /finance/other");
  });
});

describe("categoryOf", () => {
  it("groups entries the way the filters do", () => {
    expect(categoryOf("PAYMENT", "PAYMENT_RECORDED")).toBe("PAYMENTS");
    expect(categoryOf("EXPENSE", "CREATE")).toBe("EXPENSES");
    expect(categoryOf("PAYROLL_RECORD", "UPDATE")).toBe("PAYROLL");
    expect(categoryOf("FINANCE POST /finance/fee-structures", "CREATE")).toBe("BILLING");
    expect(categoryOf("FINANCE POST /finance/scholarships", "CREATE")).toBe("CONCESSIONS");
    expect(categoryOf("FINANCE_PERIOD_LOCK", "UPDATE")).toBe("SETTINGS");
    expect(categoryOf("SOMETHING", "UPDATE")).toBe("OTHER");
  });
});

describe("buildFinanceAuditWhere", () => {
  it("always scopes to the school and finance entries", () => {
    const where = buildFinanceAuditWhere("school-1", {});
    expect(where.schoolId).toBe("school-1");
    expect(where.AND).toHaveLength(1);
  });
  it("adds a category and a date range", () => {
    const where = buildFinanceAuditWhere("s", { category: "PAYMENTS", from: "2026-10-01", to: "2026-10-31" });
    expect(where.AND).toHaveLength(3);
  });
  it("rejects bad input with a readable message", () => {
    expect(() => buildFinanceAuditWhere("s", { category: "NOPE" })).toThrow(/category/);
    expect(() => buildFinanceAuditWhere("s", { from: "garbage" })).toThrow(/start date/);
    expect(() => buildFinanceAuditWhere("s", { from: "2026-11-01", to: "2026-10-01" })).toThrow(/on or before/);
  });
});

describe("clampPageSize", () => {
  it("defaults, clamps and ignores junk", () => {
    expect(clampPageSize(undefined)).toBe(50);
    expect(clampPageSize("abc")).toBe(50);
    expect(clampPageSize("10")).toBe(10);
    expect(clampPageSize(5000)).toBe(100);
    expect(clampPageSize(0)).toBe(50);
  });
});
