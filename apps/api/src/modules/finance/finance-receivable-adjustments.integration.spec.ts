import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinanceRevenueAdjustmentsService as DraftService } from "./finance-revenue-adjustments.service.js";
import type { FinanceReceivableAdjustmentsService as PostingService } from "./finance-receivable-adjustments.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();
const date = () => new Date().toISOString().slice(0,10);
const D = (v: string) => new Prisma.Decimal(v);

describe.skipIf(!enabled)("P3 approved receivable adjustments (PostgreSQL)", { timeout: 90000 }, () => {
  let db: PrismaClient, draft: DraftService, approved: PostingService;
  const run = "p3-" + Date.now().toString(36);
  const accountantId = run + "-accountant", ownerId = run + "-owner", studentUserId = run + "-student-user";
  let schoolId = "", yearId = "", classId = "", studentId = "", billId = "", itemId = "";
  let arId = "", revenueId = "", badDebtId = "";
  let creditId = "", writeoffId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma } = await import("../../prisma/prisma.client.js");
    const { FinancePostingService } = await import("./finance-posting.service.js");
    const { FinanceAccountPurposeService } = await import("./finance-account-purpose.service.js");
    const { FinanceRevenueAdjustmentsService } = await import("./finance-revenue-adjustments.service.js");
    const { FinanceReceivableAdjustmentsService } = await import("./finance-receivable-adjustments.service.js");
    db = prisma;
    const posting = new FinancePostingService({ client: db } as never);
    const accounts = new FinanceAccountPurposeService({ client: db } as never);
    draft = new FinanceRevenueAdjustmentsService({ client: db } as never);
    approved = new FinanceReceivableAdjustmentsService({ client: db } as never, posting, accounts);

    await db.organization.create({ data: { id: run + "-org", name: run, slug: run } });
    schoolId = (await db.school.create({
      data: { organizationId: run + "-org", name: run, subdomain: run, code: run.toUpperCase() },
    })).id;
    for (const id of [accountantId, ownerId, studentUserId]) {
      await db.user.create({ data: { id, name: id, email: id + "@example.test" } });
    }
    const profile = await db.userProfile.create({
      data: { userId: studentUserId, firstName: "Test", lastName: "Student" },
    });
    yearId = (await db.academicYear.create({
      data: { schoolId, name: run, startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"), isCurrent: true },
    })).id;
    classId = (await db.class.create({
      data: { schoolId, academicYearId: yearId, name: "JHS 1", level: "JHS1" },
    })).id;
    studentId = (await db.student.create({
      data: { schoolId, profileId: profile.id, studentId: run + "-st",
        classId, outstandingBalance: D("100.00") },
    })).id;
    billId = (await db.bill.create({
      data: {
        schoolId, studentId, academicYearId: yearId, billNumber: run + "-INV",
        totalAmount: "100", grossAmount: "100", balanceAmount: "100",
        items: { create: [{
          description: "Tuition earned at invoice", amount: "100",
          totalAmount: "100", balanceAmount: "100",
        }] },
      },
    })).id;
    itemId = (await db.billItem.findFirstOrThrow({ where: { billId } })).id;
    arId = (await db.chartAccount.create({ data: {
      schoolId, code: "1200", name: "Student AR",
      accountType: "ASSET", category: "ACCOUNTS_RECEIVABLE",
    } })).id;
    revenueId = (await db.chartAccount.create({ data: {
      schoolId, code: "4000", name: "Fee revenue",
      accountType: "REVENUE", category: "SCHOOL_FEES",
    } })).id;
    badDebtId = (await db.chartAccount.create({ data: {
      schoolId, code: "6000", name: "Bad debts",
      accountType: "EXPENSE", category: "OTHER_EXPENSE",
    } })).id;
    await db.financeSettings.create({ data: {
      schoolId, p3AdjustmentsEnabled: false,
      revenuePolicyApprovedAt: new Date(), revenuePolicyApprovedBy: ownerId,
    } });
    await db.financeAccrualState.create({ data: {
      schoolId, activatedAt: new Date(Date.now()-86400000),
      activatedById: ownerId, approvalReference: "PILOT-REVIEWED",
      openingReceivables: D("0.00"),
    } });
    for (const item of [
      { purpose: "STUDENT_RECEIVABLE" as const, accountId: arId },
      { purpose: "FEE_REVENUE" as const, accountId: revenueId },
      { purpose: "BAD_DEBT_EXPENSE" as const, accountId: badDebtId },
    ]) {
      await db.financeAccountMapping.create({ data: {
        schoolId, ...item, effectiveFrom: new Date(date() + "T00:00:00.000Z"),
        sourceNote: "Account and accounting policy independently reviewed",
        createdById: accountantId, approvedById: ownerId, approvedAt: new Date(),
        status: "ACTIVE",
      } });
    }
    await db.$transaction(tx => posting.post(tx, {
      schoolId, date: new Date(), description: "Recognised tuition invoice",
      debitAccountId: arId, creditAccountId: revenueId,
      amount: D("100.00"), transactionType: "INCOME",
      referenceType: "BILL", referenceId: billId,
    }));
  });

  afterAll(async () => {
    if (!db || !schoolId) return;
    try {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('app.finance_archive_purge', 'on', true)`;
        await tx.auditLog.deleteMany({ where: { schoolId } });
        await tx.financeApprovalRequest.deleteMany({ where: { schoolId } });
        await tx.financeApprovalPolicy.deleteMany({ where: { schoolId } });
        const adjustments = await tx.financeBillAdjustment.findMany({ where: { schoolId }, select: { id: true } });
        await tx.financeBillAdjustmentLine.deleteMany({ where: { adjustmentId: { in: adjustments.map(x => x.id) } } });
        await tx.financeBillAdjustment.deleteMany({ where: { schoolId } });
        await tx.financeAccountMapping.deleteMany({ where: { schoolId } });
        const journals = await tx.financeJournalEntry.findMany({ where: { schoolId }, select: { id: true } });
        await tx.financeJournalLine.deleteMany({ where: { entryId: { in: journals.map(x => x.id) } } });
        await tx.financeJournalEntry.deleteMany({ where: { schoolId } });
        await tx.transaction.deleteMany({ where: { schoolId } });
        await tx.financeAccrualState.deleteMany({ where: { schoolId } });
        await tx.financeSettings.deleteMany({ where: { schoolId } });
        await tx.billItem.deleteMany({ where: { billId } });
        await tx.bill.deleteMany({ where: { schoolId } });
        await tx.student.deleteMany({ where: { schoolId } });
        await tx.class.deleteMany({ where: { schoolId } });
        await tx.academicYear.deleteMany({ where: { schoolId } });
        await tx.chartAccount.deleteMany({ where: { schoolId } });
        await tx.school.deleteMany({ where: { id: schoolId } });
        await tx.organization.deleteMany({ where: { id: run + "-org" } });
        await tx.userProfile.deleteMany({ where: { userId: studentUserId } });
        await tx.user.deleteMany({ where: { id: { in: [accountantId, ownerId, studentUserId] } } });
      });
    } finally { await db.$disconnect(); }
  });

  it("requires a different authorised owner or headteacher to approve a credit note", async () => {
    const credit = await draft.createDraft(schoolId, accountantId, {
      billId, kind: "CREDIT_NOTE", reasonCode: "OVERCHARGE",
      reason: "Tuition was accidentally overcharged", effectiveDate: date(),
      lines: [{ billItemId: itemId, amount: "30.00" }],
    });
    creditId = credit.id;
    await approved.submit(schoolId, accountantId, creditId);
    await expect(approved.decide(schoolId, accountantId, "owner", false,
      creditId, "APPROVED", "I reviewed the invoice")).rejects.toThrow(/preparer/i);
    await expect(approved.decide(schoolId, ownerId, "accountant", false,
      creditId, "APPROVED", "I reviewed the invoice")).rejects.toThrow(/owner or headteacher/i);
    await approved.decide(schoolId, ownerId, "owner", false,
      creditId, "APPROVED", "I independently reviewed the invoice");
  });

  it("fails closed until P3 is explicitly enabled, then posts the credit and AR reduction exactly once", async () => {
    await expect(approved.post(schoolId, accountantId, creditId)).rejects.toThrow(/explicit activation/);
    expect((await db.bill.findUniqueOrThrow({ where: { id: billId } })).balanceAmount.toFixed(2)).toBe("100.00");
    await db.financeSettings.update({ where: { schoolId }, data: { p3AdjustmentsEnabled: true } });
    expect(await approved.post(schoolId, accountantId, creditId)).toMatchObject({
      status: "POSTED", alreadyPosted: false,
    });
    expect(await approved.post(schoolId, accountantId, creditId)).toMatchObject({ alreadyPosted: true });
    expect((await db.bill.findUniqueOrThrow({ where: { id: billId } })).balanceAmount.toFixed(2)).toBe("70.00");
    expect((await db.billItem.findUniqueOrThrow({ where: { id: itemId } })).creditedAmount.toFixed(2)).toBe("30.00");
    expect((await db.student.findUniqueOrThrow({ where: { id: studentId } })).outstandingBalance.toFixed(2)).toBe("70.00");
  });

  it("posts an approved bad-debt write-off without changing receipt records or classifying the invoice as PAID", async () => {
    const writeoff = await draft.createDraft(schoolId, accountantId, {
      billId, kind: "WRITE_OFF", reasonCode: "UNCOLLECTIBLE",
      reason: "Reviewed aged debt declared uncollectible", effectiveDate: date(),
      lines: [{ billItemId: itemId, amount: "70.00" }],
    });
    writeoffId = writeoff.id;
    await approved.submit(schoolId, accountantId, writeoffId);
    await approved.decide(schoolId, ownerId, "owner", false,
      writeoffId, "APPROVED", "Owner approved evidence of uncollectibility");
    expect((await approved.post(schoolId, accountantId, writeoffId)).status).toBe("POSTED");
    const bill = await db.bill.findUniqueOrThrow({ where: { id: billId } });
    expect(bill.status).toBe("ADJUSTED");
    expect(bill.creditedAmount.toFixed(2)).toBe("30.00");
    expect(bill.writtenOffAmount.toFixed(2)).toBe("70.00");
    expect(bill.balanceAmount.toFixed(2)).toBe("0.00");
    expect(bill.paidAmount.toFixed(2)).toBe("0.00");
    expect((await db.billItem.findUniqueOrThrow({ where: { id: itemId } })).status).toBe("ADJUSTED");
    expect((await db.student.findUniqueOrThrow({ where: { id: studentId } })).outstandingBalance.toFixed(2)).toBe("0.00");
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: arId } })).balance.toFixed(2)).toBe("0.00");
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: revenueId } })).balance.toFixed(2)).toBe("70.00");
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: badDebtId } })).balance.toFixed(2)).toBe("70.00");
    expect(await db.payment.count({ where: { schoolId } })).toBe(0);
    const { FinanceLedgerIntegrityService } = await import("./finance-ledger-integrity.service.js");
    const report = await new FinanceLedgerIntegrityService({ client: db } as never).check(schoolId);
    expect([report.I1.status, report.I2.status, report.I3.status]).toEqual(["PASS","PASS","PASS"]);
  });
});
