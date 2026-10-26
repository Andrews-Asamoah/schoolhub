/** P2 database integration: runs only against a database whose name includes test. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinancePostingService as PostingServiceType } from "./finance-posting.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();
const D = (s: string) => new Prisma.Decimal(s);

describe.skipIf(!enabled)("P2 immutable paired journals (PostgreSQL)", { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let posting: PostingServiceType;
  const run = "journal-" + Date.now().toString(36);
  let schoolId = "";
  let debitId = "";
  let creditId = "";
  let postedId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma } = await import("../../prisma/prisma.client.js");
    const { FinancePostingService } = await import("./finance-posting.service.js");
    db = prisma;
    posting = new FinancePostingService({ client: db } as never);
    await db.organization.create({ data: { id: run + "-org", name: run, slug: run } });
    schoolId = (await db.school.create({
      data: { organizationId: run + "-org", code: run.toUpperCase(), subdomain: run, name: run },
    })).id;
    debitId = (await db.chartAccount.create({
      data: { schoolId, name: "Cash", code: "1000", accountType: "ASSET", category: "CASH" },
    })).id;
    creditId = (await db.chartAccount.create({
      data: { schoolId, name: "Other revenue", code: "4000", accountType: "REVENUE", category: "OTHER_INCOME" },
    })).id;
  });

  afterAll(async () => {
    if (!db || !schoolId) return;
    try {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('app.finance_archive_purge', 'on', true)`;
        const entries = await tx.financeJournalEntry.findMany({ where: { schoolId }, select: { id: true } });
        await tx.financeJournalLine.deleteMany({ where: { entryId: { in: entries.map(e => e.id) } } });
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

  it("automatically creates two balanced, tenant-scoped lines in the posting transaction", async () => {
    const posted = await db.$transaction(tx => posting.post(tx, {
      schoolId, date: new Date(), description: "Term test fee", amount: D("100.25"),
      debitAccountId: debitId, creditAccountId: creditId, transactionType: "INCOME",
      referenceType: "TEST", referenceId: run,
    }));
    postedId = posted.id;
    const journal = await db.financeJournalEntry.findUniqueOrThrow({
      where: { transactionId: postedId }, include: { lines: true },
    });
    expect(journal.schoolId).toBe(schoolId);
    expect(journal.legacyBackfill).toBe(false);
    expect(journal.lines).toHaveLength(2);
    expect(journal.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ side: "DEBIT", accountId: debitId, amount: D("100.25") }),
      expect.objectContaining({ side: "CREDIT", accountId: creditId, amount: D("100.25") }),
    ]));
    const { FinanceLedgerIntegrityService } = await import("./finance-ledger-integrity.service.js");
    const report = await new FinanceLedgerIntegrityService({ client: db } as never).check(schoolId);
    expect(report.I1.status).toBe("PASS");
    expect(report.I2.status).toBe("PASS");
    expect(report.I3.status).toBe("PASS");
  });

  it("rejects rewriting or deleting posted source and journal records", async () => {
    const journal = await db.financeJournalEntry.findUniqueOrThrow({
      where: { transactionId: postedId }, include: { lines: true },
    });
    await expect(db.transaction.update({ where: { id: postedId }, data: { description: "Rewritten" } }))
      .rejects.toThrow(/immutable/i);
    await expect(db.financeJournalLine.update({
      where: { id: journal.lines[0]!.id }, data: { amount: D("1.00") },
    })).rejects.toThrow(/immutable/i);
    await expect(db.transaction.delete({ where: { id: postedId } })).rejects.toThrow(/immutable/i);
  });

  it("rejects source postings with a self-paired account even outside the service", async () => {
    await expect(db.transaction.create({
      data: {
        schoolId, transactionNumber: run + "-invalid", transactionDate: new Date(),
        description: "Invalid account pair", amount: D("1.00"),
        debitAccountId: debitId, creditAccountId: debitId, transactionType: "ADJUSTMENT",
      },
    })).rejects.toThrow(/different accounts|Invalid paired/i);
  });
});
