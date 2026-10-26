import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { buildPeriodSnapshot } from "./finance-period-snapshot.helpers.js";

const D = (value: string) => new Prisma.Decimal(value);
const rows = [
  { accountId: "cash", code: "1000", name: "Cash", accountType: "ASSET" as const,
    openingDebits: D("200.00"), openingCredits: D("0.00"), periodDebits: D("100.00"), periodCredits: D("30.00") },
  { accountId: "revenue", code: "4000", name: "Fees", accountType: "REVENUE" as const,
    openingDebits: D("0.00"), openingCredits: D("200.00"), periodDebits: D("30.00"), periodCredits: D("100.00") },
];

describe("P4 period snapshots", () => {
  it("preserves signed opening/closing balances by account type", () => {
    const result = buildPeriodSnapshot(rows);
    expect(result.lines[0]).toMatchObject({ opening: "200.00", debit: "100.00", credit: "30.00", closing: "270.00" });
    expect(result.lines[1]).toMatchObject({ opening: "200.00", debit: "30.00", credit: "100.00", closing: "270.00" });
    expect(result.totalDebits).toBe("130.00");
    expect(result.totalCredits).toBe("130.00");
  });

  it("hashes the same canonical snapshot regardless of account order", () => {
    expect(buildPeriodSnapshot(rows).contentHash).toBe(buildPeriodSnapshot([...rows].reverse()).contentHash);
  });

  it("blocks unbalanced snapshots and duplicate accounts", () => {
    expect(() => buildPeriodSnapshot([rows[0]!])).toThrow(/unbalanced/);
    expect(() => buildPeriodSnapshot([...rows, rows[0]!])).toThrow(/duplicate/);
  });
});
