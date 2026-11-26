import type { PublishAssignmentBatchInput } from "@schoolhub/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreateSchoolAssignmentInput,
  GradeSchoolAssignmentInput,
  SubmitSchoolAssignmentInput,
} from "./assignments.schemas.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { canEnterMarks, teachingPairs } from "../../common/scope/teacher-access.js";

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherScope: TeacherScopeService,
  ) {}

  private async currentTerm(schoolId: string) {
    const year = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: {
        id: true,
        name: true,
        terms: {
          where: { isCurrent: true },
          take: 1,
          select: { id: true, name: true },
        },
      },
    });
    const term = year?.terms[0];
    if (!year || !term) {
      throw new BadRequestException("Select a current academic year and term before using assignments.");
    }
    return { academicYear: { id: year.id, name: year.name }, term };
  }

  private async currentStudent(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("Student record not found.");
    return student;
  }

  private async enrollmentForCurrentTerm(schoolId: string, studentId: string) {
    return this.prisma.client.enrollment.findFirst({
      where: {
        studentId,
        status: "ACTIVE",
        term: { isCurrent: true, academicYear: { isCurrent: true, schoolId } },
      },
      orderBy: { enrolledAt: "desc" },
      select: {
        classId: true,
        academicYearId: true,
        termId: true,
        class: { select: { id: true, name: true, level: true } },
        academicYear: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
      },
    });
  }

  async listForStudent(schoolId: string, userId: string) {
    const student = await this.currentStudent(schoolId, userId);
    const enrollment = await this.enrollmentForCurrentTerm(schoolId, student.id);
    if (!enrollment) return { class: null, academicYear: null, term: null, assignments: [] };

    const rows = await this.prisma.client.schoolAssignment.findMany({
      where: {
        schoolId,
        classId: enrollment.classId,
        academicYearId: enrollment.academicYearId,
        termId: enrollment.termId,
        status: "PUBLISHED",
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        subject: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        submissions: {
          where: { studentId: student.id },
          take: 1,
          select: { id: true, responseText: true, status: true, score: true, feedback: true, submittedAt: true, gradedAt: true },
        },
      },
    });

    return {
      class: enrollment.class,
      academicYear: enrollment.academicYear,
      term: enrollment.term,
      assignments: rows.map((row) => ({
        id: row.id,
        title: row.title,
        instructions: row.instructions,
        dueAt: row.dueAt,
        maxScore: Number(row.maxScore),
        status: row.status,
        createdAt: row.createdAt,
        subject: row.subject,
        teacher: row.createdBy,
        submission: row.submissions[0]
          ? { ...row.submissions[0], score: row.submissions[0].score === null ? null : Number(row.submissions[0].score) }
          : null,
      })),
    };
  }

  async listManaged(schoolId: string, userId: string, role: string | undefined) {
    const current = await this.currentTerm(schoolId);
    const baseWhere: Prisma.SchoolAssignmentWhereInput = {
      schoolId,
      academicYearId: current.academicYear.id,
      termId: current.term.id,
      status: { not: "ARCHIVED" },
    };

    if (role === "teacher") {
      const scope = await this.teacherScope.getAssignments(schoolId, userId);
      const taught = teachingPairs(scope);
      if (!taught.length) {
        return { academicYear: current.academicYear, term: current.term, assignments: [] };
      }
      baseWhere.OR = taught.map(({ classId, subjectId }) => ({ classId, subjectId }));
    }

    const rows = await this.prisma.client.schoolAssignment.findMany({
      where: baseWhere,
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        submissions: {
          orderBy: { submittedAt: "desc" },
          include: {
            student: {
              select: {
                id: true,
                admissionNumber: true,
                studentId: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
            submittedBy: { select: { id: true, name: true } },
            gradedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      academicYear: current.academicYear,
      term: current.term,
      assignments: rows.map((row) => ({
        ...row,
        maxScore: Number(row.maxScore),
        submissions: row.submissions.map((submission) => ({
          ...submission,
          score: submission.score === null ? null : Number(submission.score),
        })),
      })),
    };
  }

  async create(schoolId: string, userId: string, role: string | undefined, input: CreateSchoolAssignmentInput) {
    const { classId, ...assignment } = input;
    const [created] = await this.publish(schoolId, userId, role, { ...assignment, classIds: [classId] });
    return created!;
  }

  async publishBatch(schoolId: string, userId: string, role: string | undefined, input: PublishAssignmentBatchInput) {
    if (role !== "teacher") throw new ForbiddenException("Only teachers can use batch publishing.");
    return { assignments: await this.publish(schoolId, userId, role, input) };
  }

  private async publish(schoolId: string, userId: string, role: string | undefined, input: PublishAssignmentBatchInput) {
    if (!["owner", "admin", "headteacher", "teacher"].includes(role ?? "")) {
      throw new ForbiddenException("Your role cannot publish assignments.");
    }
    const current = await this.currentTerm(schoolId);
    const { classIds, subjectId } = input;
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException("Enter a valid due date.");
    }

    const scope = role === "teacher" ? await this.teacherScope.getAssignments(schoolId, userId) : null;
    if (scope && classIds.some((classId) => !canEnterMarks(role, scope, classId, subjectId))) {
      throw new ForbiddenException("Teachers can only publish assignments for subjects assigned to them.");
    }

    return this.prisma.client.$transaction(async (tx) => {
      const [classes, subject, classSubjects, enrollments] = await Promise.all([
        tx.class.findMany({
          where: {
            id: { in: classIds }, schoolId, isActive: true, deletedAt: null,
            OR: [{ academicYearId: current.academicYear.id }, { academicYearId: null }],
          },
          select: { id: true },
        }),
        tx.subject.findFirst({
          where: { id: subjectId, schoolId, isActive: true, deletedAt: null },
          select: { id: true },
        }),
        tx.classSubject.findMany({
          where: { classId: { in: classIds }, subjectId },
          select: { classId: true },
        }),
        tx.enrollment.findMany({
          where: {
            classId: { in: classIds }, academicYearId: current.academicYear.id,
            termId: current.term.id, status: "ACTIVE", student: { schoolId, deletedAt: null },
          },
          select: { classId: true, student: { select: { profile: { select: { userId: true } } } } },
        }),
      ]);
      if (classes.length !== classIds.length) throw new NotFoundException("An active class was not found in this school.");
      if (!subject) throw new NotFoundException("Active subject not found in this school.");
      if (classSubjects.length !== classIds.length) throw new BadRequestException("The selected subject must be assigned to every chosen class.");

      const recipientsByClass = new Map<string, Set<string>>();
      for (const enrollment of enrollments) {
        const recipients = recipientsByClass.get(enrollment.classId) ?? new Set<string>();
        recipients.add(enrollment.student.profile.userId);
        recipientsByClass.set(enrollment.classId, recipients);
      }

      const assignments = [];
      for (const classId of classIds) {
        const assignment = await tx.schoolAssignment.create({
          data: {
            schoolId, classId, subjectId, academicYearId: current.academicYear.id,
            termId: current.term.id, createdById: userId, title: input.title.trim(),
            instructions: input.instructions.trim(), dueAt,
            maxScore: new Prisma.Decimal(input.maxScore), status: "PUBLISHED",
          },
          include: {
            class: { select: { id: true, name: true, level: true } },
            subject: { select: { id: true, name: true, code: true } },
            createdBy: { select: { id: true, name: true } },
          },
        });
        const recipientIds = [...(recipientsByClass.get(classId) ?? [])];
        if (recipientIds.length) {
          await tx.notification.createMany({
            data: recipientIds.map((userId) => ({
              schoolId, userId, type: "GENERAL" as const, title: `New assignment: ${assignment.title}`,
              message: `${assignment.subject.name} · ${assignment.class.name}`, link: "/assignments",
            })),
          });
        }
        assignments.push({ ...assignment, maxScore: Number(assignment.maxScore), notifiedStudents: recipientIds.length });
      }
      return assignments;
    });
  }

  async submit(schoolId: string, userId: string, assignmentId: string, input: SubmitSchoolAssignmentInput) {
    const student = await this.currentStudent(schoolId, userId);
    const enrollment = await this.enrollmentForCurrentTerm(schoolId, student.id);
    if (!enrollment) throw new BadRequestException("You do not have an active class enrollment for the current term.");

    const assignment = await this.prisma.client.schoolAssignment.findFirst({
      where: {
        id: assignmentId,
        schoolId,
        classId: enrollment.classId,
        academicYearId: enrollment.academicYearId,
        termId: enrollment.termId,
        status: "PUBLISHED",
      },
      select: { id: true, title: true, subject: { select: { name: true } }, createdById: true },
    });
    if (!assignment) throw new NotFoundException("Published assignment not found for your current class.");

    const existing = await this.prisma.client.schoolAssignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
      select: { id: true, status: true },
    });
    if (existing?.status === "GRADED") {
      throw new ConflictException("This submission has already been graded and can no longer be changed.");
    }

    return this.prisma.client.$transaction(async (tx) => {
      const submission = await tx.schoolAssignmentSubmission.upsert({
        where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
        create: {
          assignmentId,
          studentId: student.id,
          submittedById: userId,
          responseText: input.responseText.trim(),
          status: "SUBMITTED",
        },
        update: {
          submittedById: userId,
          responseText: input.responseText.trim(),
          status: "SUBMITTED",
          score: null,
          feedback: null,
          gradedAt: null,
          gradedById: null,
          submittedAt: new Date(),
        },
        select: { id: true, status: true, responseText: true, submittedAt: true },
      });
      await tx.notification.create({
        data: {
          schoolId,
          userId: assignment.createdById,
          type: "GENERAL",
          title: "Assignment submitted",
          message: `${assignment.subject.name} · ${assignment.title}`,
          link: "/assignments",
        },
      });
      return submission;
    });
  }

  async grade(
    schoolId: string,
    userId: string,
    role: string | undefined,
    assignmentId: string,
    submissionId: string,
    input: GradeSchoolAssignmentInput,
  ) {
    const assignment = await this.prisma.client.schoolAssignment.findFirst({
      where: { id: assignmentId, schoolId, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        classId: true,
        subjectId: true,
        maxScore: true,
        title: true,
        subject: { select: { name: true } },
      },
    });
    if (!assignment) throw new NotFoundException("Assignment not found.");
    if (!["owner", "admin", "headteacher"].includes(role ?? "")) {
      if (role !== "teacher") throw new ForbiddenException("Your role cannot grade assignments.");
      const scope = await this.teacherScope.getAssignments(schoolId, userId);
      if (!canEnterMarks(role, scope, assignment.classId, assignment.subjectId)) {
        throw new ForbiddenException("Teachers can only grade submissions for their assigned subjects.");
      }
    }
    if (input.score > Number(assignment.maxScore)) {
      throw new BadRequestException(`Score cannot exceed ${Number(assignment.maxScore)}.`);
    }

    const submission = await this.prisma.client.schoolAssignmentSubmission.findFirst({
      where: { id: submissionId, assignmentId },
      select: {
        id: true,
        student: { select: { profile: { select: { userId: true } } } },
      },
    });
    if (!submission) throw new NotFoundException("Assignment submission not found.");

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.schoolAssignmentSubmission.update({
        where: { id: submission.id },
        data: {
          status: "GRADED",
          score: new Prisma.Decimal(input.score),
          feedback: input.feedback?.trim() || null,
          gradedAt: new Date(),
          gradedById: userId,
        },
        select: { id: true, status: true, score: true, feedback: true, gradedAt: true },
      });
      await tx.notification.create({
        data: {
          schoolId,
          userId: submission.student.profile.userId,
          type: "GENERAL",
          title: "Assignment graded",
          message: assignment.subject.name + " · " + assignment.title,
          link: "/assignments",
        },
      });
      return { ...updated, score: updated.score === null ? null : Number(updated.score) };
    });
  }
}
