import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MeService } from "./me.service.js";

describe("employee payslip self-service", () => {
  it("does not return another employee's payslip even when its ID is known", async () => {
    const payslipFindFirst = vi.fn().mockResolvedValue(null);
    const db = {
      staff: { findFirst: vi.fn().mockResolvedValue({ id: "staff-owned-by-user" }) },
      teacher: { findFirst: vi.fn().mockResolvedValue(null) },
      payslip: { findFirst: payslipFindFirst },
    };
    const service = new MeService({ client: db } as never);

    await expect(service.getMyPayslip("user-1", "school-1", "colleague-payslip-id")).rejects.toBeInstanceOf(NotFoundException);
    expect(payslipFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "colleague-payslip-id",
        schoolId: "school-1",
        payrollRecord: { status: { in: ["APPROVED", "PAID"] } },
        OR: [{ staffId: "staff-owned-by-user" }],
      }),
    }));
  });

  it("does not expose payslips for a user without a staff or teacher record", async () => {
    const payslipFindMany = vi.fn();
    const db = {
      staff: { findFirst: vi.fn().mockResolvedValue(null) },
      teacher: { findFirst: vi.fn().mockResolvedValue(null) },
      payslip: { findMany: payslipFindMany },
    };
    const service = new MeService({ client: db } as never);
    await expect(service.getMyPayslips("student-user", "school-1")).resolves.toEqual({ items: [] });
    expect(payslipFindMany).not.toHaveBeenCalled();
  });
});
