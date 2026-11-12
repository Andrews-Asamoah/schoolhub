import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/prisma.service.js", () => ({ PrismaService: class {} }));
vi.mock("../../common/scope/teacher-scope.service.js", () => ({ TeacherScopeService: class {} }));
vi.mock("../storage/private-storage.service.js", () => ({ PrivateStorageService: class {} }));
vi.mock("./report-assets.service.js", () => ({ ReportAssetsService: class {} }));

import { MAX_BULK_RECOMMENDATIONS, ReportVersionService } from "./report-version.service.js";
import { snapshotHash } from "./report-version.js";

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

describe("headQueue", () => {
  const snapshot = (average: number, position: number) => ({
    report: { summary: { average, subjectsGraded: 1, overallPosition: position, classSize: 30 },
      subjects: [{ subject: { name: "Mathematics" }, grade: "B", percentage: 71 }] },
  });
  const row = (over: Record<string, unknown>) => ({
    id: "v", setId: "set1", studentId: "s1", classId: "c1", version: 1, stage: "TEACHER_REVIEWED",
    teacherActorId: "teacher1", teacherName: "Ms Owusu", teacherRemark: "Good term.", teacherApprovedAt: new Date(),
    headName: null, headRemark: null, headApprovedAt: null, snapshot: snapshot(72.5, 3),
    student: { admissionNumber: "A1", profile: { firstName: "Ama", lastName: "Mensah" } },
    set: { name: "Term 1", term: { name: "Term 1" } }, ...over,
  });

  function headService(rows: unknown[]) {
    const prisma = { client: {
      reportCardVersion: { findMany: vi.fn().mockResolvedValue(rows) },
      class: { findMany: vi.fn().mockResolvedValue([{ id: "c1", name: "JHS 1A" }]) },
    } };
    return { svc: new ReportVersionService(prisma as never, {} as never, {} as never), prisma };
  }

  it("keeps only the newest version per pupil and adds class name, average and position", async () => {
    const { svc } = headService([row({ id: "new", version: 2 }), row({ id: "old", version: 1 })]);
    const result = await svc.headQueue("school1", "head1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "new", className: "JHS 1A", average: 72.5, position: 3, classSize: 30 });
    expect(result[0]!.subjects).toEqual([{ name: "Mathematics", grade: "B", percentage: 71 }]);
  });

  it("allows approval only when the class teacher has recommended and someone else is approving", async () => {
    const { svc } = headService([
      row({ id: "ready", studentId: "s1" }),
      row({ id: "same", studentId: "s2", teacherActorId: "head1" }),
      row({ id: "waiting", studentId: "s3", stage: "GENERATED", teacherActorId: null }),
      row({ id: "done", studentId: "s4", stage: "APPROVED" }),
    ]);
    const byId = Object.fromEntries((await svc.headQueue("school1", "head1")).map(r => [r.id, r.canApprove]));
    expect(byId).toEqual({ ready: true, same: false, waiting: false, done: false });
  });

  it("does not expose the class teacher's user id or the raw snapshot", async () => {
    const { svc } = headService([row({})]);
    const [first] = await svc.headQueue("school1", "head1");
    expect(first).not.toHaveProperty("teacherActorId");
    expect(first).not.toHaveProperty("snapshot");
  });

  it("scopes the query to the school and to unpublished batches", async () => {
    const { svc, prisma } = headService([]);
    await svc.headQueue("school1", "head1");
    expect(prisma.client.reportCardVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ schoolId: "school1", set: { status: "GENERATED", schoolId: "school1" } }),
    }));
    expect(prisma.client.class.findMany).not.toHaveBeenCalled();
  });
});

