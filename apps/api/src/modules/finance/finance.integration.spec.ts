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
import type { PrismaClient } from "@prisma/client";
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
  let termId = "";
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
        termId,
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
    prisma = client;
    service = new FinanceService({ client } as never);

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
    termId = (await prisma.term.create({
      data: {
        academicYearId: yearId,
        name: "Test Term 1",
        termNumber: 1,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-04-30"),
        isCurrent: true,
      },
    })).id;
    termId = (await prisma.term.create({
      data: {
        academicYearId: yearId,
        name: "Test Term 1",
        termNumber: 1,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-04-30"),
        isCurrent: true,
      },
    })).id;
  });

  afterAll(async () => {
    if (!prisma || !schoolId) return;
    const quiet = (promise: Promise<unknown>) => promise.catch(() => undefined);
    await quiet(prisma.auditLog.deleteMany({ where: { schoolId } }));
    await quiet(prisma.payment.deleteMany({ where: { schoolId } }));
    await quiet(prisma.transaction.deleteMany({ where: { schoolId } }));
    await quiet(prisma.chartAccount.deleteMany({ where: { schoolId } }));
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

  describe("reporting and statements", () => {
    it("paginates more than 500 bills and payments while summaries include all rows", async () => {
      const { student } = await studentWithBill(100);
      const prefix = `RPT-${run}-`;
      const currentTermId = termId;
      const billRows = Array.from({ length: 501 }, (_, index) => ({
        schoolId,
        studentId: student.id,
        academicYearId: yearId,
        billNumber: `${prefix}${index.toString().padStart(4, "0")}`,
        totalAmount: new Prisma.Decimal("1.00"),
        grossAmount: new Prisma.Decimal("1.00"),
        paidAmount: new Prisma.Decimal("0.00"),
        balanceAmount: new Prisma.Decimal("1.00"),
        status: "PENDING" as const,
        issuedAt: new Date(Date.UTC(2026, 0, (index % 28) + 1)),
        termId: currentTermId,
      }));
      await prisma.bill.createMany({ data: billRows });
      const insertedBills = await prisma.bill.findMany({
        where: { schoolId, billNumber: { startsWith: prefix } },
        select: { id: true, billNumber: true },
      });
      expect(insertedBills).toHaveLength(501);
      await prisma.payment.createMany({
        data: insertedBills.map((bill, index) => ({
          schoolId,
          studentId: student.id,
          billId: bill.id,
          paymentNumber: `RPT-RCT-${run}-${index.toString().padStart(4, "0")}`,
          amount: new Prisma.Decimal("1.00"),
          paymentMethod: "CASH" as const,
          paymentDate: new Date(Date.UTC(2026, 1, (index % 28) + 1)),
          status: "COMPLETED" as const,
        })),
      });

      const [billCount, paymentCount, firstBillPage, firstPaymentPage] = await Promise.all([
        prisma.bill.count({ where: { schoolId } }),
        prisma.payment.count({ where: { schoolId } }),
        service.listBills(schoolId, { limit: 50 }),
        service.listPayments(schoolId, { limit: 50 }),
      ]);
      expect(firstBillPage.items).toHaveLength(50);
      expect(firstBillPage.total).toBe(billCount);
      expect(firstBillPage.nextCursor).not.toBeNull();
      expect(firstPaymentPage.items).toHaveLength(50);
      expect(firstPaymentPage.total).toBe(paymentCount);
      expect(firstPaymentPage.nextCursor).not.toBeNull();

      const summary = await service.getFinanceSummary(schoolId, {});
      const [billed, collected] = await Promise.all([
        prisma.bill.aggregate({
          where: { schoolId, status: { notIn: ["CANCELLED", "WAIVED"] } },
          _sum: { totalAmount: true },
        }),
        prisma.payment.aggregate({
          where: { schoolId, status: "COMPLETED", reversedAt: null },
          _sum: { amount: true },
        }),
      ]);
      expect(summary.billed).toBe(Number((billed._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2)));
      expect(summary.collected).toBe(Number((collected._sum.amount ?? new Prisma.Decimal(0)).toFixed(2)));
    });

    it("allocates a receipt oldest-first across bills and spills into the next bill", async () => {
      const { student, bill: oldest } = await studentWithBill(100);
      await prisma.bill.update({ where: { id: oldest.id }, data: { issuedAt: new Date("2026-01-01T00:00:00.000Z") } });
      const newer = await prisma.bill.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYearId: yearId,
          billNumber: `FIFO-${run}`,
          totalAmount: new Prisma.Decimal("200.00"),
          grossAmount: new Prisma.Decimal("200.00"),
          paidAmount: new Prisma.Decimal("0.00"),
          balanceAmount: new Prisma.Decimal("200.00"),
          status: "PENDING",
          issuedAt: new Date("2026-02-01T00:00:00.000Z"),
          items: { create: [{ description: "Additional fees", amount: 200, totalAmount: 200, balanceAmount: 200 }] },
        },
        include: { items: true },
      });
      await prisma.student.update({ where: { id: student.id }, data: { outstandingBalance: { increment: new Prisma.Decimal("200.00") } } });

      const payment = await pay(student.id, undefined, 150);
      const [oldBillAfter, newBillAfter, allocations] = await Promise.all([
        prisma.bill.findFirstOrThrow({ where: { id: oldest.id } }),
        prisma.bill.findFirstOrThrow({ where: { id: newer.id } }),
        prisma.paymentItem.findMany({ where: { paymentId: payment.id } }),
      ]);
      expect(Number(oldBillAfter.balanceAmount)).toBe(0);
      expect(Number(oldBillAfter.paidAmount)).toBe(100);
      expect(Number(newBillAfter.balanceAmount)).toBe(150);
      expect(Number(newBillAfter.paidAmount)).toBe(50);
      expect(allocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).toFixed(2)).toBe("150.00");
      expect(allocations.some((row) => row.billItemId === newer.items[0]?.id && row.amount.eq("50.00"))).toBe(true);
    });

    it("returns a statement with an opening and exact running balances", async () => {
      const { student, bill } = await studentWithBill(100);
      await pay(student.id, bill.id, 25);
      const statement = await service.getStudentStatement(schoolId, student.id, "owner", { scope: "all" });
      expect(statement.openingBalance).toBe(0);
      expect(statement.entries.map((entry) => entry.type)).toContain("INVOICE");
      expect(statement.entries.map((entry) => entry.type)).toContain("RECEIPT");
      expect(statement.closingBalance).toBe(75);
      expect(statement.entries.at(-1)?.balance).toBe(75);
      expect(statement.arrearsPolicy).toBe("SHOW_ONLY");
    });

    it("audits arrears policy changes in the same transaction and restores the default", async () => {
      expect((await service.getArrearsPolicy(schoolId)).arrearsPolicy).toBe("SHOW_ONLY");
      const changed = await service.setArrearsPolicy(schoolId, userId, "BLOCK_CLEARANCE_UNTIL_PAID");
      expect(changed.arrearsPolicy).toBe("BLOCK_CLEARANCE_UNTIL_PAID");
      const audit = await prisma.auditLog.findFirst({
        where: { schoolId, action: "UPDATE", entityType: "SCHOOL", entityId: schoolId },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.oldValues).toMatchObject({ arrearsPolicy: "SHOW_ONLY" });
      expect(audit?.newValues).toMatchObject({ arrearsPolicy: "BLOCK_CLEARANCE_UNTIL_PAID" });
      await service.setArrearsPolicy(schoolId, userId, "SHOW_ONLY");
    });

    it("reviews prior-term arrears and moves a former student without altering invoices", async () => {
      const { student } = await studentWithBill(100);
      const previousYear = await prisma.academicYear.create({
        data: {
          schoolId,
          name: `${run} previous term year`,
          startDate: new Date("2025-01-01"),
          endDate: new Date("2025-12-31"),
          isCurrent: false,
        },
      });
      const previousBill = await prisma.bill.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYearId: previousYear.id,
          billNumber: `ARREARS-${run}`,
          totalAmount: new Prisma.Decimal("200.00"),
          grossAmount: new Prisma.Decimal("200.00"),
          paidAmount: new Prisma.Decimal("0.00"),
          balanceAmount: new Prisma.Decimal("200.00"),
          status: "PENDING",
          issuedAt: new Date("2025-10-01T00:00:00.000Z"),
        },
      });
      const review = await service.getArrearsReview(schoolId);
      expect(review.activeWithArrears.some((row) => row.studentId === student.id && row.outstanding === 200)).toBe(true);
      const changed = await service.markArrearsStudentFormer(schoolId, userId, student.id, {
        status: "TRANSFERRED",
        reason: "Transfer confirmed by the receiving school",
      });
      expect(changed.status).toBe("TRANSFERRED");
      expect(changed.previousArrears).toBe(200);
      const after = await prisma.bill.findFirstOrThrow({ where: { id: previousBill.id } });
      expect(Number(after.balanceAmount)).toBe(200);
      const newReview = await service.getArrearsReview(schoolId);
      expect(newReview.activeWithArrears.some((row) => row.studentId === student.id)).toBe(false);
      expect(newReview.formerStudents.some((row) => row.studentId === student.id && row.outstanding === 200)).toBe(true);
    });

    it("denies statements for a student belonging to another school", async () => {
      const orgId = `${run}-foreign-org`;
      const foreignOrg = await prisma.organization.create({
        data: { id: orgId, name: `Foreign ${run}`, slug: orgId },
      });
      const foreignSchool = await prisma.school.create({
        data: {
          organizationId: foreignOrg.id,
          name: `Foreign School ${run}`,
          code: `F-${run}`,
          subdomain: `f-${run}`,
        },
      });
      const foreignUser = await prisma.user.create({
        data: { id: `${run}-foreign-user`, name: "Foreign Student", email: `${run}-foreign@example.test` },
      });
      const foreignProfile = await prisma.userProfile.create({
        data: { userId: foreignUser.id, firstName: "Foreign", lastName: "Student" },
      });
      const foreignStudent = await prisma.student.create({
        data: { schoolId: foreignSchool.id, profileId: foreignProfile.id, studentId: `${run}-foreign-student` },
      });
      try {
        await expect(service.getStudentStatement(schoolId, foreignStudent.id, "owner", { scope: "all" })).rejects.toThrow(/student not found/i);
        const localPage = await service.listBills(schoolId, { limit: 100 });
        expect(localPage.items.some((row) => (row.student as { id?: string } | undefined)?.id === foreignStudent.id)).toBe(false);
      } finally {
        await prisma.student.deleteMany({ where: { id: foreignStudent.id } });
        await prisma.school.deleteMany({ where: { id: foreignSchool.id } });
        await prisma.organization.deleteMany({ where: { id: foreignOrg.id } });
        await prisma.userProfile.deleteMany({ where: { id: foreignProfile.id } });
        await prisma.user.deleteMany({ where: { id: foreignUser.id } });
      }
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
});
