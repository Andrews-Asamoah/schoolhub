import { Global, Injectable, Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

/**
 * Works out which classes a teacher is responsible for so that the teacher
 * portal only ever shows the students (and classes) they actually teach.
 *
 * A class counts as "taught" when the teacher is, in the current academic year:
 *  - its class teacher (an active ClassTeacherAssignment),
 *  - the assigned teacher of one of its subjects (ClassSubject.teacherId), or
 *  - scheduled to teach it on the timetable.
 */
export interface TeacherAssignments {
  /** The teacher record behind the signed-in user, or null for non-teachers. */
  teacherId: string | null;
  /** Classes this teacher is the current class teacher of. */
  classTeacherClassIds: string[];
  /** The subjects this teacher is the assigned teacher of, per class. */
  subjectAssignments: { classId: string; subjectId: string }[];
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
    const db = this.prisma.client;
    const teacher = await db.teacher.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!teacher) return { teacherId: null, classTeacherClassIds: [], subjectAssignments: [] };

    const today = new Date();
    const currentYear = await db.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    const classInScope = {
      schoolId,
      deletedAt: null,
      isActive: true,
      ...(currentYear ? { OR: [{ academicYearId: currentYear.id }, { academicYearId: null }] } : {}),
    };

    const [classTeacher, subjects] = await Promise.all([
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
      db.classSubject.findMany({
        where: { teacherId: teacher.id, class: classInScope },
        select: { classId: true, subjectId: true },
      }),
    ]);

    return {
      teacherId: teacher.id,
      classTeacherClassIds: [...new Set(classTeacher.map((row) => row.classId))],
      subjectAssignments: subjects,
    };
  }

  async getTaughtClassIds(schoolId: string, userId: string): Promise<string[]> {
    const db = this.prisma.client;
    const teacher = await db.teacher.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!teacher) return [];

    const today = new Date();
    const currentYear = await db.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    // Classes belong to an academic year (or are year-agnostic when null).
    const classInScope = {
      schoolId,
      deletedAt: null,
      isActive: true,
      ...(currentYear
        ? { OR: [{ academicYearId: currentYear.id }, { academicYearId: null }] }
        : {}),
    };

    const [classTeacher, subjectTeacher, timetable] = await Promise.all([
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
      db.classSubject.findMany({
        where: { teacherId: teacher.id, class: classInScope },
        select: { classId: true },
      }),
      currentYear
        ? db.timetableEntry.findMany({
            where: {
              schoolId,
              teacherId: teacher.id,
              academicYearId: currentYear.id,
              classId: { not: null },
            },
            select: { classId: true },
          })
        : Promise.resolve([]),
    ]);

    return [
      ...new Set(
        [...classTeacher, ...subjectTeacher, ...timetable]
          .map((row) => row.classId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }
}

@Global()
@Module({
  providers: [TeacherScopeService],
  exports: [TeacherScopeService],
})
export class TeacherScopeModule {}
