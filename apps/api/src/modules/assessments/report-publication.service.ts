import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreateReportSetInput } from "@schoolhub/shared";
import { coveredClasses, REPORTABLE_SCORE_STATUSES } from "./assessment-entry.js";
import { carriedRecommendations, snapshotHash } from "./report-version.js";
import { ReportAssetsService } from "./report-assets.service.js";
import { buildSubjectRow, buildSummary, overallPositions, summariseAttendance } from "./report-card-data.js";

const APPROVAL_FIELDS = { teacherActorId: true, teacherName: true, teacherRemark: true, teacherSignature: true, headActorId: true, headName: true, headRemark: true, headSignature: true } as const;
type ApprovalVersion = { setId: string; teacherActorId: string | null; headActorId: string | null; teacherName: string | null; teacherRemark: string | null; teacherSignature: string | null; headName: string | null; headRemark: string | null; headSignature: string | null };

/** The newest published version per key; rows must already be ordered newest first. */
function latestBySet<T extends { setId: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) if (!map.has(row.setId)) map.set(row.setId, row);
  return map;
}

/** The class teacher's and headteacher's remarks and signatures, as families see them. */
function approvalOf(version: ApprovalVersion | undefined, signatures?: { teacher: string | null; head: string | null }) {
  if (!version) return null;
  return {
    teacher: { name: version.teacherName, remark: version.teacherRemark, signature: signatures ? signatures.teacher : version.teacherSignature },
    head: { name: version.headName, remark: version.headRemark, signature: signatures ? signatures.head : version.headSignature },
  };
}

@Injectable()
export class ReportPublicationService {
  constructor(private readonly prisma: PrismaService, private readonly assets: ReportAssetsService) {}

