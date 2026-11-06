import { describe, expect, it } from "vitest";
import { previewStatement } from "./statement-import.js";
const input = { schoolId: "s", accountId: "a", startDate: "2026-09-01", endDate: "2026-09-30", openingBalance: "100", closingBalance: "110", rows: [{ date: "2026-09-02", amount: "10", description: "Receipt" }] };
const bytes = new TextEncoder().encode("statement");
describe("statement import validation", () => {
  it("accepts no-movement statements only when opening and closing balances agree", () => {
    expect(previewStatement({ ...input, rows: [], closingBalance: input.openingBalance }, bytes).rows).toEqual([]);
    expect(() => previewStatement({ ...input, rows: [] }, bytes)).toThrow(/closing balance/);
  });
  it("verifies the statement balance bridge with decimal arithmetic", () => {
    expect(previewStatement(input, bytes)).toMatchObject({ movement: "10.00", closingBalance: "110.00", requiresDuplicateReview: false });
    expect(() => previewStatement({ ...input, closingBalance: "110.01" }, bytes)).toThrow(/closing balance/);
  });
  it.each(["NaN", "Infinity", "0.001", "0", "1e2"])("rejects invalid movement %s", amount => {
    expect(() => previewStatement({ ...input, rows: [{ ...input.rows[0]!, amount }] }, bytes)).toThrow();
  });
  it("flags repeated lines without silently deleting legitimate transactions", () => {
    const result = previewStatement({ ...input, closingBalance: "120", rows: [...input.rows, ...input.rows] }, bytes);
    expect(result.rows).toHaveLength(2);
    expect(result.duplicateRows).toEqual([2]);
  });
  it("rejects invalid calendar dates and out-of-period movements", () => {
    for (const date of ["2026-02-30", "2026-10-01"]) expect(() => previewStatement({ ...input, rows: [{ ...input.rows[0]!, date }] }, bytes)).toThrow();
  });
});
