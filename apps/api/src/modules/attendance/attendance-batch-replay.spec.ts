import { describe, expect, it, vi } from "vitest";
import { ConflictException, BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { BatchAttendanceInput } from "@schoolhub/shared";
import type { PrismaService } from "../../prisma/prisma.service.js";
import { AttendanceService } from "./attendance.service.js";

// The generated Prisma client is not needed here: every database call is stubbed below.
vi.mock("../../prisma/prisma.service.js", () => ({ PrismaService: class {} }));
vi.mock("@prisma/client", () => ({ Prisma: {}, PrismaClient: class {} }));

const input: BatchAttendanceInput = {
  date: "2026-11-02",
  records: [{ studentId: "stu-1", status: "PRESENT" }],
};
const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function serviceWith(replay: unknown) {
  const findUnique = vi.fn().mockResolvedValue(replay);
  // Any other prisma access would throw: a replay must short-circuit before the
  // calendar, enrolment, assignment and transaction work.
  const client = new Proxy(
    { attendanceBatchReplay: { findUnique } },
    { get: (target, prop) => (prop in target ? (target as never)[prop] : vi.fn(() => { throw new Error(`unexpected prisma.${String(prop)}`); })) },
  );
  const calendar = { assertInstructionalDate: vi.fn(() => { throw new Error("calendar must not be consulted"); }) };
  const teacherScope = { getAssignments: vi.fn(() => { throw new Error("assignments must not be consulted"); }) };
  const service = new AttendanceService({ client } as unknown as PrismaService, teacherScope as never, calendar as never);
  return { service, findUnique, calendar, teacherScope };
}

describe("attendance batch idempotency", () => {
  it("rejects malformed idempotency keys before touching the database", async () => {
    const { service, findUnique } = serviceWith(null);
    await expect(service.batchRecordAttendance("school-A", "user-1", input, "teacher", "short")).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns the original result for a retry, scoped to school, user and key, without re-checking eligibility", async () => {
    const { service, findUnique, calendar, teacherScope } = serviceWith({
      inputHash: hashOf(input), recordCount: 1, date: new Date("2026-11-02T00:00:00.000Z"),
    });
    await expect(service.batchRecordAttendance("school-A", "user-1", input, "teacher", "reg-abcdefgh")).resolves.toEqual({
      success: true, count: 1, date: "2026-11-02", replayed: true,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { schoolId_userId_key: { schoolId: "school-A", userId: "user-1", key: "reg-abcdefgh" } },
    });
    expect(calendar.assertInstructionalDate).not.toHaveBeenCalled();
    expect(teacherScope.getAssignments).not.toHaveBeenCalled();
  });

  it("refuses to reuse a key for a different batch", async () => {
    const other: BatchAttendanceInput = { ...input, records: [{ studentId: "stu-1", status: "ABSENT" }] };
    const { service } = serviceWith({ inputHash: hashOf(input), recordCount: 1, date: new Date("2026-11-02T00:00:00.000Z") });
    await expect(service.batchRecordAttendance("school-A", "user-1", other, "teacher", "reg-abcdefgh")).rejects.toBeInstanceOf(ConflictException);
  });
});
