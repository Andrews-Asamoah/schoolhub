import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service.js";
import { DashboardService } from "./dashboard.service.js";

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
