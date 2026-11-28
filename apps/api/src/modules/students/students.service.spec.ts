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

describe("StudentsService.getProfileView student photo", () => {
  it("projects the account image on a teacher-scoped student profile", async () => {
    const image = "https://school.example/pupil.webp";
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "student-1" })
      .mockResolvedValueOnce({
        id: "student-1",
        profile: { firstName: "Sample", lastName: "Pupil", user: { image } },
        guardians: [],
      });
    const service = new StudentsService(
      {
        client: {
          student: { findFirst },
          enrollment: { findFirst: vi.fn().mockResolvedValue(null) },
        },
      } as never,
      {} as never,
    );

    const profile = await service.getProfileView("school-1", "student-1", ["class-1"]);

    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: "student-1",
        schoolId: "school-1",
        deletedAt: null,
        enrollments: { some: { classId: { in: ["class-1"] } } },
      },
      select: { id: true },
    });
    expect(profile.profile).toMatchObject({
      firstName: "Sample",
      lastName: "Pupil",
      image,
    });
    expect(profile.profile).not.toHaveProperty("user");
  });
});
