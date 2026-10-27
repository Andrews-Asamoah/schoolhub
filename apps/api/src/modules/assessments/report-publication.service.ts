import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { snapshotHash } from "./report-version.js";

@Injectable()
export class ReportPublicationService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(schoolId: string) {
    const db = this.prisma.client;
    const [years, templates, sets] = await Promise.all([
      db.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: "desc" }, select: { id: true, name: true, isCurrent: true, terms: { orderBy: { termNumber: "asc" }, select: { id: true, name: true, termNumber: true, isCurrent: true } } } }),
      db.reportCardTemplate.findMany({ where: { schoolId }, orderBy: { name: "asc" }, select: { id: true, name: true, description: true, isActive: true, layout: true } }),
      db.reportCardSet.findMany({ where: { schoolId }, orderBy: { updatedAt: "desc" }, take: 50, include: { template: { select: { id: true, name: true } }, academicYear: { select: { id: true, name: true } }, term: { select: { id: true, name: true, termNumber: true } }, targetClasses: { include: { class: { select: { id: true, name: true } } } }, _count: { select: { reportCards: true } } } }),
    ]);
    return { years, templates, sets: sets.map((s) => ({ id: s.id, name: s.name, status: s.status, template: s.template, academicYear: s.academicYear, term: s.term, classes: s.targetClasses.map((r) => r.class), reportCount: s._count.reportCards, publishAt: s.publishAt, publishedAt: s.publishedAt, isReviewed: s.isReviewed, reviewedAt: s.reviewedAt, updatedAt: s.updatedAt })) };
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
        headName: true, headRemark: true, headApprovedAt: true, snapshotHash: true },
    });
    const latest = new Map<string, typeof versions[number]>();
    for (const version of versions) if (!latest.has(version.studentId)) latest.set(version.studentId, version);
    return reports.map(report => ({ ...report, version: latest.get(report.studentId) ?? null }));
  }

  async getMyPublishedReports(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({ where: { schoolId, deletedAt: null, profile: { userId } }, select: { id: true } });
    if (!student) throw new NotFoundException("Student record not found.");
    return this.prisma.client.reportCard.findMany({
      where: { studentId: student.id, publishedAt: { not: null }, set: { schoolId, status: "PUBLISHED" } },
      orderBy: { publishedAt: "desc" },
      select: { id: true, data: true, publishedAt: true, student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } }, set: { select: { name: true, academicYear: { select: { name: true } }, term: { select: { name: true, termNumber: true } }, template: { select: { name: true, layout: true } }, school: { select: { name: true, code: true, email: true, phone: true, address: true, logo: true, motto: true, website: true, primaryColor: true, secondaryColor: true } } } } },
    });
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
      select: { id: true, studentId: true, data: true, publishedAt: true, student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } }, set: { select: { name: true, academicYear: { select: { name: true } }, term: { select: { name: true, termNumber: true } }, template: { select: { name: true, layout: true } }, school: { select: { name: true, code: true, email: true, phone: true, address: true, logo: true, motto: true, website: true, primaryColor: true, secondaryColor: true } } } } },
    });
    return reports;
  }

  async createSet(schoolId: string, actorId: string, input: { name: string; templateId: string; academicYearId: string; termId: string; classIds: string[]; publishAt: string | null }) {
    const [template, year, term, classes] = await Promise.all([
      this.prisma.client.reportCardTemplate.findFirst({ where: { id: input.templateId, schoolId, isActive: true }, select: { id: true } }),
      this.prisma.client.academicYear.findFirst({ where: { id: input.academicYearId, schoolId }, select: { id: true } }),
      this.prisma.client.term.findFirst({ where: { id: input.termId, academicYearId: input.academicYearId }, select: { id: true } }),
      this.prisma.client.class.findMany({ where: { id: { in: input.classIds }, schoolId, deletedAt: null, isActive: true }, select: { id: true } }),
    ]);
    if (!template || !year || !term) throw new BadRequestException("Choose a report template, academic year, and term belonging to this school.");
    if (classes.length !== input.classIds.length) throw new BadRequestException("One or more selected classes are not available in this school.");
    const publishAt = input.publishAt ? new Date(input.publishAt) : null;
    if (publishAt && Number.isNaN(publishAt.getTime())) throw new BadRequestException("The scheduled publication date is invalid.");
    return this.prisma.client.$transaction(async (tx) => {
      const set = await tx.reportCardSet.create({ data: { schoolId, templateId: template.id, academicYearId: year.id, termId: term.id, name: input.name, publishAt, targetClasses: { create: classes.map(({ id }) => ({ classId: id })) } }, select: { id: true, name: true, status: true, publishAt: true } });
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "CREATE", entityType: "REPORT_CARD_SET", entityId: set.id, newValues: { name: set.name, classIds: classes.map(({ id }) => id) } } });
      return set;
    });
  }

  async generate(schoolId: string, actorId: string, setId: string) {
    const db = this.prisma.client;
    const set = await db.reportCardSet.findFirst({ where: { id: setId, schoolId },
      include: { targetClasses: { select: { classId: true } },
        school: { select: { name: true, code: true, motto: true } },
        template: { select: { name: true, layout: true } },
        academicYear: { select: { name: true } }, term: { select: { name: true } } } });
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
          assessmentScores: { where: { termId: set.termId, status: "FINAL" }, include: { subject: { select: { id: true, name: true, code: true } }, componentScores: { include: { component: { select: { id: true, name: true, weight: true, maxMarks: true } } }, orderBy: { createdAt: "asc" } } } },
          remarks: { where: { termId: set.termId }, include: { teacher: { include: { profile: true } } } },
        },
      });
      const reportableStudents = students.filter((student) => student.assessmentScores.length > 0);
      if (!reportableStudents.length) {
        throw new BadRequestException("No finalized assessment scores were found for the selected classes and term. Finalize marks before generating reports.");
      }

      await db.$transaction(async (tx) => {
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
          const data = { schemaVersion: 1, student: { id: student.id, class: student.enrollments[0]?.class ?? null }, academicYearId: set.academicYearId, termId: set.termId, subjects: student.assessmentScores.map((score) => ({ subject: score.subject, totalScore: Number(score.totalScore), percentage: Number(score.percentage), grade: score.grade, position: score.position, remarks: score.remarks, components: score.componentScores.map((c) => ({ name: c.component.name, marksObtained: Number(c.marksObtained), maxMarks: Number(c.maxMarks), percentage: Number(c.percentage), weight: Number(c.component.weight) })) })), remarks: student.remarks.map((r) => ({ type: r.remarkType, content: r.content, teacher: [r.teacher.profile?.firstName, r.teacher.profile?.lastName].filter(Boolean).join(" ") })), generatedAt: new Date().toISOString() };
          await tx.reportCard.upsert({ where: { setId_studentId: { setId: set.id, studentId: student.id } }, create: { setId: set.id, studentId: student.id, data: data as Prisma.InputJsonValue }, update: { data: data as Prisma.InputJsonValue, publishedAt: null } });
          const classId = student.enrollments[0]?.class.id;
          if (!classId) throw new BadRequestException("Student's class enrolment is required for report approval.");
          const previous = await tx.reportCardVersion.findFirst({
            where: { setId: set.id, studentId: student.id }, orderBy: { version: "desc" },
            select: { version: true },
          });
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
          } });
        }
        await tx.reportCardSet.update({ where: { id: set.id }, data: { status: "GENERATED", isReviewed: false, reviewedAt: null } });
        await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE", entityType: "REPORT_CARD_SET", entityId: set.id, newValues: { operation: "GENERATE", reportCount: reportableStudents.length } } });
      });
      return { id: set.id, status: "GENERATED", reportCount: reportableStudents.length, isReviewed: false };
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