  async getWorkspace(schoolId: string) {
    const db = this.prisma.client;
    const [years, templates, sets, assessments, classes] = await Promise.all([
      db.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: "desc" }, select: { id: true, name: true, isCurrent: true, terms: { orderBy: { termNumber: "asc" }, select: { id: true, name: true, termNumber: true, isCurrent: true } } } }),
      db.reportCardTemplate.findMany({ where: { schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true, description: true, isActive: true, layout: true } }),
      db.reportCardSet.findMany({ where: { schoolId }, orderBy: { updatedAt: "desc" }, take: 50, include: { assessmentTemplate: { select: { name: true } }, template: { select: { id: true, name: true } }, academicYear: { select: { id: true, name: true } }, term: { select: { id: true, name: true, termNumber: true } }, targetClasses: { include: { class: { select: { id: true, name: true } } } }, _count: { select: { reportCards: true } } } }),
      db.assessmentTemplate.findMany({
        where: { schoolId, isActive: true },
        orderBy: [{ category: "asc" }, { academicYearId: "asc" }, { sequence: "asc" }, { name: "asc" }],
        select: { id: true, name: true, category: true, academicYearId: true, sequence: true, termNumber: true, classId: true, classLevel: true, departmentId: true, classes: { select: { classId: true } } },
      }),
      db.class.findMany({ where: { schoolId, deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true, departmentId: true, academicYearId: true } }),
    ]);
    return { years, templates, assessments: assessments.map(({ classes: rows, classId, classLevel, departmentId, ...assessment }) => ({ ...assessment, classes: coveredClasses({ classId, classIds: rows.map((row) => row.classId), classLevel, departmentId }, classes).map(({ id, name, academicYearId }) => ({ id, name, academicYearId })) })), sets: sets.map((s) => ({ id: s.id, name: s.name, status: s.status, assessment: s.assessmentTemplate?.name ?? null, template: s.template, academicYear: s.academicYear, term: s.term, classes: s.targetClasses.map((r) => r.class), reportCount: s._count.reportCards, publishAt: s.publishAt, publishedAt: s.publishedAt, isReviewed: s.isReviewed, reviewedAt: s.reviewedAt, updatedAt: s.updatedAt })) };
  }

  async getSetReports(schoolId: string, setId: string) {
    const db = this.prisma.client;
    const set = await db.reportCardSet.findFirst({ where: { id: setId, schoolId }, select: { id: true } });
    if (!set) throw new NotFoundException("Report batch not found.");

    const reports = await db.reportCard.findMany({
      where: { setId: set.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, setId: true, studentId: true,
        data: true,
        publishedAt: true,
        student: {
          select: {
            admissionNumber: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    const versions = await db.reportCardVersion.findMany({
      where: { schoolId, setId, stage: { in: ["GENERATED","TEACHER_REVIEWED","APPROVED","PUBLISHED"] } },
      orderBy: { version: "desc" },
      select: { id: true, studentId: true, stage: true, version: true,
        teacherName: true, teacherRemark: true, teacherApprovedAt: true,
        headName: true, headRemark: true, headApprovedAt: true, snapshotHash: true,
        carriedTeacherRemark: true, carriedHeadRemark: true },
    });
    const latest = new Map<string, typeof versions[number]>();
    for (const version of versions) if (!latest.has(version.studentId)) latest.set(version.studentId, version);
    return reports.map(report => ({ ...report, version: latest.get(report.studentId) ?? null }));
  }

  async getMyPublishedReports(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({ where: { schoolId, deletedAt: null, profile: { userId } }, select: { id: true } });
    if (!student) throw new NotFoundException("Student record not found.");
    const reports = await this.prisma.client.reportCard.findMany({
      where: { studentId: student.id, publishedAt: { not: null }, set: { schoolId, status: "PUBLISHED" } },
      orderBy: { publishedAt: "desc" },
      select: { id: true, setId: true, studentId: true, data: true, publishedAt: true, student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true, user: { select: { image: true } } } } } }, set: { select: { name: true, academicYear: { select: { name: true } }, term: { select: { name: true, termNumber: true } }, template: { select: { name: true, layout: true } }, school: { select: { name: true, code: true, email: true, phone: true, address: true, logo: true, motto: true, website: true, primaryColor: true, secondaryColor: true } } } } },
    });
    const published = await this.prisma.client.reportCardVersion.findMany({
      where: { schoolId, studentId: student.id, stage: "PUBLISHED", publishedAt: { not: null } },
      orderBy: { version: "desc" },
      select: { setId: true, ...APPROVAL_FIELDS },
    });
    const bySet = latestBySet(published);
    // Where a signature was not captured when the report was approved, show the approver's current one.
    const signatureCache = new Map<string, Promise<string | null>>();
    return Promise.all(reports.map(async report => {
      const version = bySet.get(report.setId);
      const signatures = version ? await this.assets.approvalSignatures(schoolId, version, signatureCache) : undefined;
      return { ...report, pdfAvailable: !!version, approval: approvalOf(version, signatures) };
    }));
  }

  async getGuardianPublishedReports(schoolId: string, userId: string) {
    const guardian = await this.prisma.client.guardian.findFirst({
      where: { schoolId, deletedAt: null, isActive: true, profile: { userId } },
      select: { students: { where: { receiveReports: true }, select: { student: { select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } } } } },
    });
    if (!guardian) throw new NotFoundException("Guardian record not found.");
    const studentIds = guardian.students.map((row) => row.student.id);
    if (!studentIds.length) return [];
    const reports = await this.prisma.client.reportCard.findMany({
      where: { studentId: { in: studentIds }, publishedAt: { not: null }, set: { schoolId, status: "PUBLISHED" } },
      orderBy: { publishedAt: "desc" },
      select: { id: true, setId: true, studentId: true, data: true, publishedAt: true, student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true, user: { select: { image: true } } } } } }, set: { select: { name: true, academicYear: { select: { name: true } }, term: { select: { name: true, termNumber: true } }, template: { select: { name: true, layout: true } }, school: { select: { name: true, code: true, email: true, phone: true, address: true, logo: true, motto: true, website: true, primaryColor: true, secondaryColor: true } } } } },
    });
    const published = await this.prisma.client.reportCardVersion.findMany({
      where: { schoolId, studentId: { in: studentIds }, stage: "PUBLISHED",
        publishedAt: { not: null } },
      orderBy: { version: "desc" },
      select: { setId: true, studentId: true, ...APPROVAL_FIELDS },
    });
    const byReport = latestBySet(published.map(v => ({ ...v, setId: v.setId + ":" + v.studentId })));
    const signatureCache = new Map<string, Promise<string | null>>();
    return Promise.all(reports.map(async report => {
      const version = byReport.get(report.setId + ":" + report.studentId);
      const signatures = version ? await this.assets.approvalSignatures(schoolId, version, signatureCache) : undefined;
      return { ...report, pdfAvailable: !!version, approval: approvalOf(version, signatures) };
    }));
  }

  async createSet(schoolId: string, actorId: string, input: CreateReportSetInput) {
    const db = this.prisma.client;
    const [template, assessment, year, term, classes] = await Promise.all([
      db.reportCardTemplate.findFirst({ where: { id: input.templateId, schoolId, isActive: true }, select: { id: true } }),
      db.assessmentTemplate.findFirst({
        where: { id: input.assessmentTemplateId, schoolId, isActive: true },
        select: { id: true, category: true, academicYearId: true, termNumber: true, classId: true, classLevel: true, departmentId: true, classes: { select: { classId: true } } },
      }),
      db.academicYear.findFirst({ where: { id: input.academicYearId, schoolId }, select: { id: true } }),
      db.term.findFirst({ where: { id: input.termId, academicYearId: input.academicYearId }, select: { id: true, termNumber: true } }),
      db.class.findMany({ where: { schoolId, deletedAt: null, isActive: true }, select: { id: true, level: true, departmentId: true, academicYearId: true } }),
    ]);
    if (!template || !year || !term) throw new BadRequestException("Choose a report design, academic year, and term belonging to this school.");
    if (!assessment) throw new BadRequestException("Choose an active assessment from this school.");
    if (assessment.academicYearId && assessment.academicYearId !== year.id) throw new BadRequestException("This assessment belongs to a different academic year.");
    if (assessment.termNumber && assessment.termNumber !== term.termNumber) throw new BadRequestException(`This assessment is only taken in term ${assessment.termNumber}.`);

    // The assessment decides which classes are reported; a narrowing may only name some of them.
    const covered = coveredClasses({ ...assessment, classIds: assessment.classes.map((row) => row.classId) }, classes, year.id);
    const chosen = input.classIds?.length ? covered.filter((klass) => input.classIds!.includes(klass.id)) : covered;
    if (!covered.length) throw new BadRequestException("This assessment doesn't cover any active class in the selected academic year.");
    if (input.classIds?.length && chosen.length !== new Set(input.classIds).size) throw new BadRequestException("One or more selected classes are not covered by this assessment.");

    const publishAt = input.publishAt ? new Date(input.publishAt) : null;
    if (publishAt && Number.isNaN(publishAt.getTime())) throw new BadRequestException("The scheduled publication date is invalid.");
    return db.$transaction(async (tx) => {
      const set = await tx.reportCardSet.create({
        data: {
          schoolId, templateId: template.id, assessmentTemplateId: assessment.id, academicYearId: year.id, termId: term.id, name: input.name, publishAt,
          targetClasses: { create: chosen.map(({ id }) => ({ classId: id })) },
        },
      });
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "CREATE", entityType: "REPORT_CARD_SET", entityId: set.id, newValues: { name: set.name, assessmentTemplateId: assessment.id, classIds: chosen.map(({ id }) => id) } } });
      return set;
    });
  }

  async generate(schoolId: string, actorId: string, setId: string) {
    const db = this.prisma.client;
    const set = await db.reportCardSet.findFirst({ where: { id: setId, schoolId },
      include: { targetClasses: { select: { classId: true } },
        school: { select: { name: true, code: true, motto: true } },
        template: { select: { name: true, layout: true } },
        academicYear: { select: { name: true } }, term: { select: { name: true, startDate: true, endDate: true } } } });
    if (!set) throw new NotFoundException("Report batch not found.");
    if (set.status === "PUBLISHED" || set.status === "ARCHIVED") throw new ConflictException("Published or archived reports cannot be regenerated.");
    if (set.status === "GENERATING") throw new ConflictException("This report batch is already being generated.");
    const classIds = set.targetClasses.map(({ classId }) => classId);
    if (!classIds.length) throw new BadRequestException("Choose at least one class.");
    const claimed = await db.reportCardSet.updateMany({
      where: { id: set.id, schoolId, status: { in: ["DRAFT","GENERATED"] } },
      data: { status: "GENERATING", isReviewed: false, reviewedAt: null },
    });
    if (claimed.count !== 1) throw new ConflictException("The report batch changed; reload before regenerating.");
    try {
      const students = await db.student.findMany({
        where: { schoolId, deletedAt: null, enrollments: { some: { academicYearId: set.academicYearId, termId: set.termId, status: { in: ["ACTIVE", "COMPLETED"] }, classId: { in: classIds } } } },
        select: {
          id: true, admissionNumber: true,
          profile: { select: { firstName: true, lastName: true } },
          enrollments: { where: { academicYearId: set.academicYearId, termId: set.termId, status: { in: ["ACTIVE", "COMPLETED"] }, classId: { in: classIds } }, select: { class: { select: { id: true, name: true, level: true } } }, take: 1 },
          // A batch reports its one assessment. Batches made before reports were assessment-based
          // fall back to the signed-off termly scores of the term.
          assessmentScores: { where: { termId: set.termId, status: { in: [...REPORTABLE_SCORE_STATUSES] }, ...(set.assessmentTemplateId ? { templateId: set.assessmentTemplateId } : { template: { category: "TERMLY" } }) }, include: { subject: { select: { id: true, name: true, code: true } }, template: { select: { components: { select: { id: true, componentType: true, maxMarks: true, weight: true } }, gradingSystem: { select: { name: true, method: true, gradeScales: { orderBy: { displayOrder: "asc" }, select: { grade: true, description: true, minScore: true, maxScore: true } } } } } }, componentScores: { include: { component: { select: { id: true, name: true, weight: true, maxMarks: true } } }, orderBy: { createdAt: "asc" } } } },
          remarks: { where: { termId: set.termId }, include: { teacher: { include: { profile: true } } } },
        },
      });
      const reportableStudents = students.filter((student) => student.assessmentScores.length > 0);
      const [classSizes, attendanceRows] = await Promise.all([
        db.enrollment.groupBy({
          by: ["classId"],
          where: { academicYearId: set.academicYearId, termId: set.termId, classId: { in: classIds }, status: { in: ["ACTIVE", "COMPLETED"] }, student: { schoolId, deletedAt: null } },
          _count: { _all: true },
        }),
        db.attendance.findMany({
          where: { studentId: { in: reportableStudents.map((student) => student.id) }, date: { gte: set.term.startDate, lte: set.term.endDate } },
          select: { studentId: true, status: true },
        }),
      ]);
      const sizeByClass = new Map(classSizes.map((row) => [row.classId, row._count._all]));
      const statusesByStudent = new Map<string, string[]>();
      for (const row of attendanceRows) statusesByStudent.set(row.studentId, [...(statusesByStudent.get(row.studentId) ?? []), row.status]);
      const subjectsByStudent = new Map(reportableStudents.map((student) => [
        student.id,
        student.assessmentScores.map((score) => buildSubjectRow({
          subject: score.subject, totalScore: Number(score.totalScore), percentage: Number(score.percentage), grade: score.grade, position: score.position, remarks: score.remarks,
          template: {
            components: score.template.components.map((c) => ({ id: c.id, componentType: c.componentType, maxMarks: Number(c.maxMarks), weight: Number(c.weight) })),
            gradeScales: score.template.gradingSystem.gradeScales,
          },
          cells: score.componentScores.map((c) => ({ componentId: c.componentId, componentName: c.component.name, weight: Number(c.component.weight), marksObtained: Number(c.marksObtained), maxMarks: Number(c.maxMarks), percentage: Number(c.percentage) })),
        })),
      ]));
      const positions = overallPositions(reportableStudents.flatMap((student) => {
        const classId = student.enrollments[0]?.class.id;
        return classId ? [{ id: student.id, classId, subjectPercentages: subjectsByStudent.get(student.id)!.map((row) => row.percentage) }] : [];
      }));
      if (!reportableStudents.length) {
        throw new BadRequestException("No submitted marks were found for this assessment in the selected classes and term. Teachers must submit their mark sheets before reports can be generated.");
      }

      let carriedCount = 0;
      await db.$transaction(async (tx) => {
        carriedCount = 0; // a retried transaction must not double count
        // Older snapshots survive regeneration even if the student is no longer
        // reportable: they are independent of the mutable ReportCard row.
        await tx.reportCardVersion.updateMany({
          where: { setId: set.id, studentId: { notIn: reportableStudents.map(s => s.id) },
            stage: { in: ["GENERATED","TEACHER_REVIEWED","APPROVED"] } },
          data: { stage: "SUPERSEDED" },
        });
        await tx.reportCard.deleteMany({
          where: { setId: set.id, studentId: { notIn: reportableStudents.map((student) => student.id) } },
        });
        for (const student of reportableStudents) {
          const subjects = subjectsByStudent.get(student.id)!;
          const classRow = student.enrollments[0]?.class ?? null;
          const data = {
            schemaVersion: 2,
            student: { id: student.id, class: classRow },
            academicYearId: set.academicYearId,
            termId: set.termId,
            summary: buildSummary(subjects, positions.get(student.id) ?? null, classRow ? (sizeByClass.get(classRow.id) ?? 0) : 0),
            attendance: summariseAttendance(statusesByStudent.get(student.id) ?? []),
            subjects,
            // The scale the grades came from, kept in the sealed snapshot so the printed report can explain them.
            gradeScale: (() => {
              const system = student.assessmentScores[0]?.template.gradingSystem;
              return system ? { name: system.name, method: system.method, rows: system.gradeScales.map((g) => ({ grade: g.grade, description: g.description, min: Number(g.minScore), max: Number(g.maxScore) })) } : null;
            })(),
            remarks: student.remarks.map((r) => ({ type: r.remarkType, content: r.content, teacher: [r.teacher.profile?.firstName, r.teacher.profile?.lastName].filter(Boolean).join(" ") })),
            generatedAt: new Date().toISOString(),
          };
          await tx.reportCard.upsert({ where: { setId_studentId: { setId: set.id, studentId: student.id } }, create: { setId: set.id, studentId: student.id, data: data as Prisma.InputJsonValue }, update: { data: data as Prisma.InputJsonValue, publishedAt: null } });
          const classId = student.enrollments[0]?.class.id;
          if (!classId) throw new BadRequestException("Student's class enrolment is required for report approval.");
          const previous = await tx.reportCardVersion.findFirst({
            where: { setId: set.id, studentId: student.id }, orderBy: { version: "desc" },
            select: { version: true, teacherRemark: true, headRemark: true, carriedTeacherRemark: true, carriedHeadRemark: true },
          });
          const carried = carriedRecommendations(previous);
          if (carried.carriedTeacherRemark || carried.carriedHeadRemark) carriedCount += 1;
          const snapshot = {
            schemaVersion: 1, report: data,
            school: set.school, template: set.template,
            student: { name: [student.profile.firstName, student.profile.lastName].filter(Boolean).join(" "),
              admissionNumber: student.admissionNumber },
            year: set.academicYear.name, term: set.term.name, set: set.name,
            capturedAt: new Date().toISOString(),
          };
          await tx.reportCardVersion.updateMany({
            where: { setId: set.id, studentId: student.id,
              stage: { in: ["GENERATED","TEACHER_REVIEWED","APPROVED"] } },
            data: { stage: "SUPERSEDED" },
          });
          await tx.reportCardVersion.create({ data: {
            schoolId, setId: set.id, studentId: student.id, classId,
            version: (previous?.version ?? 0) + 1,
            snapshot: snapshot as Prisma.InputJsonValue,
            snapshotHash: snapshotHash(snapshot),
            ...carried,
          } });
        }
        await tx.reportCardSet.update({ where: { id: set.id }, data: { status: "GENERATED", isReviewed: false, reviewedAt: null } });
        await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE", entityType: "REPORT_CARD_SET", entityId: set.id, newValues: { operation: "GENERATE", reportCount: reportableStudents.length, recommendationsCarriedOver: carriedCount } } });
      });
      return { id: set.id, status: "GENERATED", reportCount: reportableStudents.length, skippedCount: students.length - reportableStudents.length, isReviewed: false };
    } catch (error) {
      await db.reportCardSet.update({ where: { id: set.id }, data: { status: "DRAFT" } }).catch(() => undefined);
      throw error;
    }
  }

  async markReviewed(schoolId: string, actorId: string, setId: string) {
    const db = this.prisma.client;
    return db.$transaction(async (tx) => {
      const set = await tx.reportCardSet.findFirst({
        where: { id: setId, schoolId },
        include: { _count: { select: { reportCards: true } } },
      });
      if (!set) throw new NotFoundException("Report batch not found.");
      if (set.status !== "GENERATED") throw new ConflictException("Generate the report batch successfully before reviewing it.");
      if (!set._count.reportCards) throw new BadRequestException("There are no reports to review.");
      const approved = await tx.reportCardVersion.findMany({
        where: { schoolId, setId, stage: "APPROVED" },
        select: { studentId: true, teacherActorId: true, headActorId: true,
          teacherApprovedAt: true, headApprovedAt: true, snapshot: true, snapshotHash: true },
      });
      if (approved.length !== set._count.reportCards ||
          approved.some(v => !v.teacherActorId || !v.headActorId || !v.teacherApprovedAt ||
            !v.headApprovedAt || v.teacherActorId === v.headActorId ||
            snapshotHash(v.snapshot) !== v.snapshotHash)) {
        throw new ConflictException("Each pupil needs a verified class-teacher recommendation and a separate headteacher approval before the batch may be reviewed.");
      }

      const reviewedAt = new Date();
      const updated = await tx.reportCardSet.update({
        where: { id: set.id },
        data: { isReviewed: true, reviewedAt },
        select: { id: true, status: true, isReviewed: true, reviewedAt: true },
      });
      await tx.auditLog.create({
        data: {
          schoolId,
          userId: actorId,
          action: "UPDATE",
          entityType: "REPORT_CARD_SET",
          entityId: set.id,
          newValues: { operation: "REVIEW", reportCount: set._count.reportCards, reviewedAt: reviewedAt.toISOString() },
        },
      });
      return updated;
    });
  }

  /**
   * Takes a published batch back to "generated" so corrected marks can be regenerated.
   * Families stop seeing the old reports until the batch is approved and published again.
   * The published snapshots are kept as history (superseded), never edited or deleted.
   */
  async reopen(schoolId: string, actorId: string, setId: string, reason: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const set = await tx.reportCardSet.findFirst({ where: { id: setId, schoolId }, select: { id: true, name: true, status: true } });
      if (!set) throw new NotFoundException("Report batch not found.");
      if (set.status !== "PUBLISHED") throw new ConflictException("Only a published batch can be reopened.");
      const claimed = await tx.reportCardSet.updateMany({
        where: { id: set.id, schoolId, status: "PUBLISHED" },
        data: { status: "GENERATED", isReviewed: false, reviewedAt: null, publishedAt: null },
      });
      if (claimed.count !== 1) throw new ConflictException("The report batch changed; reload and try again.");
      const superseded = await tx.reportCardVersion.updateMany({ where: { setId: set.id, schoolId, stage: "PUBLISHED" }, data: { stage: "SUPERSEDED" } });
      await tx.reportCard.updateMany({ where: { setId: set.id }, data: { publishedAt: null } });
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE", entityType: "REPORT_CARD_SET", entityId: set.id, newValues: { operation: "REOPEN", reason, supersededVersions: superseded.count } } });
      return { id: set.id, name: set.name, status: "GENERATED" as const };
    });
  }

  async publish(schoolId: string, actorId: string, setId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const set = await tx.reportCardSet.findFirst({ where: { id: setId, schoolId }, include: { _count: { select: { reportCards: true } } } });
      if (!set) throw new NotFoundException("Report batch not found.");
      if (set.status !== "GENERATED") throw new ConflictException("Generate reports successfully before publishing them.");
      if (!set.isReviewed || !set.reviewedAt) throw new ConflictException("Review the generated reports and mark the batch reviewed before publishing.");
      if (!set._count.reportCards) throw new BadRequestException("There are no reports to publish.");
      const approved = await tx.reportCardVersion.findMany({
        where: { schoolId, setId, stage: "APPROVED" },
        select: { id: true, studentId: true, teacherActorId: true, headActorId: true,
          teacherApprovedAt: true, headApprovedAt: true, snapshot: true, snapshotHash: true },
      });
      if (approved.length !== set._count.reportCards ||
          approved.some(v => !v.teacherActorId || !v.headActorId || !v.teacherApprovedAt ||
            !v.headApprovedAt || v.teacherActorId === v.headActorId ||
            snapshotHash(v.snapshot) !== v.snapshotHash)) {
        throw new ConflictException("Published reports require complete, independently approved and integrity-verified student versions.");
      }
      const now = new Date();
      if (set.publishAt && set.publishAt > now) throw new ConflictException("This batch is scheduled for a future date. It cannot be published early.");
      await tx.reportCardVersion.updateMany({
        where: { setId: set.id, schoolId, stage: "APPROVED" },
        data: { stage: "PUBLISHED", publishedAt: now },
      });
      await tx.reportCard.updateMany({ where: { setId: set.id }, data: { publishedAt: now } });
      const updated = await tx.reportCardSet.update({ where: { id: set.id }, data: { status: "PUBLISHED", publishedAt: now }, select: { id: true, name: true, status: true, publishedAt: true } });
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE", entityType: "REPORT_CARD_SET", entityId: set.id, newValues: { operation: "PUBLISH", reportCount: set._count.reportCards } } });
      return updated;
    });
  }
}
