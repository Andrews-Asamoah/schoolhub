/**
 * Database-backed tests for bill generation. Skipped unless TEST_DATABASE_URL is set
 * (its database name must contain "test"). See apps/api/TESTING.md.
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

describe.skipIf(!enabled)("bill generation (database)", { timeout: 60_000 }, () => {
  let prisma: PrismaClient;
  let service: FinanceServiceType;
  const run = `b${Date.now().toString(36)}`;
  let schoolId = "";
  let actorId = "";
  let yearId = "";
  let termId = "";
  let classId = "";
  let structureCounter = 0;
  const STUDENTS = 6;
  const studentIds: string[] = [];
  const userIds: string[] = [];

  /** A fee structure with the given item amounts. */
  async function structure(amounts: number[]) {
    structureCounter += 1;
    const n = structureCounter;
    return prisma.feeStructure.create({
      data: {
        schoolId,
        name: `Structure ${run}-${n}`,
        items: { create: amounts.map((amount, index) => ({ name: `Item ${index + 1}`, amount })) },
      },
    });
  }

  const generate = (feeStructureId: string, extra: Record<string, unknown> = {}) =>
    service.generateBills(schoolId, { academicYearId: yearId, termId, feeStructureId, classId, ...extra } as never, actorId);

  async function structureWithOptionalItem() {
    structureCounter += 1;
    return prisma.feeStructure.create({
      data: {
        schoolId,
        name: `Optional structure ${run}-${structureCounter}`,
        items: {
          create: [
            { name: "Mandatory tuition", amount: new Prisma.Decimal("100.00"), isOptional: false },
            { name: "Optional trip", amount: new Prisma.Decimal("50.00"), isOptional: true },
          ],
        },
      },
      include: { items: true },
    });
  }

  const billsFor = (feeStructureId: string) => prisma.bill.findMany({ where: { schoolId, feeStructureId }, include: { items: true } });
  const outstanding = async () =>
    Object.fromEntries((await prisma.student.findMany({ where: { id: { in: studentIds } } })).map((s) => [s.id, s.outstandingBalance.toNumber()]));

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma: client } = await import("../../prisma/prisma.client.js");
    const { FinanceService } = await import("./finance.service.js");
    prisma = client;
    service = new FinanceService({ client } as never);

    const org = await prisma.organization.create({ data: { id: `${run}-org`, name: `Test ${run}`, slug: `${run}-org` } });
    const school = await prisma.school.create({ data: { organizationId: org.id, name: `Test School ${run}`, code: run.toUpperCase(), subdomain: run } });
    schoolId = school.id;
    const actor = await prisma.user.create({ data: { id: `${run}-acct`, name: "Test Accountant", email: `${run}-acct@example.test` } });
    actorId = actor.id;
    userIds.push(actor.id);
    const year = await prisma.academicYear.create({
      data: { schoolId, name: `${run} year`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), isCurrent: true },
    });
    yearId = year.id;
    const term = await prisma.term.create({
      data: { academicYearId: yearId, name: "Term 1", termNumber: 1, startDate: new Date("2026-01-01"), endDate: new Date("2026-04-30"), isCurrent: true },
    });
    termId = term.id;
    const schoolClass = await prisma.class.create({ data: { schoolId, academicYearId: yearId, name: `Class ${run}`, level: "JHS1" } });
    classId = schoolClass.id;

    for (let i = 1; i <= STUDENTS; i += 1) {
      const user = await prisma.user.create({ data: { id: `${run}-su${i}`, name: `Student ${i}`, email: `${run}-s${i}@example.test` } });
      userIds.push(user.id);
      const profile = await prisma.userProfile.create({ data: { userId: user.id, firstName: "Test", lastName: `Student${i}` } });
      const student = await prisma.student.create({ data: { profileId: profile.id, schoolId, studentId: `${run}-${i}`, classId } });
      studentIds.push(student.id);
      await prisma.enrollment.create({ data: { studentId: student.id, classId, academicYearId: yearId, termId, status: "ACTIVE" } });
    }
  });

  afterAll(async () => {
    if (!prisma || !schoolId) return;
    const quiet = (promise: Promise<unknown>) => promise.catch(() => undefined);
    await quiet(prisma.auditLog.deleteMany({ where: { schoolId } }));
    await quiet(prisma.paymentBillAllocation.deleteMany({ where: { schoolId } }));
    await quiet(prisma.payment.deleteMany({ where: { schoolId } }));
    await quiet(prisma.transaction.deleteMany({ where: { schoolId } }));
    await quiet(prisma.billCarryForward.deleteMany({ where: { schoolId } }));
    await quiet(prisma.bill.deleteMany({ where: { schoolId } }));
    await quiet(prisma.enrollment.deleteMany({ where: { academicYearId: yearId } }));
    await quiet(prisma.student.deleteMany({ where: { schoolId } }));
    await quiet(prisma.feeStructure.deleteMany({ where: { schoolId } }));
    await quiet(prisma.class.deleteMany({ where: { schoolId } }));
    await quiet(prisma.term.deleteMany({ where: { academicYearId: yearId } }));
    await quiet(prisma.academicYear.deleteMany({ where: { schoolId } }));
    await quiet(prisma.school.deleteMany({ where: { id: schoolId } }));
    await quiet(prisma.organization.deleteMany({ where: { id: `${run}-org` } }));
    await quiet(prisma.userProfile.deleteMany({ where: { userId: { in: userIds } } }));
    await quiet(prisma.user.deleteMany({ where: { id: { in: userIds } } }));
    await prisma.$disconnect();
  });

  it("bills every enrolled student with the fee items, totals and balances", async () => {
    const fees = await structure([700, 300]);
    const before = await outstanding();
    const result = await generate(fees.id);
    expect(result).toMatchObject({ success: true, count: STUDENTS });

    const bills = await billsFor(fees.id);
    expect(bills).toHaveLength(STUDENTS);
    for (const bill of bills) {
      expect(Number(bill.totalAmount)).toBe(1000);
      expect(Number(bill.balanceAmount)).toBe(1000);
      expect(bill.status).toBe("PENDING");
      expect(bill.billNumber).toMatch(new RegExp(`^INV-${new Date().getFullYear()}-\\d{5}$`));
      expect(bill.items.map((item) => Number(item.totalAmount)).sort()).toEqual([300, 700]);
    }
    const after = await outstanding();
    for (const id of studentIds) expect(after[id]! - before[id]!).toBe(1000);
    const audit = await prisma.auditLog.findFirst({ where: { schoolId, action: "BILL_GENERATED", entityId: fees.id } });
    expect(audit).not.toBeNull();
  });

  it("does not bill the same student twice for the same fee structure", async () => {
    const fees = await structure([400]);
    await generate(fees.id);
    const before = await outstanding();
    await generate(fees.id);
    expect(await billsFor(fees.id)).toHaveLength(STUDENTS);
    expect(await outstanding()).toEqual(before);
  });

  it("issues unique, sequential bill numbers within a run", async () => {
    const fees = await structure([250]);
    await generate(fees.id);
    const numbers = (await billsFor(fees.id)).map((bill) => Number(bill.billNumber.split("-").pop())).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(STUDENTS);
    expect(numbers[numbers.length - 1]! - numbers[0]!).toBe(STUDENTS - 1);
  });

  it("creates exactly one bill per student when the same run is started many times at once", async () => {
    const fees = await structure([600]);
    const before = await outstanding();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => generate(fees.id)));
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(0);
    const bills = await billsFor(fees.id);
    expect(bills).toHaveLength(STUDENTS);
    expect(new Set(bills.map((bill) => bill.studentId)).size).toBe(STUDENTS);
    const after = await outstanding();
    for (const id of studentIds) expect(after[id]! - before[id]!).toBe(600);
  });

  it("handles different fee structures being billed to the same class at once", async () => {
    const a = await structure([500]);
    const b = await structure([800]);
    const c = await structure([100, 100]);
    const before = await outstanding();
    const results = await Promise.allSettled([generate(a.id), generate(b.id), generate(c.id)]);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(0);
    for (const fees of [a, b, c]) expect(await billsFor(fees.id)).toHaveLength(STUDENTS);
    const numbers = (await prisma.bill.findMany({ where: { schoolId }, select: { billNumber: true } })).map((bill) => bill.billNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    const after = await outstanding();
    for (const id of studentIds) expect(after[id]! - before[id]!).toBe(1500);
  });

  it("handles many different fee structures being billed at once", async () => {
    const list = await Promise.all(Array.from({ length: 8 }, () => structure([100])));
    const results = await Promise.allSettled(list.map((fees) => generate(fees.id)));
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(0);
    for (const fees of list) expect(await billsFor(fees.id)).toHaveLength(STUDENTS);
    const numbers = (await prisma.bill.findMany({ where: { schoolId }, select: { billNumber: true } })).map((bill) => bill.billNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("keeps bills, students and payments consistent when billing and paying overlap", async () => {
    const first = await structure([500]);
    await generate(first.id);
    const bill = (await billsFor(first.id))[0]!;
    const second = await structure([200]);
    const results = await Promise.allSettled([
      generate(second.id),
      service.recordPayment(schoolId, actorId, {
        studentId: bill.studentId,
        billId: bill.id,
        amount: 100,
        paymentMethod: "CASH",
        paymentDate: new Date().toISOString().slice(0, 10),
      } as never),
    ]);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(0);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: bill.studentId } });
    const unpaid = await prisma.bill.findMany({ where: { studentId: bill.studentId, status: { notIn: ["CANCELLED", "WAIVED"] } } });
    expect(student.outstandingBalance.toNumber()).toBe(unpaid.reduce((sum, b) => sum + Number(b.balanceAmount), 0));
  });

  it("excludes optional fee items unless explicitly selected", async () => {
    const defaultFees = await structureWithOptionalItem();
    await generate(defaultFees.id);
    const defaultBills = await billsFor(defaultFees.id);
    expect(defaultBills).toHaveLength(STUDENTS);
    expect(defaultBills.every((bill) => bill.totalAmount.eq("100.00"))).toBe(true);
    expect(defaultBills.every((bill) => bill.items.length === 1 && bill.items[0]?.description === "Mandatory tuition")).toBe(true);

    const selectedFees = await structureWithOptionalItem();
    const optionalItem = selectedFees.items.find((item) => item.isOptional)!;
    await generate(selectedFees.id, { optionalItemIds: [optionalItem.id] });
    const selectedBills = await billsFor(selectedFees.id);
    expect(selectedBills).toHaveLength(STUDENTS);
    expect(selectedBills.every((bill) => bill.totalAmount.eq("150.00"))).toBe(true);
    expect(selectedBills.every((bill) => bill.items.some((item) => item.description === "Optional trip"))).toBe(true);
  });

  it("snapshots earlier unpaid bills without adding a duplicate charge", async () => {
    const studentId = studentIds[0]!;
    const oldYear = await prisma.academicYear.create({
      data: { schoolId, name: `${run} prior year`, startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31"), isCurrent: false },
    });
    const oldTerm = await prisma.term.create({
      data: { academicYearId: oldYear.id, name: "Prior Term", termNumber: 1, startDate: new Date("2025-01-01"), endDate: new Date("2025-04-30"), isCurrent: false },
    });
    const oldBill = await prisma.bill.create({
      data: {
        schoolId,
        studentId,
        academicYearId: oldYear.id,
        termId: oldTerm.id,
        billNumber: `HIST-${run}`,
        totalAmount: new Prisma.Decimal("250.00"),
        grossAmount: new Prisma.Decimal("250.00"),
        discountAmount: new Prisma.Decimal("0.00"),
        paidAmount: new Prisma.Decimal("0.00"),
        balanceAmount: new Prisma.Decimal("250.00"),
        status: "PENDING",
        items: { create: [{ description: "Prior term charge", amount: "250.00", totalAmount: "250.00", balanceAmount: "250.00" }] },
      },
    });
    await prisma.student.update({ where: { id: studentId }, data: { outstandingBalance: { increment: "250.00" } } });
    const fees = await structure([100]);
    await generate(fees.id, { studentId, classId: undefined });
    const newBill = (await billsFor(fees.id)).find((bill) => bill.studentId === studentId)!;
    const snapshot = await prisma.billCarryForward.findMany({ where: { schoolId, billId: newBill.id } });
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.sourceBillId).toBe(oldBill.id);
    expect(snapshot[0]?.amount.toFixed(2)).toBe("250.00");
    expect(newBill.totalAmount.toFixed(2)).toBe("100.00");
    expect(newBill.balanceAmount.toFixed(2)).toBe("100.00");
    const openBills = await prisma.bill.findMany({
      where: { schoolId, studentId, status: { notIn: ["CANCELLED", "WAIVED"] } },
      select: { balanceAmount: true },
    });
    const receivableTotal = openBills.reduce((sum, bill) => sum.plus(bill.balanceAmount), new Prisma.Decimal(0));
    expect(receivableTotal.toFixed(2)).toBe("350.00");
  });

  it("refuses bills for a term that is not the current one", async () => {
    const fees = await structure([100]);
    await expect(generate(fees.id, { termId: "not-the-current-term" })).rejects.toThrow(/currently selected/i);
    expect(await billsFor(fees.id)).toHaveLength(0);
  });

  it("refuses to bill a student who is not enrolled this term", async () => {
    const fees = await structure([100]);
    await expect(generate(fees.id, { classId: undefined, studentId: "someone-else" })).rejects.toThrow(/not enrolled/i);
  });
});
