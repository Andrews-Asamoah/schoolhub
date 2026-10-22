import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";

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
    return { years, templates, sets: sets.map((s) => ({ id: s.id, name: s.name, status: s.status, template: s.template, academicYear: s.academicYear, term: s.term, classes: s.targetClasses.map((r) => r.class), reportCount: s._count.reportCards, publishAt: s.publishAt, publishedAt: s.publishedAt, updatedAt: s.updatedAt })) };
  }

  async getSetReports(schoolId: string, setId: string) {
    const db = this.prisma.client;
    const set = await db.reportCardSet.findFirst({ where: { id: setId, schoolId }, select: { id: true } });
    if (!set) throw new NotFoundException("Report batch not found.");

    return db.reportCard.findMany({
      where: { setId: set.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
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
  }

  async getMyPublishedReports(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({ where: { schoolId, deletedAt: null, profile: { userId } }, select: { id: true } });
    if (!student) throw new NotFoundException("Student record not found.");
    return this.prisma.client.reportCard.findMany({
      where: { studentId: student.id, publishedAt: { not: null }, set: { schoolId, status: "PUBLISHED" } },
      orderBy: { publishedAt: "desc" },
      select: { id: true, data: true, publishedAt: true, student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } }, set: { select: { name: true, academicYear: { select: { name: true } }, term: { select: { name: true, termNumber: true } }, template: { select: { name: true, layout: true } } } } },
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
      select: { id: true, studentId: true, data: true, publishedAt: true, student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } }, set: { select: { name: true, academicYear: { select: { name: true } }, term: { select: { name: true, termNumber: true } }, template: { select: { name: true, layout: true } } } } },
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
    const set = await db.reportCardSet.findFirst({ where: { id: setId, schoolId }, include: { targetClasses: { select: { classId: true } } } });
    if (!set) throw new NotFoundException("Report batch not found.");
    if (set.status === "PUBLISHED" || set.status === "ARCHIVED") throw new ConflictException("Published or archived reports cannot be regenerated.");
    if (set.status === "GENERATING") throw new ConflictException("This report batch is already being generated.");
    const classIds = set.targetClasses.map(({ classId }) => classId);
    if (!classIds.length) throw new BadRequestException("Choose at least one class.");
    await db.reportCardSet.update({ where: { id: set.id }, data: { status: "GENERATING" } });
    try {
      const students = await db.student.findMany({
        where: { schoolId, deletedAt: null, enrollments: { some: { academicYearId: set.academicYearId, termId: set.termId, status: { in: ["ACTIVE", "COMPLETED"] }, classId: { in: classIds } } } },
        select: {
          id: true,
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
        // A regenerated batch must not retain stale cards for students whose
        // assessment scores are no longer finalized.
        await tx.reportCard.deleteMany({
          where: { setId: set.id, studentId: { notIn: reportableStudents.map((student) => student.id) } },
        });
        for (const student of reportableStudents) {
          const data = { schemaVersion: 1, student: { id: student.id, class: student.enrollments[0]?.class ?? null }, academicYearId: set.academicYearId, termId: set.termId, subjects: student.assessmentScores.map((score) => ({ subject: score.subject, totalScore: Number(score.totalScore), percentage: Number(score.percentage), grade: score.grade, position: score.position, remarks: score.remarks, components: score.componentScores.map((c) => ({ name: c.component.name, marksObtained: Number(c.marksObtained), maxMarks: Number(c.maxMarks), percentage: Number(c.percentage), weight: Number(c.component.weight) })) })), remarks: student.remarks.map((r) => ({ type: r.remarkType, content: r.content, teacher: [r.teacher.profile?.firstName, r.teacher.profile?.lastName].filter(Boolean).join(" ") })), generatedAt: new Date().toISOString() };
          await tx.reportCard.upsert({ where: { setId_studentId: { setId: set.id, studentId: student.id } }, create: { setId: set.id, studentId: student.id, data: data as Prisma.InputJsonValue }, update: { data: data as Prisma.InputJsonValue, publishedAt: null } });
        }
        await tx.reportCardSet.update({ where: { id: set.id }, data: { status: "GENERATED" } });
        await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE", entityType: "REPORT_CARD_SET", entityId: set.id, newValues: { operation: "GENERATE", reportCount: reportableStudents.length } } });
      });
      return { id: set.id, status: "GENERATED", reportCount: reportableStudents.length };
    } catch (error) {
      await db.reportCardSet.update({ where: { id: set.id }, data: { status: "DRAFT" } }).catch(() => undefined);
      throw error;
    }
  }

  async publish(schoolId: string, actorId: string, setId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const set = await tx.reportCardSet.findFirst({ where: { id: setId, schoolId }, include: { _count: { select: { reportCards: true } } } });
      if (!set) throw new NotFoundException("Report batch not found.");
      if (set.status !== "GENERATED") throw new ConflictException("Generate reports successfully before publishing them.");
      if (!set._count.reportCards) throw new BadRequestException("There are no reports to publish.");
      const now = new Date();
      if (set.publishAt && set.publishAt > now) throw new ConflictException("This batch is scheduled for a future date. It cannot be published early.");
      await tx.reportCard.updateMany({ where: { setId: set.id }, data: { publishedAt: now } });
      const updated = await tx.reportCardSet.update({ where: { id: set.id }, data: { status: "PUBLISHED", publishedAt: now }, select: { id: true, name: true, status: true, publishedAt: true } });
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE", entityType: "REPORT_CARD_SET", entityId: set.id, newValues: { operation: "PUBLISH", reportCount: set._count.reportCards } } });
      return updated;
    });
  }
}
