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
@Injectable()
export class TeacherScopeService {
  constructor(private readonly prisma: PrismaService) {}

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
