import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { buildRunningStatementEntries, decodeReportingCursor, encodeReportingCursor, parseReportingDate } from "./finance-reporting.helpers.js";

describe("finance reporting helpers", () => {
  it("round-trips a stable keyset cursor", () => {
    const cursor = { id: "bill_2", timestamp: "2026-01-10T00:00:00.000Z" };
    expect(decodeReportingCursor(encodeReportingCursor(cursor))).toEqual(cursor);
  });

  it("rejects invalid cursors and dates", () => {
    expect(() => decodeReportingCursor("not-json")).toThrow();
    expect(() => parseReportingDate("2026-02-31", "date")).toThrow();
  });

  it("parses valid ISO date boundaries in UTC", () => {
    expect(parseReportingDate("2026-02-28", "from")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(parseReportingDate("2026-02-28", "to", true)?.toISOString()).toBe("2026-02-28T23:59:59.999Z");
    expect(() => parseReportingDate("2026-02-31", "from")).toThrow();
    expect(() => parseReportingDate("not-a-date", "from")).toThrow();
  });

  it("keeps a chronological running balance exact to cents", () => {
    const entries = buildRunningStatementEntries(new Prisma.Decimal("0.00"), [
      { id: "p", date: new Date("2026-01-03T00:00:00Z"), type: "RECEIPT", reference: "RCT-1", description: "Receipt", debit: new Prisma.Decimal("0"), credit: new Prisma.Decimal("0.10") },
      { id: "i", date: new Date("2026-01-01T00:00:00Z"), type: "INVOICE", reference: "INV-1", description: "Invoice", debit: new Prisma.Decimal("0.30"), credit: new Prisma.Decimal("0") },
      { id: "d", date: new Date("2026-01-01T00:00:00Z"), type: "DISCOUNT", reference: "INV-1", description: "Discount", debit: new Prisma.Decimal("0"), credit: new Prisma.Decimal("0.05") },
    ]);
    expect(entries.map((entry) => [entry.type, entry.balance])).toEqual([
      ["INVOICE", 0.3],
      ["DISCOUNT", 0.25],
      ["RECEIPT", 0.15],
    ]);
  });

  it("satisfies closing = opening + debits - credits across generated statements", () => {
    for (let index = 1; index <= 50; index += 1) {
      const opening = new Prisma.Decimal((index * 0.13).toFixed(2));
      const source = Array.from({ length: 10 }, (_, itemIndex) => ({
        id: `e-${itemIndex}`,
        date: new Date(Date.UTC(2026, 0, itemIndex + 1)),
        type: itemIndex % 3 === 0 ? "INVOICE" as const : itemIndex % 3 === 1 ? "RECEIPT" as const : "DISCOUNT" as const,
        reference: `R-${itemIndex}`,
        description: "generated",
        debit: itemIndex % 3 === 0 ? new Prisma.Decimal(((index + itemIndex) / 17).toFixed(2)) : new Prisma.Decimal("0"),
        credit: itemIndex % 3 === 0 ? new Prisma.Decimal("0") : new Prisma.Decimal(((index + itemIndex) / 19).toFixed(2)),
      }));
      const results = buildRunningStatementEntries(opening, source);
      const debit = source.reduce((sum, item) => sum.plus(item.debit), new Prisma.Decimal("0"));
      const credit = source.reduce((sum, item) => sum.plus(item.credit), new Prisma.Decimal("0"));
      const expected = Number(opening.plus(debit).minus(credit).toFixed(2));
      expect(results.at(-1)?.balance).toBe(expected);
    }
  });
});
