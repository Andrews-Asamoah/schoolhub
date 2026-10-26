import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateBankReconciliation, dateDistanceDays, normaliseBankReference,
  statementFileHash, suggestStatementMatches,
} from "./bank-reconciliation.helpers.js";

const D = (amount: string) => new Prisma.Decimal(amount);
describe("P5 reconciliation foundation", () => {
  it("is exact to a pesewa and rejects non-zero differences", () => {
    const result = calculateBankReconciliation("1000.00", "1090.01", [
      { kind: "UNCLEARED_RECEIPT", amount: D("100.00") },
      { kind: "UNPRESENTED_PAYMENT", amount: D("10.00") },
    ]);
    expect(result.adjustedStatementBalance.toFixed(2)).toBe("1090.00");
    expect(result.difference.toFixed(2)).toBe("-0.01");
    expect(result.canSubmit).toBe(false);
  });
  it("accepts only a zero bridge difference", () => {
    const result = calculateBankReconciliation("1000.00", "1090.00", [
      { kind: "UNCLEARED_RECEIPT", amount: D("100.00") },
      { kind: "UNPRESENTED_PAYMENT", amount: D("10.00") },
    ]);
    expect(result.canSubmit).toBe(true);
  });
  it("rejects negative reconciling item magnitudes", () => {
    expect(() => calculateBankReconciliation("10", "10", [
      { kind: "UNPRESENTED_PAYMENT", amount: D("-2") },
    ])).toThrow();
  });
  it("prevents cross-school and cross-bank suggestions", () => {
    const movement = { schoolId: "s1", financeAccountId: "bank1", amount: D("50"), date: "2026-10-25", description: "receipt", reference: " ABC " };
    const candidate = { id: "x", schoolId: "s2", financeAccountId: "bank1", amount: D("50"), unmatchedAmount: D("50"), date: "2026-10-25", reference: "ABC" };
    expect(suggestStatementMatches(movement, [candidate])).toEqual([]);
    expect(suggestStatementMatches(movement, [{ ...candidate, schoolId: "s1", financeAccountId: "bank2" }])).toEqual([]);
    expect(suggestStatementMatches(movement, [{ ...candidate, schoolId: "s1" }]).map(x => x.reason)).toEqual(["EXACT_REFERENCE"]);
  });
  it("does not match the wrong direction or an already allocated entry", () => {
    const movement = { schoolId: "s", financeAccountId: "b", amount: D("-50"), date: "2026-10-25", description: "charge" };
    const candidate = { id: "c", schoolId: "s", financeAccountId: "b", amount: D("50"), unmatchedAmount: D("50"), date: "2026-10-25" };
    expect(suggestStatementMatches(movement, [candidate, { ...candidate, amount: D("-50"), unmatchedAmount: D("0") }])).toEqual([]);
  });
  it("normalises bank references and validates calendar dates", () => {
    expect(normaliseBankReference(" ab 12 ")).toBe("AB12");
    expect(dateDistanceDays("2026-10-22", "2026-10-25")).toBe(3);
    expect(() => dateDistanceDays("2026-02-30", "2026-03-01")).toThrow();
  });
  it("uses bytes for repeat import idempotency", () => {
    const bytes = new TextEncoder().encode("date,amount\n2026-10-25,10.00");
    expect(statementFileHash(bytes)).toBe(statementFileHash(bytes));
    expect(statementFileHash(bytes)).not.toBe(statementFileHash(new TextEncoder().encode("different")));
  });
});
