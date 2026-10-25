import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { StudentsService } from "./students.service.js";

describe("StudentsService.getMyWardFees guardian isolation", () => {
  it("does not call the statement service when the ward is not linked to the signed-in guardian", async () => {
    const guardianStudent = { findFirst: vi.fn().mockResolvedValue(null) };
    const financeService = { getStudentStatement: vi.fn() };
    const fakeService = {
      requireGuardian: vi.fn().mockResolvedValue({ id: "guardian-own" }),
      prisma: { client: { guardianStudent } },
      financeService,
    };
    await expect(
      StudentsService.prototype.getMyWardFees.call(
        fakeService as never,
        "school-own",
        "user-own",
        "student-from-another-family",
        { scope: "all" },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(guardianStudent.findFirst).toHaveBeenCalledWith({
      where: {
        guardianId: "guardian-own",
        studentId: "student-from-another-family",
        guardian: { schoolId: "school-own", deletedAt: null, isActive: true },
        student: { schoolId: "school-own", deletedAt: null },
      },
      select: { id: true },
    });
    expect(financeService.getStudentStatement).not.toHaveBeenCalled();
  });

  it("passes the statement request through only after the linked-ward check succeeds", async () => {
    const guardianStudent = { findFirst: vi.fn().mockResolvedValue({ id: "guardian-link" }) };
    const expected = { student: { id: "ward-1" }, closingBalance: "15.00" };
    const financeService = { getStudentStatement: vi.fn().mockResolvedValue(expected) };
    const fakeService = {
      requireGuardian: vi.fn().mockResolvedValue({ id: "guardian-own" }),
      prisma: { client: { guardianStudent } },
      financeService,
    };
    await expect(
      StudentsService.prototype.getMyWardFees.call(
        fakeService as never,
        "school-own",
        "user-own",
        "ward-1",
        { scope: "all" },
      ),
    ).resolves.toEqual(expected);
    expect(financeService.getStudentStatement).toHaveBeenCalledWith(
      "school-own", "ward-1", "guardian", { scope: "all" }, true,
    );
  });
});
