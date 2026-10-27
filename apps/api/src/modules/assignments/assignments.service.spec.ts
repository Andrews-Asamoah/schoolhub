import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { School } from "@prisma/client";
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

function buildService(overrides: Record<string, unknown> = {}) {
  const client: Record<string, any> = {
    academicYear: {
      findFirst: vi.fn().mockResolvedValue({
        id: "year-a",
        name: "2026/2027",
        terms: [{ id: "term-a", name: "Term 1" }],
      }),
    },
    class: { findFirst: vi.fn().mockResolvedValue({ id: "class-a", name: "JHS 1" }) },
    subject: { findFirst: vi.fn().mockResolvedValue({ id: "subject-a", name: "Mathematics" }) },
    classSubject: { findFirst: vi.fn().mockResolvedValue({ id: "class-subject-a" }) },
    student: { findFirst: vi.fn().mockResolvedValue({ id: "student-a" }) },
    enrollment: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    schoolAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "assignment-a", title: createInput.title, maxScore: 20, subject: { name: "Mathematics" }, class: { name: "JHS 1" } }),
    },
    schoolAssignmentSubmission: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "submission-a", status: "SUBMITTED", responseText: "Answer", submittedAt: new Date() }),
      update: vi.fn().mockResolvedValue({ id: "submission-a", status: "GRADED", score: 15, feedback: null, gradedAt: new Date() }),
    },
    notification: { create: vi.fn().mockResolvedValue({ id: "notification-a" }), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(),
    ...overrides,
  };
  const tx = {
    schoolAssignment: client.schoolAssignment,
    schoolAssignmentSubmission: client.schoolAssignmentSubmission,
    enrollment: client.enrollment,
    notification: client.notification,
  };
  client.$transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
  const teacherScope = {
    getAssignments: vi.fn().mockResolvedValue({ teacherId: "teacher-a", classTeacherClassIds: [], subjectAssignments: [] }),
    getTaughtClassIds: vi.fn().mockResolvedValue(["class-a"]),
  };
  return {
    client,
    teacherScope,
    service: new AssignmentsService({ client } as never, teacherScope as never),
  };
}

const school = { id: schoolId, organizationId: "org-a" } as School;

describe("AssignmentsService authorization and validation", () => {
  it("rejects a class and subject combination that is not assigned to the class", async () => {
    const { service, client } = buildService({
      classSubject: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.create(schoolId, "admin-user", "admin", createInput))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(client.class.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "class-a", schoolId }),
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

  it("does not let a student access submission endpoints without a current active enrollment", async () => {
    const { service, client } = buildService({
      enrollment: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    });

    await expect(service.submit(schoolId, "student-user", "assignment-a", {
      responseText: "My response",
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(client.schoolAssignment.findFirst).not.toHaveBeenCalled();
    expect(client.schoolAssignmentSubmission.upsert).not.toHaveBeenCalled();
  });

  it("rejects grades above the published maximum before updating a submission", async () => {
    const { service, client } = buildService({
      schoolAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: "assignment-a",
          classId: "class-a",
          subjectId: "subject-a",
          maxScore: { toString: () => "20", valueOf: () => 20 },
          title: "Algebra practice",
          subject: { name: "Mathematics" },
        }),
        create: vi.fn(),
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
