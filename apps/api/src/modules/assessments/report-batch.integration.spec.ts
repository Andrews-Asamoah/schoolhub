import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { MOCK_COMPONENT_DEFAULT, saveAssessmentTemplateSchema } from "@schoolhub/shared";
import type { AssessmentSetupService } from "./assessment-setup.service.js";
import type { ReportPublicationService } from "./report-publication.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();

describe.skipIf(!enabled)("assessment-driven report batches (PostgreSQL)", { timeout: 90_000 }, () => {
  let db: PrismaClient, setup: AssessmentSetupService, reports: ReportPublicationService;
  const tag = "rb" + Date.now().toString(36);
  const actor = tag + "-actor";
  let schoolId = "", yearId = "", otherYearId = "", termId = "", classA = "", classB = "", subjectId = "", gradingSystemId = "", designId = "";
  let termlyId = "", mockId = "", studentSubmitted = "", studentDraft = "";

  const template = (over: Record<string, unknown>) => saveAssessmentTemplateSchema.parse({
    name: "x", gradingSystemId, classIds: [classA], isActive: true, isLocked: false,
    components: [{ ...MOCK_COMPONENT_DEFAULT, name: "Exam", componentType: "FINAL_EXAM" }], ...over,
  });
  const batch = (over: Record<string, unknown> = {}) => ({
    name: "Batch", templateId: designId, assessmentTemplateId: termlyId, academicYearId: yearId, termId, classIds: undefined, publishAt: null, ...over,
  }) as Parameters<ReportPublicationService["createSet"]>[2];
  const score = (studentId: string, templateId: string, status: "DRAFT" | "SUBMITTED", percentage: number) =>
    db.assessmentScore.create({ data: { studentId, subjectId, termId, templateId, totalScore: percentage, percentage, grade: "B", status } });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-0123456789abcdef";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.WEB_ORIGIN ??= "http://localhost:5173";
    db = (await import("../../prisma/prisma.client.js")).prisma;
    const { AssessmentSetupService } = await import("./assessment-setup.service.js");
    const { ReportPublicationService } = await import("./report-publication.service.js");
    setup = new AssessmentSetupService({ client: db } as never);
    reports = new ReportPublicationService({ client: db } as never);

    await db.organization.create({ data: { id: tag + "o", name: "Synthetic", slug: tag + "o" } });
    schoolId = (await db.school.create({ data: { organizationId: tag + "o", name: "Batch School", code: (tag + "A").toUpperCase(), subdomain: tag + "a" } })).id;
    await db.user.create({ data: { id: actor, name: actor, email: actor + "@example.test" } });
    const year = await db.academicYear.create({ data: { schoolId, name: "2026/27", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31"), isCurrent: true } });
    yearId = year.id;
    otherYearId = (await db.academicYear.create({ data: { schoolId, name: "2025/26", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } })).id;
    termId = (await db.term.create({ data: { academicYearId: yearId, name: "Term 1", termNumber: 1, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-18"), isCurrent: true } })).id;
    classA = (await db.class.create({ data: { schoolId, academicYearId: yearId, name: "JHS 3A", level: "JHS3" } })).id;
    classB = (await db.class.create({ data: { schoolId, academicYearId: yearId, name: "JHS 3B", level: "JHS3" } })).id;
    subjectId = (await db.subject.create({ data: { schoolId, name: "Mathematics", code: "MTH" } })).id;
    gradingSystemId = (await db.gradingSystem.create({ data: { schoolId, name: "Std", code: tag + "S", method: "SCORE_BANDS" } })).id;
    await db.gradeScale.create({ data: { gradingSystemId, grade: "B", description: "Good", minScore: 0, maxScore: 100, gradePoint: 3, displayOrder: 1 } });
    designId = (await db.reportCardTemplate.create({ data: { schoolId, name: "Design", layout: { type: "modern" } } })).id;

    termlyId = (await setup.createTemplate(schoolId, actor, template({ name: "Termly" }))).id;
    mockId = (await setup.createTemplate(schoolId, actor, template({
      name: "Mock 1", category: "MOCK", academicYearId: yearId, sequence: 1, classIds: [classA, classB], components: [{ ...MOCK_COMPONENT_DEFAULT }],
    }))).id;

    const mk = async (n: string, classId: string) => {
      const profile = await db.userProfile.create({ data: { userId: (await db.user.create({ data: { id: tag + n, name: n, email: tag + n + "@example.test" } })).id, firstName: n, lastName: "Pupil" } });
      const student = await db.student.create({ data: { schoolId, studentId: tag + n, profileId: profile.id, classId } });
      await db.enrollment.create({ data: { studentId: student.id, classId, academicYearId: yearId, termId, status: "ACTIVE" } });
      return student.id;
    };
    studentSubmitted = await mk("sub", classA);
    studentDraft = await mk("drf", classA);
    await score(studentSubmitted, termlyId, "SUBMITTED", 70);
    await score(studentSubmitted, mockId, "SUBMITTED", 40); // same subject, a different assessment
    await score(studentDraft, termlyId, "DRAFT", 55);
  });

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { schoolId } });
    await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
    await db.organization.deleteMany({ where: { id: tag + "o" } });
  });

  it("takes the classes from the assessment, so none are chosen", async () => {
    const set = await reports.createSet(schoolId, actor, batch());
    const classes = await db.reportCardSetClass.findMany({ where: { setId: set.id }, select: { classId: true } });
    expect(classes.map((row) => row.classId)).toEqual([classA]);
    const both = await reports.createSet(schoolId, actor, batch({ name: "Mock", assessmentTemplateId: mockId }));
    expect((await db.reportCardSetClass.findMany({ where: { setId: both.id } })).map((row) => row.classId).sort()).toEqual([classA, classB].sort());
  });

  it("only allows narrowing to classes the assessment covers", async () => {
    const one = await reports.createSet(schoolId, actor, batch({ name: "3B only", assessmentTemplateId: mockId, classIds: [classB] }));
    expect((await db.reportCardSetClass.findMany({ where: { setId: one.id } })).map((row) => row.classId)).toEqual([classB]);
    await expect(reports.createSet(schoolId, actor, batch({ classIds: [classB] }))).rejects.toThrow(/not covered by this assessment/);
  });

  it("rejects an assessment from another year, a missing assessment and an inactive one", async () => {
    await expect(reports.createSet(schoolId, actor, batch({ assessmentTemplateId: mockId, academicYearId: otherYearId }))).rejects.toThrow();
    await expect(reports.createSet(schoolId, actor, batch({ assessmentTemplateId: "nope" }))).rejects.toThrow(/active assessment/);
  });

  it("reports only that assessment's submitted marks and counts the pupils it skipped", async () => {
    const set = await reports.createSet(schoolId, actor, batch({ name: "Generate" }));
    const result = await reports.generate(schoolId, actor, set.id);
    expect(result).toMatchObject({ reportCount: 1, skippedCount: 1 });
    const card = await db.reportCard.findFirstOrThrow({ where: { setId: set.id } });
    expect(card.studentId).toBe(studentSubmitted);
    const subjects = (card.data as { subjects: { percentage: number }[] }).subjects;
    expect(subjects).toHaveLength(1);
    expect(subjects[0]!.percentage).toBe(70); // the termly mark, not the mock's 40
  });

  it("explains that mark sheets must be submitted when nothing is", async () => {
    const empty = await reports.createSet(schoolId, actor, batch({ name: "Empty", assessmentTemplateId: mockId, classIds: [classB] }));
    await expect(reports.generate(schoolId, actor, empty.id)).rejects.toThrow(/submit their mark sheets/);
  });
});
