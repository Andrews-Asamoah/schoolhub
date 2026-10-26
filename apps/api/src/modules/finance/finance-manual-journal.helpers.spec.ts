import { describe, expect, it } from "vitest";
import { prepareManualJournal, pairManualJournal } from "./finance-manual-journal.helpers.js";
const entries = [
  { accountId: "cash", side: "DEBIT" as const, amount: "100.00" },
  { accountId: "fees", side: "CREDIT" as const, amount: "60.00" },
  { accountId: "payable", side: "CREDIT" as const, amount: "40.00" },
];
describe("P2 manual journals", () => {
  it("pairs balanced multi-line entries without rounding or losing value", () => {
    const prepared = prepareManualJournal(entries);
    expect(prepared.total.toFixed(2)).toBe("100.00");
    expect(pairManualJournal(prepared.lines).map(item => [
      item.debitAccountId, item.creditAccountId, item.amount.toFixed(2),
    ])).toEqual([["cash", "fees", "60.00"], ["cash", "payable", "40.00"]]);
  });
  it("rejects unbalanced and malformed money", () => {
    expect(() => prepareManualJournal(entries.slice(0,2))).toThrow(/equal/);
    expect(() => prepareManualJournal([...entries.slice(0,2), {
      accountId: "payable", side: "CREDIT", amount: "40.001",
    }])).toThrow(/two-decimal/);
    expect(() => prepareManualJournal([entries[0]!, { accountId: "cash", side: "CREDIT", amount: "100.00" }]))
      .toThrow(/both sides/);
  });
  it("rejects a journal with only one side", () => {
    expect(() => prepareManualJournal([{ accountId: "cash", side: "DEBIT", amount: "1.00" },
      { accountId: "fees", side: "DEBIT", amount: "1.00" }])).toThrow(/debit and credit/);
  });
});
