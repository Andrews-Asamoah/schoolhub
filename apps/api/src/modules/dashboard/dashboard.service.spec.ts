import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service.js";
import { DashboardService } from "./dashboard.service.js";

describe("DashboardService today’s attendance", () => {
  const day = new Date("2026-11-26");
  const currentTerm = {
    id: "term-1",
    academicYearId: "year-1",
    startDate: new Date("2026-09-01"),
    endDate: new Date("2026-12-18"),
    instructionalWeekdays: [1, 2, 3, 4, 5],
    calendarDays: [] as { isInstructional: boolean }[],
  };
  const findTerm = vi.fn();
  const findEnrollments = vi.fn();
  const service = new DashboardService({ client: {
    term: { findFirst: findTerm },
    enrollment: { findMany: findEnrollments },
  } } as unknown as PrismaService);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T14:20:00Z"));
    findTerm.mockReset().mockResolvedValue(currentTerm);
    findEnrollments.mockReset().mockResolvedValue([]);
  });

  afterEach(() => vi.useRealTimers());

  it("counts school-scoped marks and leaves eligible students without marks unmarked", async () => {
    const statuses = ["PRESENT", "PRESENT", "LATE", "ABSENT", "EXCUSED", "SICK", "PERMISSION", null];
    findEnrollments.mockResolvedValue(statuses.map(status => ({
      student: { attendances: status === null ? [] : [{ status }] },
    })));

    expect(await service.getTodayAttendance("school-1")).toEqual({
      date: "2026-11-26", state: "instructional", expected: 8, marked: 7,
      counts: { PRESENT: 2, LATE: 1, ABSENT: 1, EXCUSED: 1, SICK: 1, PERMISSION: 1 },
    });
    expect(findTerm).toHaveBeenCalledWith(expect.objectContaining({
      where: { isCurrent: true, academicYear: { schoolId: "school-1", isCurrent: true } },
    }));
    expect(findEnrollments).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        termId: "term-1", academicYearId: "year-1", status: "ACTIVE",
        student: expect.objectContaining({
          schoolId: "school-1",
          attendanceExclusions: { none: { schoolId: "school-1", termId: "term-1", date: day } },
        }),
      }),
      select: { student: { select: { attendances: { where: { date: day }, select: { status: true } } } } },
    }));
  });

  it("honors a school closure and a make-up instructional day", async () => {
    findTerm.mockResolvedValueOnce({ ...currentTerm, calendarDays: [{ isInstructional: false }] });
    expect(await service.getTodayAttendance("school-1")).toMatchObject({ state: "non-instructional" });
    expect(findEnrollments).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-11-28T14:20:00Z"));
    findTerm.mockResolvedValueOnce({ ...currentTerm, calendarDays: [{ isInstructional: true }] });
    expect(await service.getTodayAttendance("school-1")).toMatchObject({ state: "instructional", expected: 0, marked: 0 });
  });

  it("does not report attendance outside the current term", async () => {
    vi.setSystemTime(new Date("2026-12-19T14:20:00Z"));
    expect(await service.getTodayAttendance("school-1")).toEqual({ date: "2026-12-19", state: "outside-term" });
    expect(findEnrollments).not.toHaveBeenCalled();
  });
});

describe("DashboardService finance visibility", () => {
  it("returns administrators aggregate finance data without fetching or exposing transaction details", async () => {
    const paymentFindMany = vi.fn().mockResolvedValue([{ amount: 125, paymentDate: new Date() }]);
    const expenseFindMany = vi.fn().mockResolvedValue([{ amount: 25, date: new Date() }]);
    const prisma = {
      client: {
        student: { findMany: vi.fn().mockResolvedValue([]) },
        teacher: { count: vi.fn().mockResolvedValue(0) },
        payment: { findMany: paymentFindMany },
        expense: { findMany: expenseFindMany },
      },
    } as unknown as PrismaService;

    const result = await new DashboardService(prisma).getAnalytics("school-1", "admin", 3);

    expect(result.canViewFinance).toBe(true);
    expect(result.metrics.revenueThisMonth).toBe(125);
    expect(result.metrics.expendituresThisMonth).toBe(25);
    expect(result.financialStatus).toHaveLength(3);
    expect(result.recentActivities).toEqual([]);
    expect(paymentFindMany).toHaveBeenCalledTimes(1);
    expect(expenseFindMany).toHaveBeenCalledTimes(1);
    expect(paymentFindMany.mock.calls[0]?.[0]).toMatchObject({
      select: { amount: true, paymentDate: true },
    });
    expect(expenseFindMany.mock.calls[0]?.[0]).toMatchObject({
      select: { amount: true, date: true },
    });
  });

  it("continues to return transaction-level recent activity to authorized finance roles", async () => {
    const paymentFindMany = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "payment-1",
        amount: 125,
        createdAt: new Date(),
        paymentNumber: "PAY-1",
        student: { profile: { firstName: "Ada", lastName: "Mensah" } },
      }]);
    const expenseFindMany = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "expense-1",
        amount: 25,
        createdAt: new Date(),
        description: "Utilities",
        payee: null,
      }]);
    const prisma = {
      client: {
        student: { findMany: vi.fn().mockResolvedValue([]) },
        teacher: { count: vi.fn().mockResolvedValue(0) },
        payment: { findMany: paymentFindMany },
        expense: { findMany: expenseFindMany },
      },
    } as unknown as PrismaService;

    const result = await new DashboardService(prisma).getAnalytics("school-1", "accountant", 3);

    expect(result.recentActivities).toHaveLength(2);
    expect(result.recentActivities.map((activity) => activity.type)).toContain("payment");
    expect(result.recentActivities.map((activity) => activity.type)).toContain("expense");
    expect(paymentFindMany).toHaveBeenCalledTimes(2);
    expect(expenseFindMany).toHaveBeenCalledTimes(2);
  });
});

it("does not fetch or expose school-wide named student activity to teachers", async () => {
  const students = vi.fn().mockResolvedValue([]);
  const service = new DashboardService({ client: {
    student: { findMany: students }, teacher: { count: vi.fn().mockResolvedValue(0) },
  } } as unknown as PrismaService);
  const result = await service.getAnalytics("school", "teacher", 3);
  expect(students).toHaveBeenCalledTimes(1);
  expect(result.recentActivities).toEqual([]);
  expect(result.canViewFinance).toBe(false);
});

it("adds collection amounts as decimals before converting chart values", async () => {
  const now = new Date();
  const service = new DashboardService({ client: {
    student: { findMany: vi.fn().mockResolvedValue([]) }, teacher: { count: vi.fn().mockResolvedValue(0) },
    payment: { findMany: vi.fn().mockResolvedValue([{ amount: "0.10", paymentDate: now }, { amount: "0.20", paymentDate: now }]) },
    expense: { findMany: vi.fn().mockResolvedValue([]) },
  } } as unknown as PrismaService);
  expect((await service.getAnalytics("school", "admin", 3)).metrics.revenueThisMonth).toBe(0.3);
});
