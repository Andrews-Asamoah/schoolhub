import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/prisma.service.js", () => ({ PrismaService: class {} }));
vi.mock("../../common/scope/teacher-scope.service.js", () => ({ TeacherScopeService: class {} }));
vi.mock("../storage/private-storage.service.js", () => ({ PrivateStorageService: class {} }));

import { MAX_BULK_RECOMMENDATIONS, ReportVersionService } from "./report-version.service.js";

function service(overrides: { classTeacherClassIds?: string[]; version?: Record<string, unknown> | null } = {}) {
  const drafts = { upsert: vi.fn(), deleteMany: vi.fn() };
  const prisma = {
    client: {
      reportRecommendationDraft: drafts,
      reportCardVersion: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(overrides.version === undefined
            ? { id: "v1", setId: "set1", studentId: "s1", classId: "c1", stage: "GENERATED", set: { status: "GENERATED" } }
            : overrides.version)
          .mockResolvedValue({ id: "v1" }),
      },
    },
  };
  const teacherScope = {
    getAssignments: vi.fn().mockResolvedValue({ teacherId: "t1", classTeacherClassIds: overrides.classTeacherClassIds ?? ["c1"] }),
  };
  return { svc: new ReportVersionService(prisma as never, teacherScope as never, {} as never), drafts };
}

describe("saveDraft", () => {
  it("stores the text for the appointed class teacher", async () => {
    const { svc, drafts } = service();
    await expect(svc.saveDraft("school1", "u1", "v1", "  Works steadily.  ")).resolves.toEqual({ id: "v1", saved: true });
    expect(drafts.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ schoolId: "school1", setId: "set1", studentId: "s1", authorId: "u1", remark: "Works steadily.", source: "MANUAL" }),
    }));
  });

  it("clears the draft when the text is empty", async () => {
    const { svc, drafts } = service();
    await expect(svc.saveDraft("school1", "u1", "v1", "   ")).resolves.toEqual({ id: "v1", saved: false });
    expect(drafts.deleteMany).toHaveBeenCalledWith({ where: { schoolId: "school1", setId: "set1", studentId: "s1" } });
    expect(drafts.upsert).not.toHaveBeenCalled();
  });

  it("refuses a teacher who is not the class teacher of the pupil's class", async () => {
    const { svc, drafts } = service({ classTeacherClassIds: ["other"] });
    await expect(svc.saveDraft("school1", "u1", "v1", "Text")).rejects.toThrow(/assigned class teacher/);
    expect(drafts.upsert).not.toHaveBeenCalled();
  });

  it("refuses a version that has already been recommended", async () => {
    const { svc } = service({ version: { id: "v1", setId: "set1", studentId: "s1", classId: "c1", stage: "TEACHER_REVIEWED", set: { status: "GENERATED" } } });
    await expect(svc.saveDraft("school1", "u1", "v1", "Text")).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects text over 2000 characters", async () => {
    const { svc } = service();
    await expect(svc.saveDraft("school1", "u1", "v1", "x".repeat(2001))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("bulkRecommend", () => {
  const good = "Shows steady progress in every subject.";

  it("reports each row separately so one failure does not block the others", async () => {
    const { svc } = service();
    const recommend = vi.spyOn(svc, "recommend")
      .mockResolvedValueOnce({ id: "a", stage: "TEACHER_REVIEWED", approvedAt: new Date() })
      .mockRejectedValueOnce(new ConflictException("This version has already been recommended or has been superseded."))
      .mockResolvedValueOnce({ id: "c", stage: "TEACHER_REVIEWED", approvedAt: new Date() });
    const result = await svc.bulkRecommend("school1", "u1", [
      { id: "a", remark: good }, { id: "b", remark: good }, { id: "c", remark: good },
    ]);
    expect(recommend).toHaveBeenCalledTimes(3);
    expect(result.succeeded).toBe(2);
    expect(result.results[1]).toEqual({ id: "b", ok: false, error: "This version has already been recommended or has been superseded." });
  });

  it("fails a row whose recommendation is too short without calling recommend", async () => {
    const { svc } = service();
    const recommend = vi.spyOn(svc, "recommend");
    const result = await svc.bulkRecommend("school1", "u1", [{ id: "a", remark: "short" }]);
    expect(recommend).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ id: "a", ok: false });
  });

  it("refuses an empty list, a duplicate pupil and more than the cap", async () => {
    const { svc } = service();
    await expect(svc.bulkRecommend("school1", "u1", [])).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.bulkRecommend("school1", "u1", [{ id: "a", remark: good }, { id: "a", remark: good }])).rejects.toBeInstanceOf(BadRequestException);
    const tooMany = Array.from({ length: MAX_BULK_RECOMMENDATIONS + 1 }, (_, i) => ({ id: `v${i}`, remark: good }));
    await expect(svc.bulkRecommend("school1", "u1", tooMany)).rejects.toBeInstanceOf(BadRequestException);
  });
});
