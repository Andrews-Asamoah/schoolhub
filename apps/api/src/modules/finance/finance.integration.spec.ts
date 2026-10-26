/**
 * Database-backed tests for the money-moving finance code.
 *
 * They run against a REAL PostgreSQL database and are skipped unless
 * TEST_DATABASE_URL is set. The database name must contain "test" so these
 * tests can never touch development data. See apps/api/TESTING.md.
 *
 *   TEST_DATABASE_URL=postgresql://user:pass@localhost:5433/schoolhub_test pnpm test
 *
 * Every run creates its own school and removes it afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinanceService as FinanceServiceType } from "./finance.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const dbName = (() => {
  try {
    return new URL(url).pathname.replace("/", "");
  } catch {
    return "";
  }
})();
const enabled = url !== "" && /test/i.test(dbName);

const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!enabled)("finance (database)", { timeout: 60_000 }, () => {
  let prisma: PrismaClient;
  let service: FinanceServiceType;
  const run = `t${Date.now().toString(36)}`;
  let schoolId = "";
  let userId = "";
  let yearId = "";
  let counter = 0;
  const createdUserIds: string[] = [];

  /** A student with one bill made of two items (60% and 40% of `total`). */
  async function studentWithBill(total = 1000) {
    counter += 1;
    const n = counter; // capture: fixtures are built in parallel by some tests
    const userRow = await prisma.user.create({
      data: { id: `${run}-su${n}`, name: `Student ${n}`, email: `${run}-s${n}@example.test` },
    });
    createdUserIds.push(userRow.id);
    const profile = await prisma.userProfile.create({
      data: { userId: userRow.id, firstName: "Test", lastName: `Student${n}` },
    });
    const student = await prisma.student.create({
      data: { profileId: profile.id, schoolId, studentId: `${run}-${n}`, outstandingBalance: total },
    });
    const first = total * 0.6;
    const second = total - first;
    const bill = await prisma.bill.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: yearId,
        billNumber: `TEST-${run}-${n}`,
        totalAmount: total,
        grossAmount: total,
        balanceAmount: total,
        items: {
          create: [
            { description: "Tuition", amount: first, totalAmount: first, balanceAmount: first },
            { description: "Boarding", amount: second, totalAmount: second, balanceAmount: second },
          ],
        },
      },
      include: { items: true },
    });
    return { student, bill };
  }

  const pay = (studentId: string, billId: string | undefined, amount: number, extra: Record<string, unknown> = {}) =>
    service.recordPayment(schoolId, userId, {
      studentId,
      billId,
      amount,
      paymentMethod: "CASH",
      paymentDate: day(0),
      ...extra,
    } as never);

  const balances = async () => {
    const accounts = await prisma.chartAccount.findMany({ where: { schoolId } });
    const byCategory = (category: string) =>
      accounts.filter((account) => account.category === category).reduce((sum, account) => sum + Number(account.balance), 0);
    return { cash: byCategory("CASH"), bank: byCategory("BANK"), income: byCategory("SCHOOL_FEES") };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url; // must be set before the Prisma client module loads
    const { prisma: client } = await import("../../prisma/prisma.client.js");
    const { FinanceService } = await import("./finance.service.js");
    const { FinancePostingService } = await import("./finance-posting.service.js");
    prisma = client;
    service = new FinanceService({ client } as never, new FinancePostingService({ client } as never));

    const org = await prisma.organization.create({ data: { id: `${run}-org`, name: `Test ${run}`, slug: `${run}-org` } });
    const school = await prisma.school.create({
      data: { organizationId: org.id, name: `Test School ${run}`, code: `${run}`.toUpperCase(), subdomain: run },
    });
    schoolId = school.id;
    const user = await prisma.user.create({ data: { id: `${run}-acct`, name: "Test Accountant", email: `${run}-acct@example.test` } });
    userId = user.id;
    createdUserIds.push(user.id);
    const year = await prisma.academicYear.create({
      data: { schoolId, name: `${run} year`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), isCurrent: true },
    });
    yearId = year.id;
  });

  afterAll(async () => {
    if (!prisma || !schoolId) return;
    const quiet = (promise: Promise<unknown>) => promise.catch(() => undefined);
    await quiet(prisma.auditLog.deleteMany({ where: { schoolId } }));
    await quiet(prisma.paymentBillAllocation.deleteMany({ where: { schoolId } }));
    await quiet(prisma.payment.deleteMany({ where: { schoolId } }));
    await quiet(prisma.transaction.deleteMany({ where: { schoolId } }));
    await quiet(prisma.chartAccount.deleteMany({ where: { schoolId } }));
    await quiet(prisma.billCarryForward.deleteMany({ where: { schoolId } }));
    await quiet(prisma.bill.deleteMany({ where: { schoolId } }));
    await quiet(prisma.student.deleteMany({ where: { schoolId } }));
    await quiet(prisma.financePeriodLock.deleteMany({ where: { schoolId } }));
    await quiet(prisma.academicYear.deleteMany({ where: { schoolId } }));
    await quiet(prisma.school.deleteMany({ where: { id: schoolId } }));
    await quiet(prisma.organization.deleteMany({ where: { id: `${run}-org` } }));
    await quiet(prisma.userProfile.deleteMany({ where: { userId: { in: createdUserIds } } }));
    await quiet(prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }));
    await prisma.$disconnect();
  });

  describe("recording a payment", () => {
    it("updates the bill, items, student balance, ledger and audit trail together", async () => {
      const { student, bill } = await studentWithBill(1000);
      const before = await balances();

      const payment = await pay(student.id, bill.id, 300);

      expect(payment.paymentNumber).toMatch(new RegExp(`^RCT-${new Date().getFullYear()}-\\d{5}$`));
      const updatedBill = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { items: true } });
      expect(Number(updatedBill.paidAmount)).toBe(300);
      expect(Number(updatedBill.balanceAmount)).toBe(700);
      expect(updatedBill.status).toBe("PARTIALLY_PAID");
      // FIFO: the 600 tuition item absorbs the whole 300 payment.
      const tuition = updatedBill.items.find((item) => item.description === "Tuition")!;
      expect(Number(tuition.balanceAmount)).toBe(300);
      expect(tuition.status).toBe("PARTIALLY_PAID");
      expect((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).outstandingBalance.toNumber()).toBe(700);

      const ledger = await prisma.transaction.findFirstOrThrow({ where: { schoolId, referenceId: payment.id } });
      expect(ledger.referenceType).toBe("PAYMENT");
      expect(Number(ledger.amount)).toBe(300);
      const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(stored.transactionId).toBe(ledger.id);
      const after = await balances();
      expect(after.cash - before.cash).toBe(300);
      expect(after.income - before.income).toBe(300);

      const audit = await prisma.auditLog.findFirst({ where: { schoolId, entityId: payment.id, action: "PAYMENT_RECORDED" } });
      expect(audit).not.toBeNull();
    });

    it("issues sequential receipt numbers", async () => {
      const { student, bill } = await studentWithBill(1000);
      const a = await pay(student.id, bill.id, 10);
      const b = await pay(student.id, bill.id, 10);
      const number = (value: string) => Number(value.split("-").pop());
      expect(number(b.paymentNumber)).toBe(number(a.paymentNumber) + 1);
    });

    it("sends electronic payments to the bank account, not cash", async () => {
      const { student, bill } = await studentWithBill(500);
      const before = await balances();
      await pay(student.id, bill.id, 100, { paymentMethod: "MOBILE_MONEY" });
      const after = await balances();
      expect(after.bank - before.bank).toBe(100);
      expect(after.cash - before.cash).toBe(0);
    });

    it("rejects an overpayment and writes nothing", async () => {
      const { student, bill } = await studentWithBill(500);
      const before = await prisma.payment.count({ where: { schoolId } });
      await expect(pay(student.id, bill.id, 500.01)).rejects.toThrow(/exceeds/i);
      expect(await prisma.payment.count({ where: { schoolId } })).toBe(before);
    });

    it("rejects amounts with more than two decimal places", async () => {
      const { student, bill } = await studentWithBill(500);
      await expect(pay(student.id, bill.id, 10.005)).rejects.toThrow(/two decimal/i);
    });

    it("will not record a payment against another student's bill", async () => {
      const a = await studentWithBill(500);
      const b = await studentWithBill(500);
      await expect(pay(a.student.id, b.bill.id, 50)).rejects.toThrow(/not found/i);
    });
  });

  describe("idempotency", () => {
    it("returns the same receipt when a request is retried with the same key", async () => {
      const { student, bill } = await studentWithBill(1000);
      const key = `${run}-key-replay`;
      const first = await pay(student.id, bill.id, 200, { idempotencyKey: key });
      const second = await pay(student.id, bill.id, 200, { idempotencyKey: key });
      expect(second.id).toBe(first.id);
      expect(await prisma.payment.count({ where: { schoolId, idempotencyKey: key } })).toBe(1);
      expect(Number((await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).paidAmount)).toBe(200);
    });

    it("refuses to reuse a key for a different payment", async () => {
      const { student, bill } = await studentWithBill(1000);
      const key = `${run}-key-conflict`;
      await pay(student.id, bill.id, 200, { idempotencyKey: key });
      await expect(pay(student.id, bill.id, 250, { idempotencyKey: key })).rejects.toThrow(/different payment/i);
    });

    it("records only one receipt when the same request arrives many times at once", async () => {
      const { student, bill } = await studentWithBill(1000);
      const key = `${run}-key-burst`;
      const results = await Promise.allSettled(Array.from({ length: 6 }, () => pay(student.id, bill.id, 100, { idempotencyKey: key })));
      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      expect(await prisma.payment.count({ where: { schoolId, idempotencyKey: key } })).toBe(1);
      expect(Number((await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).paidAmount)).toBe(100);
    });
  });

  describe("concurrency", () => {
    it("never overpays a bill when payments arrive at the same time", async () => {
      const { student, bill } = await studentWithBill(1000);
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => pay(student.id, bill.id, 300)));
      const ok = results.filter((result) => result.status === "fulfilled").length;
      expect(ok).toBe(3); // 3 x 300 fits in 1000; the other two must be refused
      const final = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
      expect(Number(final.paidAmount)).toBe(900);
      expect(Number(final.balanceAmount)).toBe(100);
      expect(await prisma.payment.count({ where: { billId: bill.id } })).toBe(3);
      const items = await prisma.billItem.findMany({ where: { billId: bill.id } });
      expect(items.reduce((sum, item) => sum + Number(item.balanceAmount), 0)).toBe(100);
    });

    it("gives every receipt a unique number under load", async () => {
      const { student, bill } = await studentWithBill(1000);
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => pay(student.id, bill.id, 10)));
      const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof pay>>> => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(10);
      expect(new Set(fulfilled.map((r) => r.value.paymentNumber)).size).toBe(10);
    });

    it("handles payments for many students at once without losing any", async () => {
      const students = await Promise.all(Array.from({ length: 4 }, () => studentWithBill(1000)));
      const attempts = students.flatMap(({ student, bill }) => Array.from({ length: 3 }, () => pay(student.id, bill.id, 100)));
      const results = await Promise.allSettled(attempts);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(0);
      const numbers = results.map((result) => (result as PromiseFulfilledResult<{ paymentNumber: string }>).value.paymentNumber);
      expect(new Set(numbers).size).toBe(12);
      for (const { bill } of students) {
        expect(Number((await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).paidAmount)).toBe(300);
      }
    });

    it("keeps concurrent payments and reversals on the same bill consistent", async () => {
      const { student, bill } = await studentWithBill(1000);
      const first = await pay(student.id, bill.id, 200);
      const results = await Promise.allSettled([
        service.reversePayment(schoolId, userId, first.id, { kind: "VOID", reason: "Concurrent reversal test case" }),
        pay(student.id, bill.id, 300),
        pay(student.id, bill.id, 300),
      ]);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(0);
      const final = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
      expect(Number(final.paidAmount)).toBe(600); // 200 reversed, two 300 payments kept
      expect((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).outstandingBalance.toNumber()).toBe(400);
    });

    it("keeps the ledger equal to the sum of receipts after concurrent payments", async () => {
      const { student, bill } = await studentWithBill(1000);
      const before = await balances();
      await Promise.allSettled(Array.from({ length: 6 }, () => pay(student.id, bill.id, 50)));
      const after = await balances();
      const paid = Number((await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).paidAmount);
      expect(paid).toBe(300);
      expect(after.cash - before.cash).toBe(paid);
      expect(after.income - before.income).toBe(paid);
    });
  });

  describe("reversing a payment", () => {
    it("restores the bill, student balance and ledger, and keeps the receipt on record", async () => {
      const { student, bill } = await studentWithBill(1000);
      const payment = await pay(student.id, bill.id, 400);
      const before = await balances();

      const reversed = await service.reversePayment(schoolId, userId, payment.id, { kind: "VOID", reason: "Entered against the wrong student" });

      expect(reversed.status).toBe("CANCELLED");
      expect(reversed.reversedAt).not.toBeNull();
      expect(reversed.reversalReason).toMatch(/wrong student/);
      const restored = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { items: true } });
      expect(Number(restored.paidAmount)).toBe(0);
      expect(Number(restored.balanceAmount)).toBe(1000);
      expect(restored.status).toBe("PENDING");
      expect(restored.items.every((item) => item.status === "UNPAID" && Number(item.paidAmount) === 0)).toBe(true);
      expect((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).outstandingBalance.toNumber()).toBe(1000);

      const after = await balances();
      expect(before.cash - after.cash).toBe(400);
      expect(before.income - after.income).toBe(400);
      const adjustment = await prisma.transaction.findFirstOrThrow({ where: { schoolId, referenceType: "PAYMENT_REVERSAL", referenceId: payment.id } });
      expect(adjustment.transactionType).toBe("ADJUSTMENT");
      expect(await prisma.payment.findUnique({ where: { id: payment.id } })).not.toBeNull();
    });

    it("refuses a reversal if persisted bill allocations differ from receipt amount", async () => {
      const { student, bill } = await studentWithBill(500);
      const payment = await pay(student.id, bill.id, 100);
      const allocation = await prisma.paymentBillAllocation.findFirstOrThrow({
        where: { paymentId: payment.id, schoolId },
      });
      const beforeBill = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
      const beforeStudent = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
      const beforeLedger = await balances();
      await prisma.paymentBillAllocation.update({
        where: { id: allocation.id },
        data: { amount: new Prisma.Decimal("99.99") },
      });
      try {
        await expect(
          service.reversePayment(schoolId, userId, payment.id, { kind: "VOID", reason: "Attempt to reverse an inconsistent receipt" }),
        ).rejects.toThrow(/do not reconcile/i);
        const afterBill = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
        const afterStudent = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
        expect(afterBill.paidAmount.toFixed(2)).toBe(beforeBill.paidAmount.toFixed(2));
        expect(afterStudent.outstandingBalance.toFixed(2)).toBe(beforeStudent.outstandingBalance.toFixed(2));
        expect(await balances()).toEqual(beforeLedger);
        expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("COMPLETED");
      } finally {
        await prisma.paymentBillAllocation.update({
          where: { id: allocation.id },
          data: { amount: allocation.amount },
        });
      }
    });

    it("refuses reversal postings while the current accounting period is closed", async () => {
      await service.setPeriodLock(schoolId, userId, true, { lockedThrough: null, reason: "Open books for test receipt" });
      const { student, bill } = await studentWithBill(500);
      const receipt = await pay(student.id, bill.id, 100);
      await service.setPeriodLock(schoolId, userId, false, { lockedThrough: day(0), reason: "Close current accounting period" });
      try {
        await expect(service.reversePayment(schoolId, userId, receipt.id, {
          kind: "VOID", reason: "Must not reverse within closed books",
        })).rejects.toThrow(/closed through/i);
        expect((await prisma.payment.findUniqueOrThrow({ where: { id: receipt.id } })).status).toBe("COMPLETED");
        expect((await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).paidAmount.toFixed(2)).toBe("100.00");
      } finally {
        await service.setPeriodLock(schoolId, userId, true, { lockedThrough: null, reason: "Restore open period for remaining integration tests" });
      }
    });

    it("cannot be reversed twice", async () => {
      const { student, bill } = await studentWithBill(1000);
      const payment = await pay(student.id, bill.id, 100);
      await service.reversePayment(schoolId, userId, payment.id, { kind: "REFUND", reason: "Money returned to parent" });
      await expect(
        service.reversePayment(schoolId, userId, payment.id, { kind: "VOID", reason: "Trying a second time here" }),
      ).rejects.toThrow(/already been reversed/i);
    });

    it("lets the bill be paid again after a reversal", async () => {
      const { student, bill } = await studentWithBill(500);
      const first = await pay(student.id, bill.id, 500);
      await service.reversePayment(schoolId, userId, first.id, { kind: "VOID", reason: "Cheque bounced at the bank" });
      await pay(student.id, bill.id, 500);
      const final = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
      expect(final.status).toBe("PAID");
      expect(Number(final.balanceAmount)).toBe(0);
    });

    it("does not reverse a payment that belongs to another school", async () => {
      const { student, bill } = await studentWithBill(500);
      const payment = await pay(student.id, bill.id, 100);
      await expect(
        service.reversePayment("some-other-school", userId, payment.id, { kind: "VOID", reason: "Should never be allowed" }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("closed periods and dates", () => {
    it("blocks posting into a closed period and allows later dates", async () => {
      const { student, bill } = await studentWithBill(1000);
      await service.setPeriodLock(schoolId, userId, false, { lockedThrough: day(-1), reason: "Month reconciled with the bank" });
      await expect(pay(student.id, bill.id, 50, { paymentDate: day(-5) })).rejects.toThrow(/closed through/i);
      await expect(pay(student.id, bill.id, 50, { paymentDate: day(-1) })).rejects.toThrow(/closed through/i);
      await expect(pay(student.id, bill.id, 50, { paymentDate: day(0) })).resolves.toBeDefined();
    });

    it("rejects future dates", async () => {
      const { student, bill } = await studentWithBill(1000);
      await expect(pay(student.id, bill.id, 50, { paymentDate: day(5) })).rejects.toThrow(/future/i);
    });

    it("still answers a retried request for a payment from a period that has since closed", async () => {
      await service.setPeriodLock(schoolId, userId, true, { lockedThrough: null, reason: "Reset for this test case" });
      const { student, bill } = await studentWithBill(1000);
      const key = `${run}-key-lock`;
      const first = await pay(student.id, bill.id, 100, { idempotencyKey: key, paymentDate: day(-3) });
      await service.setPeriodLock(schoolId, userId, false, { lockedThrough: day(-1), reason: "Closing the books today" });
      const replay = await pay(student.id, bill.id, 100, { idempotencyKey: key, paymentDate: day(-3) });
      expect(replay.id).toBe(first.id);
    });

    it("lets only a platform administrator reopen a closed period", async () => {
      await service.setPeriodLock(schoolId, userId, true, { lockedThrough: null, reason: "Reset for this test case" });
      await service.setPeriodLock(schoolId, userId, false, { lockedThrough: day(-2), reason: "Closing two days ago" });
      await expect(
        service.setPeriodLock(schoolId, userId, false, { lockedThrough: day(-10), reason: "Trying to move it back" }),
      ).rejects.toThrow(/platform administrator/i);
      await expect(
        service.setPeriodLock(schoolId, userId, false, { lockedThrough: null, reason: "Trying to reopen it all" }),
      ).rejects.toThrow(/platform administrator/i);
      const reopened = await service.setPeriodLock(schoolId, userId, true, { lockedThrough: null, reason: "Approved by support ticket" });
      expect(reopened.lockedThrough).toBeNull();
      const further = await service.setPeriodLock(schoolId, userId, false, { lockedThrough: day(-1), reason: "Closing again after fix" });
      expect(further.lockedThrough).toBe(day(-1));
    });

    it("refuses to close the books through a future date", async () => {
      await expect(
        service.setPeriodLock(schoolId, userId, true, { lockedThrough: day(3), reason: "This should not be accepted" }),
      ).rejects.toThrow(/future/i);
    });
  });

  describe("audit trail", () => {
    it("lists this school's finance entries newest first, filters by type and pages", async () => {
      await service.setPeriodLock(schoolId, userId, true, { lockedThrough: null, reason: "Reset for this test case" });
      const all = await service.listFinanceAudit(schoolId, { limit: 1000 });
      expect(all.items.length).toBeGreaterThan(5);
      const times = all.items.map((item) => new Date(item.createdAt).getTime());
      expect([...times].sort((x, y) => y - x)).toEqual(times);

      const payments = await service.listFinanceAudit(schoolId, { category: "PAYMENTS", limit: 1000 });
      expect(payments.items.length).toBeGreaterThan(0);
      expect(payments.items.every((item) => item.category === "PAYMENTS")).toBe(true);

      const firstPage = await service.listFinanceAudit(schoolId, { limit: 2 });
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.nextCursor).not.toBeNull();
      const secondPage = await service.listFinanceAudit(schoolId, { limit: 2, cursor: firstPage.nextCursor! });
      expect(secondPage.items.map((item) => item.id)).not.toContain(firstPage.items[0]!.id);
    });

    it("shows nothing from other schools", async () => {
      const other = await service.listFinanceAudit("some-other-school", { limit: 100 });
      expect(other.items).toHaveLength(0);
    });
  });
  describe("reporting reconciliation", () => {
    it("separates not-yet-due balances and reconciles every ageing bucket", async () => {
      const { bill } = await studentWithBill(123.45);
      await prisma.bill.update({
        where: { id: bill.id },
        data: { dueDate: new Date(day(7)) },
      });
      const result = await service.getFinanceSummary(schoolId);
      const ageingSum = Object.values(result.ageing).reduce(
        (sum, amount) => sum.plus(new Prisma.Decimal(amount)), new Prisma.Decimal(0),
      );
      expect(ageingSum.toFixed(2)).toBe(result.outstanding);
      expect(result.reconciliation.ageingReconciled).toBe(true);
      expect(result.reconciliation.ageingDifference).toBe("0.00");
      expect(new Prisma.Decimal(result.ageing.notDue).gte("123.45")).toBe(true);
      expect(result.balanceBasis).toBe("CURRENT");
    });

    it("flags a discrepancy between a student's cached balance and their invoices", async () => {
      const { student } = await studentWithBill(210);
      await prisma.student.update({
        where: { id: student.id },
        data: { outstandingBalance: new Prisma.Decimal("209.99") },
      });
      const report = await service.getFinanceSummary(schoolId);
      expect(report.reconciliation.studentBalanceMismatchCount).toBeGreaterThan(0);
      expect(report.reconciliation.status).toBe("DISCREPANCY");
    });
  });

  describe("accounts receivable pre-close reconciliation", () => {
    it("does not certify close readiness when billing receivables are not journalled", async () => {
      const { student, bill } = await studentWithBill(500);
      await pay(student.id, bill.id, 100);
      const result = await service.getReceivablesCloseReadiness(schoolId);
      expect(result.openInvoices).not.toBe("0.00");
      expect(result.closeReady).toBe(false);
      expect(result.reportingOnly).toBe(true);
      expect(result.checks.some((check) => check.code === "STUDENT_TO_INVOICE")).toBe(true);
      expect(result.checks.find((check) => check.code === "AR_CONTROL_ACCOUNT")?.status).not.toBe("PASS");
    });

    it("flags a student balance mismatch without changing financial records", async () => {
      const { student, bill } = await studentWithBill(250);
      await prisma.student.update({
        where: { id: student.id },
        data: { outstandingBalance: new Prisma.Decimal("249.99") },
      });
      const result = await service.getReceivablesCloseReadiness(schoolId);
      expect(result.checks.find((check) => check.code === "STUDENT_TO_INVOICE")?.status).toBe("FAIL");
      expect(result.closeReady).toBe(false);
      expect((await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).balanceAmount.toFixed(2)).toBe("250.00");
    });

    it("does not disclose another school's accounts", async () => {
      const other = await service.getReceivablesCloseReadiness("unrelated-school-id");
      expect(other.openInvoiceCount).toBe(0);
      expect(other.receivableAccounts).toHaveLength(0);
      expect(other.openInvoices).toBe("0.00");
    });
  });

  describe("posted-journal trial balance", () => {
    it("balances debits and credits after receiving school fees, without claiming accrual completeness", async () => {
      const { student, bill } = await studentWithBill(100);
      await pay(student.id, bill.id, 50);
      const report = await service.getJournalTrialBalance(schoolId);
      expect(report.totalDebits).toBe(report.totalCredits);
      expect(report.difference).toBe("0.00");
      expect(report.balanced).toBe(true);
      expect(report.accrualComplete).toBe(false);
      expect(report.basis).toBe("POSTED_JOURNAL_ONLY");
      const posted = report.accounts.filter((account) => account.postedBalance !== "0.00");
      expect(posted.some((account) => account.accountType === "ASSET")).toBe(true);
      expect(posted.some((account) => account.accountType === "REVENUE")).toBe(true);
    });

    it("rejects future dates and prevents cross-school account visibility", async () => {
      await expect(service.getJournalTrialBalance(schoolId, day(3))).rejects.toThrow(/future/i);
      const own = await service.getJournalTrialBalance(schoolId);
      const other = await service.getJournalTrialBalance("nonexistent-school");
      expect(other.accounts).toHaveLength(0);
      expect(other.totalDebits).toBe("0.00");
      expect(own.accounts.every((account) => account.accountId !== "nonexistent-school")).toBe(true);
    });
  });

  describe("historical receivables", () => {
    it("reconstructs the balance before and after a receipt reversal without using today's bill balance", async () => {
      const { student, bill } = await studentWithBill(500);
      const earlier = day(-2);
      await prisma.bill.update({ where: { id: bill.id }, data: { issuedAt: new Date(earlier) } });
      const payment = await pay(student.id, bill.id, 150, { paymentDate: day(-1) });
      const beforePayment = await service.getHistoricalReceivables(schoolId, earlier);
      const initial = beforePayment.invoices.find((row) => row.billId === bill.id);
      expect(initial?.outstanding).toBe("500.00");
      const paidDate = await service.getHistoricalReceivables(schoolId, day(0));
      expect(paidDate.invoices.find((row) => row.billId === bill.id)?.outstanding).toBe("350.00");
      await service.reversePayment(schoolId, userId, payment.id, { kind: "VOID", reason: "Historical ledger regression" });
      const afterReverse = await service.getHistoricalReceivables(schoolId, day(0));
      expect(afterReverse.invoices.find((row) => row.billId === bill.id)?.outstanding).toBe("500.00");
      expect(afterReverse.ageing.notDue).toBeDefined();
    });

    it("flags legacy cancelled invoices instead of inventing a historical reversal date", async () => {
      const { bill } = await studentWithBill(80);
      await prisma.bill.update({ where: { id: bill.id }, data: { status: "CANCELLED" } });
      const snapshot = await service.getHistoricalReceivables(schoolId, day(0));
      expect(snapshot.complete).toBe(false);
      expect(snapshot.exceptions.some((item) => item.reference === bill.billNumber)).toBe(true);
    });
  });

  describe("Phase 2 reporting and allocations", () => {
    it("returns independent page totals and accurate summary totals beyond 500 records", async () => {
      const dateRange = { from: day(-1), to: day(0) };
      const before = await service.getFinanceSummary(schoolId, dateRange);
      const { student } = await studentWithBill(10);
      await prisma.bill.createMany({
        data: Array.from({ length: 500 }, (_, index) => ({
          schoolId,
          studentId: student.id,
          academicYearId: yearId,
          billNumber: `TEST-${run}-PAGE-${index.toString().padStart(4, "0")}`,
          totalAmount: new Prisma.Decimal("10.00"),
          grossAmount: new Prisma.Decimal("10.00"),
          discountAmount: new Prisma.Decimal("0.00"),
          paidAmount: new Prisma.Decimal("0.00"),
          balanceAmount: new Prisma.Decimal("10.00"),
          status: "PENDING" as const,
          issuedAt: new Date(),
        })),
      });
      await prisma.payment.createMany({
        data: Array.from({ length: 501 }, (_, index) => ({
          schoolId,
          studentId: student.id,
          paymentNumber: `RCT-${run}-PAGE-${index.toString().padStart(4, "0")}`,
          amount: new Prisma.Decimal("2.00"),
          paymentMethod: "CASH" as const,
          paymentDate: new Date(day(0)),
          status: "COMPLETED" as const,
          recordedById: userId,
        })),
      });

      const billsPage = await service.listBills(schoolId, { studentId: student.id, limit: 50 });
      const paymentsPage = await service.listPayments(schoolId, { limit: 50, search: `RCT-${run}-PAGE` });
      const after = await service.getFinanceSummary(schoolId, dateRange);
      expect(billsPage.items).toHaveLength(50);
      expect(billsPage.total).toBe(501);
      expect(billsPage.nextCursor).toBeTruthy();
      expect(paymentsPage.items).toHaveLength(50);
      expect(paymentsPage.total).toBe(501);
      expect(paymentsPage.nextCursor).toBeTruthy();
      expect(new Prisma.Decimal(after.billed).minus(before.billed).toFixed(2)).toBe("5010.00");
      expect(new Prisma.Decimal(after.collected).minus(before.collected).toFixed(2)).toBe("1002.00");
    });

    it("reconstructs the statement running balance from bills and actual receipt allocations", async () => {
      const { student, bill } = await studentWithBill(1000);
      await pay(student.id, bill.id, 200);
      const statement = await service.getStudentStatement(schoolId, student.id, "owner", { scope: "all" });
      expect(statement.openingBalance).toBe("0.00");
      expect(statement.entries.map((entry) => entry.type)).toEqual(["INVOICE", "RECEIPT"]);
      expect(statement.entries.at(-1)?.runningBalance).toBe("800.00");
      expect(statement.closingBalance).toBe("800.00");
      expect(statement.dataSource).toBe("bills_and_payments");
    });

    it("does not expose another school's student statement or finance lists", async () => {
      const { student } = await studentWithBill(100);
      await expect(service.getStudentStatement("other-school", student.id, "owner", { scope: "all" })).rejects.toThrow(/not found/i);
      expect((await service.listBills("other-school", { studentId: student.id })).total).toBe(0);
      expect((await service.listPayments("other-school", { limit: 10 })).total).toBe(0);
      const summary = await service.getFinanceSummary("other-school", { from: day(-1), to: day(0) });
      expect(summary.billed).toBe("0.00");
      expect(summary.collected).toBe("0.00");
    });

    it("allocates one receipt oldest-first across invoices and reverses every affected bill", async () => {
      const { student, bill: firstBill } = await studentWithBill(1000);
      const secondBill = await prisma.bill.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYearId: yearId,
          billNumber: `TEST-${run}-SPILLOVER`,
          totalAmount: new Prisma.Decimal("300.00"),
          grossAmount: new Prisma.Decimal("300.00"),
          discountAmount: new Prisma.Decimal("0.00"),
          paidAmount: new Prisma.Decimal("0.00"),
          balanceAmount: new Prisma.Decimal("300.00"),
          status: "PENDING",
          items: { create: [{ description: "Additional charge", amount: new Prisma.Decimal("300.00"), totalAmount: new Prisma.Decimal("300.00"), balanceAmount: new Prisma.Decimal("300.00") }] },
        },
      });
      const payment = await pay(student.id, firstBill.id, 1200);
      const [firstAfterPay, secondAfterPay, allocations] = await Promise.all([
        prisma.bill.findUniqueOrThrow({ where: { id: firstBill.id } }),
        prisma.bill.findUniqueOrThrow({ where: { id: secondBill.id } }),
        prisma.paymentBillAllocation.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "asc" } }),
      ]);
      expect(firstAfterPay.balanceAmount.toFixed(2)).toBe("0.00");
      expect(secondAfterPay.balanceAmount.toFixed(2)).toBe("100.00");
      expect(allocations.map((row) => row.amount.toFixed(2))).toEqual(["1000.00", "200.00"]);

      await service.reversePayment(schoolId, userId, payment.id, { kind: "VOID", reason: "Spillover allocation test reversal" });
      const [firstAfterReverse, secondAfterReverse] = await Promise.all([
        prisma.bill.findUniqueOrThrow({ where: { id: firstBill.id } }),
        prisma.bill.findUniqueOrThrow({ where: { id: secondBill.id } }),
      ]);
      expect(firstAfterReverse.balanceAmount.toFixed(2)).toBe("1000.00");
      expect(secondAfterReverse.balanceAmount.toFixed(2)).toBe("300.00");
      expect((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).outstandingBalance.toFixed(2)).toBe("1300.00");
    });
  });

});