describe("bulkHeadApprove", () => {
  const good = "Excellent progress; approved for publication.";
  const svc = () => new ReportVersionService({} as never, {} as never, {} as never);

  it("approves each pupil separately and reports a refused self-approval without stopping the rest", async () => {
    const service = svc();
    const approve = vi.spyOn(service, "headteacherApprove")
      .mockResolvedValueOnce({ id: "a", stage: "APPROVED", approvedAt: new Date() })
      .mockRejectedValueOnce(new ForbiddenException("The same person cannot approve both stages."))
      .mockResolvedValueOnce({ id: "c", stage: "APPROVED", approvedAt: new Date() });
    const result = await service.bulkHeadApprove("school1", "head1", [
      { id: "a", remark: good }, { id: "b", remark: good }, { id: "c", remark: good },
    ]);
    expect(approve).toHaveBeenCalledTimes(3);
    expect(approve).toHaveBeenCalledWith("school1", "head1", "a", good);
    expect(result.succeeded).toBe(2);
    expect(result.results[1]).toEqual({ id: "b", ok: false, error: "The same person cannot approve both stages." });
  });

  it("applies the same length, duplicate and cap rules as teacher sign-off", async () => {
    const service = svc();
    const approve = vi.spyOn(service, "headteacherApprove");
    expect((await service.bulkHeadApprove("school1", "head1", [{ id: "a", remark: "short" }])).results[0]).toMatchObject({ ok: false });
    expect(approve).not.toHaveBeenCalled();
    await expect(service.bulkHeadApprove("school1", "head1", [])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.bulkHeadApprove("school1", "head1", [{ id: "a", remark: good }, { id: "a", remark: good }])).rejects.toBeInstanceOf(BadRequestException);
    const tooMany = Array.from({ length: MAX_BULK_RECOMMENDATIONS + 1 }, (_, i) => ({ id: `v${i}`, remark: good }));
    await expect(service.bulkHeadApprove("school1", "head1", tooMany)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("teacherQueue prefill after regeneration", () => {
  const snapshot = { report: { summary: { average: 70, overallPosition: 1, classSize: 30 }, subjects: [] } };
  const row = (over: Record<string, unknown>) => ({
    id: "v2", setId: "set1", studentId: "s1", classId: "c1", version: 2, stage: "GENERATED",
    teacherRemark: null, teacherActorId: null, carriedTeacherRemark: "Steady progress.", snapshot, createdAt: new Date(),
    student: { admissionNumber: "A1", profile: { firstName: "Ama", lastName: "Mensah" } },
    set: { name: "Term 1", term: { name: "Term 1" } }, ...over,
  });
  function queueService(rows: unknown[], drafts: unknown[] = []) {
    const prisma = { client: {
      reportCardVersion: { findMany: vi.fn().mockResolvedValue(rows) },
      reportRecommendationDraft: { findMany: vi.fn().mockResolvedValue(drafts) },
    } };
    const scope = { getAssignments: vi.fn().mockResolvedValue({ teacherId: "t1", classTeacherClassIds: ["c1"] }) };
    return new ReportVersionService(prisma as never, scope as never, {} as never);
  }

  it("prefills the carried recommendation and says it was carried over", async () => {
    const [first] = await queueService([row({})]).teacherQueue("school1", "u1");
    expect(first).toMatchObject({ draftRemark: "Steady progress.", carriedOver: true });
    expect(first).not.toHaveProperty("carriedTeacherRemark");
  });

  it("lets an unsent draft win over the carried text", async () => {
    const [first] = await queueService([row({})], [{ setId: "set1", studentId: "s1", remark: "My newer draft." }]).teacherQueue("school1", "u1");
    expect(first).toMatchObject({ draftRemark: "My newer draft.", carriedOver: false });
  });

  it("does not prefill a pupil who is already signed off", async () => {
    const [first] = await queueService([row({ stage: "TEACHER_REVIEWED", teacherRemark: "Signed text." })]).teacherQueue("school1", "u1");
    expect(first).toMatchObject({ draftRemark: null, carriedOver: false });
  });
});

describe("headQueue carried recommendation", () => {
  it("returns the headteacher's carried text for rows waiting for approval", async () => {
    const prisma = { client: {
      reportCardVersion: { findMany: vi.fn().mockResolvedValue([{
        id: "v2", setId: "set1", studentId: "s1", classId: "c1", version: 2, stage: "TEACHER_REVIEWED",
        teacherActorId: "teacher1", teacherName: "Ms Owusu", teacherRemark: "Good term.", teacherApprovedAt: new Date(),
        headName: null, headRemark: null, headApprovedAt: null, carriedHeadRemark: "Approved with praise.",
        snapshot: { report: { summary: { average: 70, overallPosition: 1, classSize: 30 }, subjects: [] } },
        student: { admissionNumber: "A1", profile: { firstName: "Ama", lastName: "Mensah" } },
        set: { name: "Term 1", term: { name: "Term 1" } },
      }]) },
      class: { findMany: vi.fn().mockResolvedValue([{ id: "c1", name: "JHS 1A" }]) },
    } };
    const [first] = await new ReportVersionService(prisma as never, {} as never, {} as never).headQueue("school1", "head1");
    expect(first).toMatchObject({ carriedHeadRemark: "Approved with praise.", canApprove: true });
  });
});

describe("the recommendation source is recorded when someone signs off", () => {
  const snapshot = { report: { summary: { average: 70 }, subjects: [] } };

  function signOff(version: Record<string, unknown>, role: "teacher" | "head") {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({});
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      reportCardVersion: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...version, snapshot, snapshotHash: snapshotHash(snapshot), set: { status: "GENERATED", schoolId: "school1" } })
          .mockResolvedValue({ id: "v1" }),
        updateMany,
      },
      reportRecommendationDraft: { deleteMany: vi.fn() },
      auditLog: { create: auditCreate },
    };
    const prisma = { client: { user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", name: "Ms Owusu" }) },
      $transaction: vi.fn((callback: (client: unknown) => unknown) => callback(tx)) } };
    const scope = { getAssignments: vi.fn().mockResolvedValue({ teacherId: "t1", classTeacherClassIds: ["c1"] }) };
    const assets = { signatureFor: vi.fn().mockResolvedValue(null) };
    const svc = new ReportVersionService(prisma as never, scope as never, assets as never);
    return { run: () => role === "teacher"
      ? svc.recommend("school1", "u1", "v1", "  Works steadily.  ")
      : svc.headteacherApprove("school1", "u1", "v1", "  Approved with praise.  "), updateMany, auditCreate };
  }

  const base = { id: "v1", setId: "set1", studentId: "s1", classId: "c1", version: 1 };

  it("seals the class teacher's recommendation as MANUAL and says so in the audit trail", async () => {
    const { run, updateMany, auditCreate } = signOff({ ...base, stage: "GENERATED" }, "teacher");
    await run();
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ stage: "TEACHER_REVIEWED", teacherRemark: "Works steadily.", teacherRemarkSource: "MANUAL" }),
    }));
    expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      newValues: expect.objectContaining({ stage: "TEACHER_REVIEWED", remark: "Works steadily.", source: "MANUAL" }),
    }) });
  });

  it("seals the headteacher's recommendation as MANUAL and says so in the audit trail", async () => {
    const { run, updateMany, auditCreate } = signOff({ ...base, stage: "TEACHER_REVIEWED", teacherActorId: "teacher1", teacherApprovedAt: new Date() }, "head");
    await run();
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ stage: "APPROVED", headRemark: "Approved with praise.", headRemarkSource: "MANUAL" }),
    }));
    expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      newValues: expect.objectContaining({ stage: "APPROVED", remark: "Approved with praise.", source: "MANUAL" }),
    }) });
  });
});
