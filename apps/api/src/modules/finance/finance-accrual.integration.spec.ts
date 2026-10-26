/**
 * Real PostgreSQL integration coverage for guarded accrual transition.
 * Every run creates an isolated school; tests never execute on non-test DBs.
 */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinanceService as FinanceServiceType } from "./finance.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => {
  try { return /test/i.test(new URL(url).pathname); } catch { return false; }
})();
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!enabled)("accrual cutover (database)", { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let finance: FinanceServiceType;
  const run = `accrual-${Date.now().toString(36)}`;
  let schoolId = "";
  let userId = "";
  let yearId = "";
  let termId = "";
  let classId = "";
  let studentId = "";
  let legacyBillId = "";
  let structureId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma } = await import("../../prisma/prisma.client.js");
    const { FinanceService } = await import("./finance.service.js");
    db = prisma;
    finance = new FinanceService({ client: db } as never);
    const org = await db.organization.create({ data: { id: run + "-org", name: run, slug: run } });
    schoolId = (await db.school.create({ data: { organizationId: org.id, code: run.toUpperCase(), subdomain: run, name: run } })).id;
    userId = (await db.user.create({ data: { id: run + "-acc", name: "Cutover accountant", email: run + "-acc@example.test" } })).id;
    const year = await db.academicYear.create({
      data: { schoolId, name: "2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), isCurrent: true },
    });
    yearId = year.id;
    termId = (await db.term.create({
      data: { academicYearId: yearId, name: "Term 3", termNumber: 3, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"), isCurrent: true },
    })).id;
    classId = (await db.class.create({ data: { schoolId, academicYearId: yearId, name: "JHS 1", level: "JHS1" } })).id;
    const studentUser = await db.user.create({ data: { id: run + "-stu", name: "Student", email: run + "-stu@example.test" } });
    const profile = await db.userProfile.create({ data: { userId: studentUser.id, firstName: "Test", lastName: "Student" } });
    studentId = (await db.student.create({
      data: { schoolId, profileId: profile.id, studentId: run + "-student", classId, outstandingBalance: new Prisma.Decimal("100.00") },
    })).id;
    await db.enrollment.create({ data: { studentId, classId, academicYearId: yearId, termId, status: "ACTIVE" } });
    legacyBillId = (await db.bill.create({
      data: {
        schoolId, studentId, academicYearId: yearId, termId, billNumber: run + "-old",
        grossAmount: "100", totalAmount: "100", balanceAmount: "100",
        items: { create: [{ description: "Legacy fee", amount: "100", totalAmount: "100", balanceAmount: "100" }] },
      },
    })).id;
    structureId = (await db.feeStructure.create({
      data: { schoolId, name: "Current fees", items: { create: [{ name: "Tuition earned on invoice", amount: "50" }] } },
    })).id;
  });

  afterAll(async () => {
    if (!db || !schoolId) return;
    const quiet = (p: Promise<unknown>) => p.catch(() => undefined);
    await quiet(db.auditLog.deleteMany({ where: { schoolId } }));
    await quiet(db.paymentBillAllocation.deleteMany({ where: { schoolId } }));
    await quiet(db.payment.deleteMany({ where: { schoolId } }));
    await quiet(db.transaction.deleteMany({ where: { schoolId } }));
    await quiet(db.financeAccrualState.deleteMany({ where: { schoolId } }));
    await quiet(db.chartAccount.deleteMany({ where: { schoolId } }));
    await quiet(db.billCarryForward.deleteMany({ where: { schoolId } }));
    await quiet(db.bill.deleteMany({ where: { schoolId } }));
    await quiet(db.enrollment.deleteMany({ where: { academicYearId: yearId } }));
    await quiet(db.student.deleteMany({ where: { schoolId } }));
    await quiet(db.feeStructure.deleteMany({ where: { schoolId } }));
    await quiet(db.class.deleteMany({ where: { schoolId } }));
    await quiet(db.term.deleteMany({ where: { academicYearId: yearId } }));
    await quiet(db.academicYear.deleteMany({ where: { schoolId } }));
    await quiet(db.school.deleteMany({ where: { id: schoolId } }));
    await quiet(db.organization.deleteMany({ where: { id: run + "-org" } }));
    await quiet(db.userProfile.deleteMany({ where: { userId: run + "-stu" } }));
    await quiet(db.user.deleteMany({ where: { id: { in: [userId, run + "-stu"] } } }));
    await db.$disconnect();
  });

  it("blocks activation when a stale opening amount is supplied", async () => {
    const preflight = await finance.getAccrualCutoverPreflight(schoolId);
    expect(preflight.canActivate).toBe(true);
    expect(preflight.expectedOpeningReceivables).toBe("100.00");
    await expect(finance.activateAccrualCutover(schoolId, userId, {
      approvalReference: "OWNER-APPROVAL-001",
      expectedOpeningReceivables: "99.99",
      confirmInvoiceRevenuePolicy: true,
    })).rejects.toThrow(/Opening receivables/i);
    expect(await db.financeAccrualState.count({ where: { schoolId } })).toBe(0);
  });

  it("posts legacy opening AR once, invoices new earned fees, clears AR on receipt and restores AR on reversal", async () => {
    const activated = await finance.activateAccrualCutover(schoolId, userId, {
      approvalReference: "OWNER-APPROVAL-002",
      expectedOpeningReceivables: "100.00",
      confirmInvoiceRevenuePolicy: true,
    });
    expect(activated.openingReceivables).toBe("100.00");
    await expect(finance.activateAccrualCutover(schoolId, userId, {
      approvalReference: "OWNER-APPROVAL-003",
      expectedOpeningReceivables: "100.00",
      confirmInvoiceRevenuePolicy: true,
    })).rejects.toThrow(/already active/i);

    const bills = await finance.generateBills(schoolId, {
      academicYearId: yearId, termId, classId, feeStructureId: structureId,
    } as never, userId);
    expect(bills.count).toBe(1);

    const arAccount = await db.chartAccount.findFirstOrThrow({
      where: { schoolId, category: "ACCOUNTS_RECEIVABLE", accountType: "ASSET" },
    });
    expect(arAccount.balance.toFixed(2)).toBe("150.00");
    const receipt = await finance.recordPayment(schoolId, userId, {
      studentId, billId: legacyBillId, amount: 30,
      paymentMethod: "CASH", paymentDate: today(),
    } as never);
    const refreshed = await db.chartAccount.findUniqueOrThrow({ where: { id: arAccount.id } });
    expect(refreshed.balance.toFixed(2)).toBe("120.00");
    const journal = await db.transaction.findUniqueOrThrow({ where: { id: receipt.transactionId! } });
    expect(journal.creditAccountId).toBe(arAccount.id);

    await finance.reversePayment(schoolId, userId, receipt.id, { kind: "VOID", reason: "Cutover regression" });
    expect((await db.chartAccount.findUniqueOrThrow({ where: { id: arAccount.id } })).balance.toFixed(2)).toBe("150.00");
    const current = await finance.getReceivablesCloseReadiness(schoolId);
    expect(current.openInvoices).toBe("150.00");
    expect(current.journalReceivables).toBe("150.00");
  });

  it("rejects backdated receipts after cutover", async () => {
    await expect(finance.recordPayment(schoolId, userId, {
      studentId, billId: legacyBillId, amount: 1,
      paymentMethod: "CASH", paymentDate: yesterday(),
    } as never)).rejects.toThrow(/backdate receipts/i);
  });
});
