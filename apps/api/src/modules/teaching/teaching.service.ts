import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { buildTeachingClasses } from "./teaching-classes.js";

/** The signed-in teacher's own classes: where they are class teacher and what they teach. */
@Injectable()
export class TeachingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherScope: TeacherScopeService,
  ) {}

  async overview(schoolId: string, userId: string) {
    const db = this.prisma.client;
    const assignments = await this.teacherScope.getAssignments(schoolId, userId);
    if (!assignments.teacherId) return { teacher: null, term: null, classes: [] };

    const classIds = [
      ...new Set([...assignments.classTeacherClassIds, ...assignments.subjectAssignments.map((row) => row.classId)]),
    ];
    const subjectIds = [...new Set(assignments.subjectAssignments.map((row) => row.subjectId))];

    const [teacher, term, classes, subjects] = await Promise.all([
      db.teacher.findFirst({
        where: { id: assignments.teacherId },
        select: { firstName: true, lastName: true, profile: { select: { firstName: true, lastName: true } } },
      }),
      db.term.findFirst({
        where: { isCurrent: true, academicYear: { schoolId, isCurrent: true } },
        select: { id: true, name: true },
      }),
      db.class.findMany({
        where: { id: { in: classIds }, schoolId, deletedAt: null },
        select: { id: true, name: true, level: true },
      }),
      db.subject.findMany({
        where: { id: { in: subjectIds }, schoolId },
        select: { id: true, name: true, code: true },
      }),
    ]);

    const counts = term
      ? await db.enrollment.groupBy({
          by: ["classId"],
          where: { classId: { in: classIds }, termId: term.id, status: "ACTIVE", student: { deletedAt: null } },
          _count: { _all: true },
        })
      : [];

    return {
      teacher: {
        id: assignments.teacherId,
        name: `${teacher?.profile?.firstName ?? teacher?.firstName ?? ""} ${teacher?.profile?.lastName ?? teacher?.lastName ?? ""}`.trim(),
      },
      term,
      classes: buildTeachingClasses(
        assignments,
        classes,
        subjects,
        new Map(counts.map((row) => [row.classId, row._count._all])),
      ),
    };
  }
}
