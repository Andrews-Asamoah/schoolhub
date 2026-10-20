import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { RecordScoreInput } from "@schoolhub/shared";
import { Prisma } from "@prisma/client";
import {
  canManageAcademicContext,
} from "../../common/academic-context.js";

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssessmentTemplates(schoolId: string) {
    return this.prisma.client.assessmentTemplate.findMany({
      where: { schoolId, isActive: true },
      include: {
        components: { orderBy: { displayOrder: "asc" } },
        gradingSystem: { include: { gradeScales: { orderBy: { displayOrder: "asc" } } } },
      },
    });
  }

  async recordComponentScore(
    _schoolId: string,
    recordedById: string,
    input: RecordScoreInput,
    _role?: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const term = await tx.term.findFirst({
        where: {
          id: input.termId,
          isCurrent: true,
          academicYear: { schoolId: _schoolId, isCurrent: true },
        },
        select: { id: true, academicYearId: true },
      });
      if (!term) {
        throw new ForbiddenException(
          "Scores can only be recorded for the currently selected academic term.",
        );
      }
      const [student, subject, template, enrollment] = await Promise.all([
        tx.student.findFirst({
          where: { id: input.studentId, schoolId: _schoolId, deletedAt: null },
          select: { id: true },
        }),
        tx.subject.findFirst({
          where: { id: input.subjectId, schoolId: _schoolId, isActive: true },
          select: { id: true },
        }),
        tx.assessmentTemplate.findFirst({
          where: { id: input.templateId, schoolId: _schoolId, isActive: true },
          select: { id: true },
        }),
        tx.enrollment.findFirst({
          where: {
            studentId: input.studentId,
            academicYearId: term.academicYearId,
            termId: term.id,
            status: "ACTIVE",
            student: { schoolId: _schoolId },
          },
          select: { id: true },
        }),
      ]);
      if (!student || !subject || !template || !enrollment) {
        throw new BadRequestException(
          "Scores require an active student enrolled at this school for the current term, a school subject, and a school assessment template.",
        );
      }
      // 1. Find or create the parent AssessmentScore
      const assessmentScore = await tx.assessmentScore.upsert({
        where: {
          studentId_subjectId_termId_templateId: {
            studentId: input.studentId,
            subjectId: input.subjectId,
            termId: input.termId,
            templateId: input.templateId,
          },
        },
        update: {},
        create: {
          studentId: input.studentId,
          subjectId: input.subjectId,
          termId: input.termId,
          templateId: input.templateId,
          totalScore: new Prisma.Decimal(0),
          percentage: new Prisma.Decimal(0),
        },
      });

      // 2. Upsert the ComponentScore
      const percentage =
        input.maxMarks > 0 ? (input.marksObtained / input.maxMarks) * 100 : 0;

      await tx.componentScore.upsert({
        where: {
          assessmentScoreId_componentId_occurrenceIndex: {
            assessmentScoreId: assessmentScore.id,
            componentId: input.componentId,
            occurrenceIndex: input.occurrenceIndex,
          },
        },
        update: {
          marksObtained: new Prisma.Decimal(input.marksObtained),
          maxMarks: new Prisma.Decimal(input.maxMarks),
          percentage: new Prisma.Decimal(percentage),
          weightedScore: new Prisma.Decimal(input.marksObtained),
          recordedById,
          recordedAt: new Date(),
        },
        create: {
          assessmentScoreId: assessmentScore.id,
          componentId: input.componentId,
          occurrenceIndex: input.occurrenceIndex,
          marksObtained: new Prisma.Decimal(input.marksObtained),
          maxMarks: new Prisma.Decimal(input.maxMarks),
          percentage: new Prisma.Decimal(percentage),
          weightedScore: new Prisma.Decimal(input.marksObtained),
          recordedById,
          recordedAt: new Date(),
        },
      });

      // 3. Recalculate total score
      const allComponentScores = await tx.componentScore.findMany({
        where: { assessmentScoreId: assessmentScore.id },
      });

      const totalObtained = allComponentScores.reduce(
        (sum, c) => sum + Number(c.marksObtained),
        0,
      );
      const totalMax = allComponentScores.reduce(
        (sum, c) => sum + Number(c.maxMarks),
        0,
      );
      const totalPercentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

      return tx.assessmentScore.update({
        where: { id: assessmentScore.id },
        data: {
          totalScore: new Prisma.Decimal(totalObtained),
          percentage: new Prisma.Decimal(totalPercentage),
        },
        include: {
          componentScores: true,
          subject: { select: { id: true, name: true, code: true } },
        },
      });
    });
  }

  async getStudentReportCard(
    schoolId: string,
    studentId: string,
    termId: string,
    role?: string,
  ) {
    const term = await this.prisma.client.term.findFirst({
      where: {
        id: termId,
        academicYear: { schoolId },
      },
      include: { academicYear: { select: { id: true, name: true, isCurrent: true } } },
    });
    if (!term) {
      throw new BadRequestException("Choose a term belonging to this school.");
    }
    if (
      !canManageAcademicContext(role) &&
      (!term.isCurrent || !term.academicYear.isCurrent)
    ) {
      throw new ForbiddenException(
        "Only the current academic year and term are available for your role.",
      );
    }
    const student = await this.prisma.client.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      include: {
        profile: true,
        class: true,
      },
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }
    const enrollment = await this.prisma.client.enrollment.findFirst({
      where: {
        studentId,
        academicYearId: term.academicYearId,
        termId,
        status: { in: ["ACTIVE", "COMPLETED"] },
        student: { schoolId },
      },
      include: { class: { select: { id: true, name: true, level: true } } },
    });
    if (!enrollment) {
      throw new NotFoundException(
        "Student has no enrollment in the selected academic term.",
      );
    }

    const scores = await this.prisma.client.assessmentScore.findMany({
      where: { studentId, termId },
      include: {
        subject: true,
        componentScores: { include: { component: true } },
      },
    });

    const remarks = await this.prisma.client.remark.findMany({
      where: { studentId, termId },
      include: {
        teacher: { include: { profile: true } },
      },
    });

    return {
      student: { ...student, currentClass: student.class, class: enrollment.class },
      termId,
      academicYear: term.academicYear,
      class: enrollment.class,
      scores,
      remarks,
    };
  }

  async getMyReportCard(schoolId: string, userId: string, termId?: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student record not found');

    let resolvedTermId = termId;
    if (!resolvedTermId) {
      const currentYear = await this.prisma.client.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        include: { terms: { where: { isCurrent: true }, take: 1 } },
      });
      resolvedTermId = currentYear?.terms[0]?.id;
    }
    if (!resolvedTermId) {
      throw new BadRequestException('No current academic term set for this school.');
    }

    return this.getStudentReportCard(schoolId, student.id, resolvedTermId, 'student');
  }
}
