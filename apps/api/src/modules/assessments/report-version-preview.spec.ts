import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/prisma.service.js", () => ({ PrismaService: class {} }));
vi.mock("../../common/scope/teacher-scope.service.js", () => ({ TeacherScopeService: class {} }));
vi.mock("./report-assets.service.js", () => ({ ReportAssetsService: class {} }));

import { snapshotHash, type AcademicSnapshot } from "./report-version.js";
import { ReportVersionService } from "./report-version.service.js";

const snapshot: AcademicSnapshot = {
  schemaVersion: 2,
  report: {
    student: { class: { id: "c1", name: "JHS 2A", level: "JHS2" } },
    summary: { average: 71.5, subjectsGraded: 1, overallPosition: 3, classSize: 31 },
    attendance: { present: 58, total: 60, rate: 96.7 },
    subjects: [{ subject: { name: "Mathematics", code: "MATH" }, totalScore: 74, percentage: 74, grade: "2", position: 2 }],
  },
  school: { name: "Sunrise Academy", code: "SUN", motto: null },
  template: { name: "Classic", layout: { accentColor: "#1f2937" } },
  student: { name: "Ama Mensah", admissionNumber: "SUN-0042" },
  year: "2026/2027", term: "Term 1", set: "End of term", capturedAt: "2026-11-01T00:00:00.000Z",
};

const generated = {
  id: "v1", schoolId: "s1", studentId: "st1", classId: "c1", version: 1, stage: "GENERATED",
  snapshot, snapshotHash: snapshotHash(snapshot),
  teacherActorId: null, teacherName: null, teacherRemark: null, teacherApprovedAt: null, teacherSignature: null,
  headActorId: null, headName: null, headRemark: null, headApprovedAt: null, headSignature: null,
  publishedAt: null,
  set: { name: "End of term" },
  student: { admissionNumber: "SUN-0042", profile: { user: { image: "https://files.example/ama.jpg" } } },
};

function build(version: Record<string, unknown> | null = generated, classTeacherClassIds: string[] = ["c1"]) {
  const assets = {
    designatedSignatories: vi.fn(async () => ({ teacher: { userId: "ut", name: "Kofi Boateng" }, head: { userId: "uh", name: "Mrs. Owusu" } })),
    approvalSignatures: vi.fn(async (_school: string, v: { teacherActorId: string | null; teacherSignature: string | null; headActorId: string | null; headSignature: string | null }) => ({
      teacher: v.teacherSignature ?? (v.teacherActorId ? `data:image/png;base64,SIG-${v.teacherActorId}` : null),
      head: v.headSignature ?? (v.headActorId ? `data:image/png;base64,SIG-${v.headActorId}` : null),
    })),
    studentPhoto: vi.fn(async () => null),
    letterhead: vi.fn(async () => null),
  };
  const prisma = {
    client: {
      reportCardVersion: { findFirst: vi.fn(async () => version) },
      school: { findUnique: vi.fn(async () => ({ name: "Sunrise Academy", code: "SUN", logo: null, motto: null, address: "P.O. Box 12", phone: null, email: null, website: null, primaryColor: null })) },
    },
  };
  const teacherScope = { getAssignments: vi.fn(async () => ({ classTeacherClassIds, subjectAssignments: [], teacherId: "t1" })) };
  return { service: new ReportVersionService(prisma as never, teacherScope as never, assets as never), assets, teacherScope };
}

const manager = { id: "admin-1", role: "admin" };
const teacher = { id: "teacher-user", role: "teacher" };

describe("report version preview", () => {
  it("shows the class teacher's and headteacher's uploaded signatures before anyone has approved", async () => {
    const { service, assets } = build();
    const preview = await service.previewVersion("s1", manager, "v1");
    expect(assets.designatedSignatories).toHaveBeenCalledWith("s1", "c1");
    expect(preview.approval.teacher).toMatchObject({ name: "Kofi Boateng", signature: "data:image/png;base64,SIG-ut", approved: false });
    expect(preview.approval.head).toMatchObject({ name: "Mrs. Owusu", signature: "data:image/png;base64,SIG-uh", approved: false });
  });

  it("includes the school's details, the pupil's photo and the academic content", async () => {
    const preview = await build().service.previewVersion("s1", manager, "v1");
    expect(preview.school?.address).toBe("P.O. Box 12");
    expect(preview.pupil).toEqual({ name: "Ama Mensah", admissionNumber: "SUN-0042", className: "JHS 2A", photo: "https://files.example/ama.jpg" });
    expect(preview.report.subjects).toHaveLength(1);
    expect(preview.set).toMatchObject({ name: "End of term", academicYear: "2026/2027", term: "Term 1" });
  });

  it("keeps the approvers recorded at sign-off, never swapping in whoever holds the role today", async () => {
    const approved = {
      ...generated, stage: "PUBLISHED", publishedAt: new Date("2026-11-04"),
      teacherActorId: "old-teacher", teacherName: "Ama Quaye", teacherRemark: "Well done.", teacherApprovedAt: new Date("2026-11-02"), teacherSignature: "data:image/png;base64,CAPTURED",
      headActorId: "old-head", headName: "Mr. Darko", headRemark: "Keep going.", headApprovedAt: new Date("2026-11-03"), headSignature: null,
    };
    const { service, assets } = build(approved);
    const preview = await service.previewVersion("s1", manager, "v1");
    expect(assets.designatedSignatories).not.toHaveBeenCalled();
    expect(preview.approval.teacher).toMatchObject({ name: "Ama Quaye", signature: "data:image/png;base64,CAPTURED", approved: true });
    // No signature was captured for the head, so their own current one fills in.
    expect(preview.approval.head).toMatchObject({ name: "Mr. Darko", signature: "data:image/png;base64,SIG-old-head", approved: true });
  });

  it("marks only the signatory who has not approved as awaiting", async () => {
    const halfway = { ...generated, teacherActorId: "ut", teacherName: "Kofi Boateng", teacherApprovedAt: new Date("2026-11-02"), teacherSignature: "data:image/png;base64,T" };
    const preview = await build(halfway).service.previewVersion("s1", manager, "v1");
    expect(preview.approval.teacher.approved).toBe(true);
    expect(preview.approval.head.approved).toBe(false);
    expect(preview.approval.head.signature).toBe("data:image/png;base64,SIG-uh");
  });

  it("lets a class teacher open their own class's report but nobody else's class", async () => {
    await expect(build(generated, ["c1"]).service.previewVersion("s1", teacher, "v1")).resolves.toBeTruthy();
    await expect(build(generated, ["other-class"]).service.previewVersion("s1", teacher, "v1")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build(generated, []).service.previewPdf("s1", teacher, "v1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("does not look up class teacher assignments for school management", async () => {
    const { service, teacherScope } = build();
    await service.previewVersion("s1", { id: "head-1", role: "headteacher" }, "v1");
    expect(teacherScope.getAssignments).not.toHaveBeenCalled();
  });

  it("reports a missing version as not found", async () => {
    await expect(build(null).service.previewVersion("s1", manager, "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a report whose stored content no longer matches its fingerprint", async () => {
    const tampered = { ...generated, snapshotHash: "0".repeat(64) };
    await expect(build(tampered).service.previewVersion("s1", manager, "v1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("produces a PDF for a report that is not yet approved", async () => {
    const file = await build().service.previewPdf("s1", manager, "v1");
    expect(file.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(file.filename).toBe("academic-report-SUN-0042-v1.pdf");
  });
});
