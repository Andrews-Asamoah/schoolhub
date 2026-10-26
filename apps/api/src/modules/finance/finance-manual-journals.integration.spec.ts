import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinanceManualJournalsService as ServiceType } from "./finance-manual-journals.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();
const today = () => new Date().toISOString().slice(0, 10);
const D = (value: string) => new Prisma.Decimal(value);

describe.skipIf(!enabled)("P2 manual journal lifecycle (PostgreSQL)", { timeout: 90_000 }, () => {
  let db: PrismaClient;
  let service: ServiceType;
  const run = "mjn-" + Date.now().toString(36);
  let schoolId = "";
  let cashId = "";
  let revenueId = "";
  let payableId = "";
  let originalId = "";
  let reverseId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma } = await import("../../prisma/prisma.client.js");
    const { FinanceManualJournalsService } = await import("./finance-manual-journals.service.js");
    const { FinancePostingService } = await import("./finance-posting.service.js");
    db = prisma;
    service = new FinanceManualJournalsService(
      { client: db } as never,
      new FinancePostingService({ client: db } as never),
    );
    await db.organization.create({ data: { id: run + "-org", name: run, slug: run } });
    schoolId = (await db.school.create({
      data: { organizationId: run + "-org", name: run, subdomain: run, code: run.toUpperCase() },
    })).id;
    cashId = (await db.chartAccount.create({
      data: { schoolId, code: "1000", name: "Cash", accountType: "ASSET", category: "CASH" },
    })).id;
    revenueId = (await db.chartAccount.create({
      data: { schoolId, code: "4000", name: "Tuition", accountType: "REVENUE", category: "SCHOOL_FEES" },
    })).id;
    payableId = (await db.chartAccount.create({
      data: { schoolId, code: "2000", name: "Payable", accountType: "LIABILITY", category: "ACCOUNTS_PAYABLE" },
    })).id;
  });

  afterAll(async () => {
    if (!db || !schoolId) return;
    try {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('app.finance_archive_purge', 'on', true)`;
        await tx.financeManualJournalPosting.deleteMany({ where: { journal: { schoolId } } });
        const journals = await tx.financeManualJournal.findMany({ where: { schoolId }, select: { id: true } });
        await tx.financeManualJournalLine.deleteMany({ where: { journalId: { in: journals.map(x => x.id) } } });
        await tx.financeManualJournal.deleteMany({ where: { schoolId, reversalOfId: { not: null } } });
        await tx.financeManualJournal.deleteMany({ where: { schoolId } });
        await tx.financeApprovalRequest.deleteMany({ where: { schoolId } });
        await tx.financeApprovalPolicy.deleteMany({ where: { schoolId } });
        const entries = await tx.financeJournalEntry.findMany({ where: { schoolId }, select: { id: true } });
        await tx.financeJournalLine.deleteMany({ where: { entryId: { in: entries.map(x => x.id) } } });
        await tx.financeJournalEntry.deleteMany({ where: { schoolId } });
        await tx.transaction.deleteMany({ where: { schoolId } });
        await tx.chartAccount.deleteMany({ where: { schoolId } });
        await tx.school.deleteMany({ where: { id: schoolId } });
        await tx.organization.deleteMany({ where: { id: run + "-org" } });
      });
    } finally {
      await db.$disconnect();
    }
  });

  it("rejects cross-school accounts and prevents duplicate idempotency keys", async () => {
    const draft = await service.create(schoolId, "accountant", {
      postingDate: today(), description: "Owner-approved manual fee adjustment",
      idempotencyKey: run + "-original",
      lines: [
        { accountId: cashId, side: "DEBIT", amount: "100.00" },
        { accountId: revenueId, side: "CREDIT", amount: "60.00" },
        { accountId: payableId, side: "CREDIT", amount: "40.00" },
      ],
    });
    originalId = draft.id;
    await expect(service.create(schoolId, "accountant", {
      postingDate: today(), description: "Owner-approved manual fee adjustment",
      idempotencyKey: run + "-original",
      lines: [{ accountId: cashId, side: "DEBIT", amount: "1.00" },
        { accountId: revenueId, side: "CREDIT", amount: "1.00" }],
    })).rejects.toThrow(/idempotency key/i);
    await expect(service.create(schoolId, "accountant", {
      postingDate: today(), description: "Cross-school journal disallowed",
      idempotencyKey: run + "-foreign",
      lines: [{ accountId: cashId, side: "DEBIT", amount: "1.00" },
        { accountId: "not-a-valid-school-account", side: "CREDIT", amount: "1.00" }],
    })).rejects.toThrow(/belong to this school/i);
  });

  it("requires independent maker-checker approval and freezes the submitted lines", async () => {
    await service.submit(schoolId, "accountant", originalId);
    await expect(service.decide(schoolId, "accountant", originalId,
      "accountant", false, "APPROVED", "I verified the journal")).rejects.toThrow(/owner or headteacher/i);
    await expect(service.decide(schoolId, "accountant", originalId,
      "owner", false, "APPROVED", "I verified the journal")).rejects.toThrow(/preparer may never approve/i);
    const line = (await service.get(schoolId, originalId)).lines[0]!;
    await expect(db.financeManualJournalLine.update({
      where: { id: line.id }, data: { amount: D("20.00") },
    })).rejects.toThrow(/cannot be changed/i);
    await service.decide(schoolId, "owner", originalId, "owner", false,
      "APPROVED", "Approved after independent review");
    await expect(service.post(schoolId, "owner", originalId)).rejects.toThrow(/approver cannot/i);
  });

  it("posts two immutable pairs atomically and remains idempotent", async () => {
    const result = await service.post(schoolId, "accountant", originalId);
    expect(result).toMatchObject({ status: "POSTED", postingCount: 2 });
    expect(await service.post(schoolId, "accountant", originalId)).toMatchObject({ alreadyPosted: true });
    const posted = await db.financeManualJournalPosting.findMany({ where: { journalId: originalId } });
    expect(posted).toHaveLength(2);
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: cashId } })).balance.toFixed(2)).toBe("100.00");
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: revenueId } })).balance.toFixed(2)).toBe("60.00");
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: payableId } })).balance.toFixed(2)).toBe("40.00");
    const { FinanceLedgerIntegrityService } = await import("./finance-ledger-integrity.service.js");
    const report = await new FinanceLedgerIntegrityService({ client: db } as never).check(schoolId);
    expect([report.I1.status, report.I2.status, report.I3.status]).toEqual(["PASS", "PASS", "PASS"]);
  });

  it("reverses with a fresh, independently approved posting and does not rewrite history", async () => {
    const reversal = await service.requestReversal(schoolId, "accountant", originalId, {
      postingDate: today(), reason: "Correcting an approved but erroneous journal",
      idempotencyKey: run + "-reversal",
    });
    reverseId = reversal.id;
    await expect(service.requestReversal(schoolId, "accountant", originalId, {
      postingDate: today(), reason: "A second reversal is forbidden", idempotencyKey: run + "-another",
    })).rejects.toThrow(/already exists/i);
    await service.submit(schoolId, "accountant", reverseId);
    await service.decide(schoolId, "owner", reverseId, "headteacher", false, "APPROVED", "Approved correction");
    expect((await service.post(schoolId, "accountant", reverseId)).status).toBe("POSTED");
    expect((await service.get(schoolId, originalId)).status).toBe("REVERSED");
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: cashId } })).balance.toFixed(2)).toBe("0.00");
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: revenueId } })).balance.toFixed(2)).toBe("0.00");
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: payableId } })).balance.toFixed(2)).toBe("0.00");
    expect(await db.transaction.count({ where: { schoolId } })).toBe(4);
  });
});
