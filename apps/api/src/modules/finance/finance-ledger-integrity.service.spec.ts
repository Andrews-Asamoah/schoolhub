import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { FinanceLedgerIntegrityService } from "./finance-ledger-integrity.service.js";

const D = (amount: string) => new Prisma.Decimal(amount);

function makeService({ invalidAmounts = 0, selfPairedTransactions = 0, cashBalance = "100.00", invalidJournalPairs = 0 } = {}) {
  const tx = {
    chartAccount: {
      findMany: vi.fn(async () => [
        { id: "cash", accountType: "ASSET", balance: D(cashBalance) },
        { id: "revenue", accountType: "REVENUE", balance: D("100.00") },
      ]),
    },
    transaction: {
      groupBy: vi.fn()
        .mockResolvedValueOnce([{ debitAccountId: "cash", _sum: { amount: D("100.00") } }])
        .mockResolvedValueOnce([{ creditAccountId: "revenue", _sum: { amount: D("100.00") } }]),
      count: vi.fn(async () => invalidAmounts),
    },
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ count: selfPairedTransactions }])
      .mockImplementation(async () => [{
        sourceCount: 1n, journalCount: 1n, invalidCount: BigInt(invalidJournalPairs),
      }]),
  };
  const db = { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
  const service = new FinanceLedgerIntegrityService({ client: db } as never);
  return { service, db, tx };
}

describe("P0 ledger invariants", () => {
  it("checks both posting movements and cached account balances in one consistent snapshot", async () => {
    const { service, db } = makeService();
    const result = await service.check("school-1");
    expect(result.I1.status).toBe("PASS");
    expect(result.I2.status).toBe("PASS");
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  it("rejects invalid amounts even though debits and credits still sum equally", async () => {
    const { service } = makeService({ invalidAmounts: 2 });
    const result = await service.check("school-1");
    expect(result.I1.status).toBe("FAIL");
    expect(result.I1.invalidAmounts).toBe(2);
  });

  it("rejects a transaction whose debit and credit accounts are identical", async () => {
    const { service } = makeService({ selfPairedTransactions: 1 });
    const result = await service.check("school-1");
    expect(result.I1.status).toBe("FAIL");
    expect(result.I1.selfPairedTransactions).toBe(1);
  });

  it("flags missing and mismatched immutable journal entries (I3)", async () => {
    const { service } = makeService({ invalidJournalPairs: 1 });
    const report = await service.check("school-1");
    expect(report.I1.status).toBe("PASS");
    expect(report.I2.status).toBe("PASS");
    expect(report.I3.status).toBe("FAIL");
    expect(report.I3.invalidJournalPairs).toBe(1);
  });

  it("flags cached balances that differ from posting-derived balances", async () => {
    const { service } = makeService({ cashBalance: "99.99" });
    const result = await service.check("school-1");
    expect(result.I1.status).toBe("PASS");
    expect(result.I2.status).toBe("FAIL");
    expect(result.I2.discrepancies[0]?.difference).toBe("0.01");
  });
});
