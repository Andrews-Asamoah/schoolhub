import { Global, Injectable, Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { assignedClassIds } from "./teacher-access.js";

/**
 * Works out which classes a teacher is responsible for so that the teacher
 * portal only ever shows the students (and classes) they actually teach.
 *
 * A class counts as "taught" when the teacher is, in the current academic year:
 *  - its class teacher (an active ClassTeacherAssignment),
 *  - the assigned teacher of one of its subjects (ClassSubject.teacherId), or a teacher of one of
 *    its teaching areas (ClassSubjectStrandAssignment), or
 *  - scheduled to teach it on the timetable.
 */
export interface TeacherAssignments {
  /** The teacher record behind the signed-in user, or null for non-teachers. */
  teacherId: string | null;
  /** Classes this teacher is the current class teacher of. */
  classTeacherClassIds: string[];
  /** The subjects this teacher is the legacy whole-subject teacher of, per class. */
  subjectAssignments: { classId: string; subjectId: string }[];
  /** The specific subject strands this teacher is assigned to, per class. */
  subjectStrandAssignments: { classId: string; subjectId: string; subjectStrandId: string }[];
}

@Injectable()
export class TeacherScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * What the signed-in teacher is specifically responsible for this year:
   * the classes they are class teacher of (who may mark the register) and the
   * subjects they teach in each class (who may enter marks).
   */
  async getAssignments(schoolId: string, userId: string): Promise<TeacherAssignments> {
    return (await this.load(schoolId, userId)).assignments;
  }

  /** Every class the teacher is involved with: assignments plus anything on their timetable. */
  async getTaughtClassIds(schoolId: string, userId: string): Promise<string[]> {
    const { assignments, currentYearId } = await this.load(schoolId, userId);
    if (!assignments.teacherId) return [];
    const timetable = currentYearId
      ? await this.prisma.client.timetableEntry.findMany({
          where: { schoolId, teacherId: assignments.teacherId, academicYearId: currentYearId, classId: { not: null } },
          select: { classId: true },
        })
      : [];
    return [
      ...new Set([
        ...assignedClassIds(assignments),
        ...timetable.map((row) => row.classId).filter((id): id is string => Boolean(id)),
      ]),
    ];
  }

  private async load(schoolId: string, userId: string) {
    const db = this.prisma.client;
    const teacher = await db.teacher.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!teacher) return { assignments: { teacherId: null, classTeacherClassIds: [], subjectAssignments: [], subjectStrandAssignments: [] } satisfies TeacherAssignments, currentYearId: null };

    const today = new Date();
    const currentYear = await db.academicYear.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });
    // Classes belong to an academic year (or are year-agnostic when null).
    const classInScope = {
      schoolId,
      deletedAt: null,
      isActive: true,
      ...(currentYear ? { OR: [{ academicYearId: currentYear.id }, { academicYearId: null }] } : {}),
    };

    const [classTeacher, subjects, strandAssignments] = await Promise.all([
      db.classTeacherAssignment.findMany({
        where: {
          schoolId,
          teacherId: teacher.id,
          effectiveFrom: { lte: today },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
          class: classInScope,
        },
        select: { classId: true },
      }),
      db.classSubject.findMany({ where: { teacherId: teacher.id, class: classInScope }, select: { classId: true, subjectId: true } }),
      db.classSubjectStrandAssignment.findMany({
        where: {
          teacherId: teacher.id,
          classSubject: { class: classInScope },
          subjectStrand: { isActive: true, subject: { isActive: true, deletedAt: null } },
        },
        select: { subjectStrandId: true, classSubject: { select: { classId: true, subjectId: true } } },
      }),
    ]);

    return {
      currentYearId: currentYear?.id ?? null,
      assignments: {
        teacherId: teacher.id,
        classTeacherClassIds: [...new Set(classTeacher.map((row) => row.classId))],
        subjectAssignments: subjects,
        subjectStrandAssignments: strandAssignments.map((row) => ({
          classId: row.classSubject.classId,
          subjectId: row.classSubject.subjectId,
          subjectStrandId: row.subjectStrandId,
        })),
      } satisfies TeacherAssignments,
    };
  }
}

@Global()
@Module({
  providers: [TeacherScopeService],
  exports: [TeacherScopeService],
})
export class TeacherScopeModule {}
