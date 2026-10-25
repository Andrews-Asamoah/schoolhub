import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { buildRunningStatement, daysPastDue } from "./finance-reporting.helpers.js";

describe("buildRunningStatement", () => {
  it("sorts events and applies signed decimal movements to the running balance", () => {
    const result = buildRunningStatement(new Prisma.Decimal("100.00"), [
      { id: "receipt", date: "2026-10-02", type: "RECEIPT", reference: "RCT-1", description: "Receipt", amount: new Prisma.Decimal("-30.10") },
      { id: "invoice", date: "2026-10-01", type: "INVOICE", reference: "INV-1", description: "Invoice", amount: new Prisma.Decimal("50.25") },
      { id: "discount", date: "2026-10-01", type: "DISCOUNT", reference: "INV-1", description: "Discount", amount: new Prisma.Decimal("-5.25") },
      { id: "reverse", date: "2026-10-03", type: "REVERSAL", reference: "RCT-1", description: "Reversal", amount: new Prisma.Decimal("30.10") },
    ]);
    expect(result.entries.map((entry) => entry.type)).toEqual(["INVOICE", "DISCOUNT", "RECEIPT", "REVERSAL"]);
    expect(result.entries.map((entry) => entry.runningBalance)).toEqual(["150.25", "145.00", "114.90", "145.00"]);
    expect(result.closingBalance.toFixed(2)).toBe("145.00");
  });

  it("retains exact cents over repeated fractional-looking decimal movements", () => {
    const events = Array.from({ length: 100 }, (_, index) => ({
      id: String(index).padStart(3, "0"),
      date: "2026-01-01",
      type: "INVOICE" as const,
      reference: "INV",
      description: "invoice line",
      amount: new Prisma.Decimal("0.01"),
    }));
    expect(buildRunningStatement(new Prisma.Decimal("0"), events).closingBalance.toFixed(2)).toBe("1.00");
  });
});

describe("daysPastDue", () => {
  it("calculates whole days from UTC calendar dates", () => {
    expect(daysPastDue(new Date("2026-10-01T23:30:00.000Z"), new Date("2026-10-31T01:00:00.000Z"))).toBe(30);
    expect(daysPastDue(new Date("2026-11-01T00:00:00.000Z"), new Date("2026-10-31T23:59:00.000Z"))).toBe(-1);
  });
});
