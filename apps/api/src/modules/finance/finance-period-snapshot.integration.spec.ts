import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinancePeriodPreparationService as PreparationService } from "./finance-period-preparation.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();
const D = (x: string) => new Prisma.Decimal(x);

describe.skipIf(!enabled)("P4 as-of preview (PostgreSQL)", { timeout: 60000 }, () => {
  let db: PrismaClient, preview: PreparationService;
  const run = "asof-" + Date.now().toString(36);
  let schoolId = "", cashId = "", revenueId = "";
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma } = await import("../../prisma/prisma.client.js");
    const { FinancePostingService } = await import("./finance-posting.service.js");
    const { FinanceLedgerIntegrityService } = await import("./finance-ledger-integrity.service.js");
    const { FinancePeriodPreparationService } = await import("./finance-period-preparation.service.js");
    db = prisma;
    const posting = new FinancePostingService({ client: db } as never);
    preview = new FinancePeriodPreparationService(
      { client: db } as never,
      new FinanceLedgerIntegrityService({ client: db } as never),
      {} as never,
    );
    await db.organization.create({ data: { id: run + "-org", slug: run, name: run } });
    schoolId = (await db.school.create({
      data: { organizationId: run + "-org", name: run, subdomain: run, code: run.toUpperCase() },
    })).id;
    cashId = (await db.chartAccount.create({
      data: { schoolId, code: "1000", name: "Cash", category: "CASH", accountType: "ASSET" },
    })).id;
    revenueId = (await db.chartAccount.create({
      data: { schoolId, code: "4000", name: "Revenue", category: "OTHER_INCOME", accountType: "REVENUE" },
    })).id;
    for (const entry of [
      { date: new Date("2026-08-14T00:00:00Z"), amount: "20.00" },
      { date: new Date("2026-09-14T00:00:00Z"), amount: "30.00" },
    ]) {
      await db.$transaction(tx => posting.post(tx, {
        schoolId, date: entry.date, amount: D(entry.amount),
        description: "Posted period journal preview test",
        debitAccountId: cashId, creditAccountId: revenueId, transactionType: "INCOME",
      }));
    }
  });

  afterAll(async () => {
    if (!db || !schoolId) return;
    try {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('app.finance_archive_purge', 'on', true)`;
        const headers = await tx.financeJournalEntry.findMany({ where: { schoolId }, select: { id: true } });
        await tx.financeJournalLine.deleteMany({ where: { entryId: { in: headers.map(x => x.id) } } });
        await tx.financeJournalEntry.deleteMany({ where: { schoolId } });
        await tx.transaction.deleteMany({ where: { schoolId } });
        await tx.chartAccount.deleteMany({ where: { schoolId } });
        await tx.school.deleteMany({ where: { id: schoolId } });
        await tx.organization.deleteMany({ where: { id: run + "-org" } });
      });
    } finally { await db.$disconnect(); }
  });

  it("computes August movement and September historical opening without touching current account balances", async () => {
    const august = await preview.snapshotPreview(schoolId, 2026, 8);
    const september = await preview.snapshotPreview(schoolId, 2026, 9);
    expect(august.isApprovedClose).toBe(false);
    expect(august.isPersistedSnapshot).toBe(false);
    expect(august.totalDebits).toBe("20.00");
    expect(september.totalDebits).toBe("30.00");
    expect(september.totalCredits).toBe("30.00");
    expect(september.lines.find(x => x.accountId === cashId)).toMatchObject({
      opening: "20.00", debit: "30.00", credit: "0.00", closing: "50.00",
    });
    expect(september.lines.find(x => x.accountId === revenueId)).toMatchObject({
      opening: "20.00", debit: "0.00", credit: "30.00", closing: "50.00",
    });
    expect(september.contentHash).not.toBe(august.contentHash);
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: cashId } })).balance.toFixed(2)).toBe("50.00");
    expect(await db.financePeriodSnapshot.count({ where: { schoolId } })).toBe(0);
    expect(await db.financeAccountingPeriod.count({ where: { schoolId } })).toBe(0);
  });

  it("does not preview an incomplete current or future month", async () => {
    await expect(preview.snapshotPreview(schoolId, 2100, 12)).rejects.toThrow(/final day/);
  });
});
