import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { ForbiddenException } from "@nestjs/common";
import { assertSubscriptionCapacity } from "./subscription-capacity.js";

function transactionMock(options: {
  limits?: { maxStudents: number | null; maxTeachers: number | null; maxGuardians: number | null; maxStaff: number | null } | null;
  students?: number; teachers?: number; guardians?: number; staff?: number;
} = {}) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    subscription: { findUnique: vi.fn().mockResolvedValue(options.limits === undefined ? {
      maxStudents: 5, maxTeachers: 2, maxGuardians: 10, maxStaff: 3,
    } : options.limits) },
    student: { count: vi.fn().mockResolvedValue(options.students ?? 5) },
    teacher: { count: vi.fn().mockResolvedValue(options.teachers ?? 2) },
    guardian: { count: vi.fn().mockResolvedValue(options.guardians ?? 10) },
    staff: { count: vi.fn().mockResolvedValue(options.staff ?? 3) },
  } as unknown as Prisma.TransactionClient;
}

describe("assertSubscriptionCapacity", () => {
  it("blocks a new student when the school's active subscription is at capacity", async () => {
    await expect(assertSubscriptionCapacity(transactionMock(), "school-1", "students"))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows creation below the configured limit", async () => {
    await expect(assertSubscriptionCapacity(transactionMock({ students: 4 }), "school-1", "students"))
      .resolves.toBeUndefined();
  });

  it("treats null limits as unlimited", async () => {
    const tx = transactionMock({ limits: { maxStudents: null, maxTeachers: null, maxGuardians: null, maxStaff: null } });
    await expect(assertSubscriptionCapacity(tx, "school-1", "students", 100)).resolves.toBeUndefined();
    expect(tx.student.count).not.toHaveBeenCalled();
  });

  it("serializes capacity checks on a per-school transaction lock", async () => {
    const tx = transactionMock({ students: 1 });
    await assertSubscriptionCapacity(tx, "school-1", "students");
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
