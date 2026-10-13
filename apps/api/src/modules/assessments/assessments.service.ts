import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { RecordScoreInput } from "@schoolhub/shared";
import { Prisma } from "@prisma/client";

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
  ) {
    return this.prisma.client.$transaction(async (tx) => {
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
  ) {
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
      student,
      termId,
      scores,
      remarks,
    };
  }
}
