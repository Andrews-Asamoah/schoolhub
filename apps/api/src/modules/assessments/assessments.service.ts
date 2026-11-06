import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  canManageAcademicContext,
} from "../../common/academic-context.js";

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async listAssessmentTemplates(schoolId: string) {
    return this.prisma.client.assessmentTemplate.findMany({
      where: { schoolId, isActive: true },
      include: {
        components: { orderBy: { displayOrder: "asc" } },
        gradingSystem: { include: { gradeScales: { orderBy: { displayOrder: "asc" } } } },
      },
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
