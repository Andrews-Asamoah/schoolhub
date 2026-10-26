import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { FinanceRevenueAdjustmentsService } from "./finance-revenue-adjustments.service.js";

const D = (value: string) => new Prisma.Decimal(value);
const input = {
  billId: "bill-1", kind: "CREDIT_NOTE" as const, reasonCode: "OVERCHARGE",
  reason: "Accidental extra tuition charge", effectiveDate: "2026-10-20",
  lines: [{ billItemId: "item-1", amount: "20.00" }],
};

function fixture(overrides: { reserved?: string; itemBalance?: string; school?: string; lockedThrough?: Date | null } = {}) {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    bill: {
      findFirst: vi.fn(async () => overrides.school === "other" ? null : {
        id: "bill-1", schoolId: "s1", studentId: "student-1",
        billType: "INVOICE", status: "PARTIALLY_PAID", balanceAmount: D("100.00"),
        items: [{ id: "item-1", balanceAmount: D(overrides.itemBalance ?? "100.00") }],
      }),
    },
    financePeriodLock: { findUnique: vi.fn(async () => overrides.lockedThrough ? { lockedThrough: overrides.lockedThrough } : null) },
    financeBillAdjustmentLine: { findMany: vi.fn(async () => overrides.reserved ? [{ billItemId: "item-1", amount: D(overrides.reserved) }] : []) },
    financeBillAdjustment: {
      findFirst: vi.fn(async () => ({ adjustmentNumber: "ADJ-2026-000023" })),
      create: vi.fn(async (args: { data: unknown }) => args.data),
    },
  };
  const db = { $transaction: vi.fn(async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx)) };
  return { service: new FinanceRevenueAdjustmentsService({ client: db } as never), tx, db };
}

describe("P3 safeguarded adjustment drafting", () => {
  it("creates a draft that does not touch bills, students or journals", async () => {
    const { service, tx, db } = fixture();
    const created = await service.createDraft("s1", "actor1", input);
    expect(created).toMatchObject({
      schoolId: "s1", status: "DRAFT", adjustmentNumber: "ADJ-2026-000024",
      studentId: "student-1", amount: D("20.00"),
    });
    expect(tx.financeBillAdjustment.create).toHaveBeenCalledOnce();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it("rejects attempts to adjust another school's invoice", async () => {
    const { service } = fixture({ school: "other" });
    await expect(service.createDraft("s1", "actor1", input)).rejects.toThrow(/not found/i);
  });

  it("rejects duplicate items and non-monetary values before reaching the database", async () => {
    const { service, db } = fixture();
    await expect(service.createDraft("s1", "actor1", {
      ...input, lines: [...input.lines, ...input.lines],
    })).rejects.toThrow(/only occur once/);
    await expect(service.createDraft("s1", "actor1", {
      ...input, lines: [{ billItemId: "item-1", amount: "0.001" }],
    })).rejects.toThrow(/two decimals/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects drafts that exceed existing reservations or locked dates", async () => {
    const { service } = fixture({ reserved: "85.00" });
    await expect(service.createDraft("s1", "actor1", input)).rejects.toThrow(/unreserved/);
    const locked = fixture({ lockedThrough: new Date("2026-10-20T00:00:00Z") });
    await expect(locked.service.createDraft("s1", "actor1", input)).rejects.toThrow(/locked/);
  });
});
