import { describe, expect, it, vi } from "vitest";
import { FinancePeriodPreparationService } from "./finance-period-preparation.service.js";

function makeService() {
  const db = {
    financeSettings: { findUnique: vi.fn(async () => null) },
    financeAccrualState: { findUnique: vi.fn(async () => null) },
    financeBillAdjustment: { count: vi.fn(async () => 0) },
    payrollRecord: { count: vi.fn(async () => 0) },
    financeAccountingPeriod: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({
        id: "period-1", schoolId: "s1", status: "OPEN",
        startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-09-30T00:00:00Z"),
      })),
    },
    financePeriodClosingRun: {
      create: vi.fn(async (args: { data: { checks: { create: Array<{ key: string }> } } }) => ({
        id: "run-1", checks: args.data.checks.create,
      })),
    },
    $executeRaw: vi.fn(async () => 1),
  };
  const prisma = { client: { ...db, $transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(db)) } };
  const ledger = { check: vi.fn(async () => ({
    I1: { status: "PASS", debits: "100.00", credits: "100.00" },
    I2: { status: "PASS", discrepancies: [] },
    I3: { status: "PASS", sourceCount: 1, journalCount: 1, invalidJournalPairs: 0 },
  })) };
  const finance = { getReceivablesCloseReadiness: vi.fn(async () => ({
    closeReady: true, asOf: "2026-10-26", basis: "CURRENT_UNCLOSED", checks: [],
  })) };
  return {
    service: new FinancePeriodPreparationService(prisma as never, ledger as never, finance as never),
    db, prisma, ledger, finance,
  };
}

describe("P4 close preparation", () => {
  it("never treats P0 passing as sufficient evidence to close a period", async () => {
    const { service } = makeService();
    const report = await service.readiness("s1", 2026, 9);
    expect(report.canClose).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.checks.find(c => c.key === "I1")?.result).toBe("PASS");
    expect(report.checks.find(c => c.key === "P2_LEDGER")?.result).toBe("FAIL");
    expect(report.checks.find(c => c.key === "P3_REVENUE")?.result).toBe("FAIL");
    expect(report.checks.find(c => c.key === "P5_RECONCILIATIONS")?.result).toBe("FAIL");
  });

  it("persists an OPEN period and checklist without setting CLOSED or issuing a snapshot", async () => {
    const { service, db, prisma } = makeService();
    const result = await service.prepare("s1", "accountant", 2026, 9);
    expect(result.canClose).toBe(false);
    expect(result.period.status).toBe("OPEN");
    expect(db.financeAccountingPeriod.upsert).toHaveBeenCalledOnce();
    expect(db.financePeriodClosingRun.create).toHaveBeenCalledOnce();
    expect(prisma.client.$transaction).toHaveBeenCalledOnce();
  });

  it("rejects invalid months and incomplete future periods", async () => {
    const { service } = makeService();
    await expect(service.readiness("s1", 2026, 13)).rejects.toThrow(/valid accounting month/);
    await expect(service.readiness("s1", 2100, 12)).rejects.toThrow(/final day/);
  });
});
