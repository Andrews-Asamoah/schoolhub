import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { CreateSchoolAssignmentInput } from "./assignments.schemas.js";
import { AssignmentsService } from "./assignments.service.js";

const schoolId = "school-a";
const userId = "teacher-user";
const createInput: CreateSchoolAssignmentInput = {
  classId: "class-a",
  subjectId: "subject-a",
  title: "Algebra practice",
  instructions: "Solve the equations and show your working.",
  dueAt: null,
  maxScore: 20,
};

type CurrentEnrollment = {
  classId: string;
  academicYearId: string;
  termId: string;
  class: { id: string; name: string; level: string };
  academicYear: { id: string; name: string };
  term: { id: string; name: string };
} | null;

type GradeAssignment = {
  id: string;
  classId: string;
  subjectId: string;
  maxScore: number;
  title: string;
  subject: { name: string };
} | null;

interface TestOptions {
  classSubject?: { id: string } | null;
  permittedClassIds?: string[];
  enrollment?: CurrentEnrollment;
  gradeAssignment?: GradeAssignment;
}

function buildService(options: TestOptions = {}) {
  const schoolAssignment = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => options.gradeAssignment ?? null),
    create: vi.fn(async ({ data }: { data: { classId: string } }) => ({
      classId: data.classId,
      id: "assignment-a",
      title: createInput.title,
      maxScore: 20,
      subject: { name: "Mathematics" },
      class: { name: "JHS 1" },
    })),
  };
  const schoolAssignmentSubmission = {
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    upsert: vi.fn(async () => ({
      id: "submission-a",
      status: "SUBMITTED",
      responseText: "Answer",
      submittedAt: new Date(),
    })),
    update: vi.fn(async () => ({
      id: "submission-a",
      status: "GRADED",
      score: 15,
      feedback: null,
      gradedAt: new Date(),
    })),
  };
  const enrollment = {
    findFirst: vi.fn(async () => options.enrollment ?? null),
    findMany: vi.fn(async () => []),
  };
  const notification = {
    create: vi.fn(async () => ({ id: "notification-a" })),
    createMany: vi.fn(async () => ({ count: 1 })),
  };

  const client = {
    academicYear: {
      findFirst: vi.fn(async () => ({
        id: "year-a",
        name: "2026/2027",
        terms: [{ id: "term-a", name: "Term 1" }],
      })),
    },
    class: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id }))),
    },
    subject: {
      findFirst: vi.fn(async () => ({ id: "subject-a", name: "Mathematics" })),
    },
    classSubject: {
      findMany: vi.fn(async ({ where }: { where: { classId: { in: string[] } } }) => options.classSubject === null ? [] : where.classId.in.map((classId) => ({ classId }))),
    },
    student: { findFirst: vi.fn(async () => ({ id: "student-a" })) },
    schoolAssignment,
    schoolAssignmentSubmission,
    enrollment,
    notification,
    $transaction: vi.fn(async (callback: (value: unknown) => unknown): Promise<unknown> => callback(client)),
  };
  const teacherScope = {
    getAssignments: vi.fn(async () => ({ teacherId: "teacher-a", classTeacherClassIds: [], subjectAssignments: (options.permittedClassIds ?? []).map((classId) => ({ classId, subjectId: createInput.subjectId })), subjectStrandAssignments: [] })),
    getTaughtClassIds: vi.fn(async () => ["class-a"]),
  };
  return {
    client,
    teacherScope,
    service: new AssignmentsService({ client } as never, teacherScope as never),
  };
}


describe("AssignmentsService authorization and validation", () => {
  it("rejects a class and subject combination that is not assigned to the class", async () => {
    const { service, client } = buildService({ classSubject: null });

    await expect(service.create(schoolId, "admin-user", "admin", createInput))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(client.class.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["class-a"] }, schoolId }),
    }));
    expect(client.subject.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "subject-a", schoolId }),
    }));
    expect(client.schoolAssignment.create).not.toHaveBeenCalled();
  });

  it("prevents teachers from publishing work outside their assigned subject scope", async () => {
    const { service, client, teacherScope } = buildService();

    await expect(service.create(schoolId, userId, "teacher", createInput))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(teacherScope.getAssignments).toHaveBeenCalledWith(schoolId, userId);
    expect(client.schoolAssignment.create).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("publishes one assignment per selected class inside a single transaction", async () => {
    const { classId, ...details } = createInput;
    const classIds = [classId, "class-b"];
    const { service, client } = buildService({ permittedClassIds: classIds });
    const result = await service.publishBatch(schoolId, userId, "teacher", { ...details, classIds });
    expect(result.assignments.map((item) => item.classId)).toEqual(classIds);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(client.schoolAssignment.create).toHaveBeenCalledTimes(2);
  });

  it("does not publish to any class if one subject assignment is outside scope", async () => {
    const { classId, ...details } = createInput;
    const { service, client } = buildService({ permittedClassIds: [classId] });
    await expect(service.publishBatch(schoolId, userId, "teacher", {
      ...details, classIds: [classId, "unassigned"],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.schoolAssignment.create).not.toHaveBeenCalled();
    expect(client.notification.createMany).not.toHaveBeenCalled();
  });

  it("does not let a student access submission endpoints without a current active enrollment", async () => {
    const { service, client } = buildService({ enrollment: null });

    await expect(service.submit(schoolId, "student-user", "assignment-a", {
      responseText: "My response",
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(client.schoolAssignment.findFirst).not.toHaveBeenCalled();
    expect(client.schoolAssignmentSubmission.upsert).not.toHaveBeenCalled();
  });

  it("rejects grades above the published maximum before updating a submission", async () => {
    const { service, client } = buildService({
      gradeAssignment: {
        id: "assignment-a",
        classId: "class-a",
        subjectId: "subject-a",
        maxScore: 20,
        title: "Algebra practice",
        subject: { name: "Mathematics" },
      },
    });

    await expect(service.grade(schoolId, "admin-user", "admin", "assignment-a", "submission-a", {
      score: 21,
      feedback: null,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(client.schoolAssignmentSubmission.findFirst).not.toHaveBeenCalled();
    expect(client.schoolAssignmentSubmission.update).not.toHaveBeenCalled();
  });
});
