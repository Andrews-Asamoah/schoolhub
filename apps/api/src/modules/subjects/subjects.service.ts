import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  SaveSubjectInput,
  SetSubjectClassesInput,
  SetSubjectTeachersInput,
} from "@schoolhub/shared";
import { findUnqualifiedTeachers } from "./subject-assignments.js";
import { PrismaService } from "../../prisma/prisma.service.js";

const teacherSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profile: { select: { firstName: true, lastName: true } },
} as const;

function teacherName(teacher: {
  firstName: string | null;
  lastName: string | null;
  profile: { firstName: string; lastName: string } | null;
}) {
  const first = teacher.firstName ?? teacher.profile?.firstName ?? "";
  const last = teacher.lastName ?? teacher.profile?.lastName ?? "";
  return `${first} ${last}`.trim() || "Unnamed teacher";
}

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, includeInactive: boolean) {
    const subjects = await this.prisma.client.subject.findMany({
      where: { schoolId, deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: "asc" },
      include: {
        classSubjects: {
          where: { class: { schoolId, deletedAt: null } },
          include: {
            class: { select: { id: true, name: true, level: true } },
            teacher: { select: teacherSelect },
          },
          orderBy: { class: { name: "asc" } },
        },
        teachers: { include: { teacher: { select: teacherSelect } } },
      },
    });
    return subjects.map(({ classSubjects, teachers, ...subject }) => ({
      ...subject,
      classes: classSubjects.map((row) => ({
        classId: row.class.id,
        className: row.class.name,
        level: row.class.level,
        isCompulsory: row.isCompulsory,
        teacherId: row.teacherId,
        teacherName: row.teacher ? teacherName(row.teacher) : null,
      })),
      teachers: teachers.map((row) => ({
        id: row.teacher.id,
        name: teacherName(row.teacher),
      })),
    }));
  }

  async create(schoolId: string, input: SaveSubjectInput) {
    await this.ensureCodeFree(schoolId, input.code);
    return this.prisma.client.subject.create({
      data: {
        schoolId,
        name: input.name,
        code: input.code,
        description: input.description || null,
        periodsPerWeek: input.periodsPerWeek,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(schoolId: string, id: string, input: SaveSubjectInput) {
    await this.require(schoolId, id);
    await this.ensureCodeFree(schoolId, input.code, id);
    return this.prisma.client.subject.update({
      where: { id },
      data: {
        name: input.name,
        code: input.code,
        description: input.description || null,
        periodsPerWeek: input.periodsPerWeek,
        isActive: input.isActive,
      },
    });
  }

  async remove(schoolId: string, id: string) {
    const subject = await this.require(schoolId, id);
    const [scores, timetable] = await Promise.all([
      this.prisma.client.assessmentScore.count({ where: { subjectId: id } }),
      this.prisma.client.timetableEntry.count({ where: { subjectId: id } }),
    ]);
    if (scores > 0) {
      throw new ConflictException(
        "This subject has recorded scores, so it cannot be deleted. Deactivate it instead to keep the history.",
      );
    }
    if (timetable > 0) {
      throw new ConflictException(
        "This subject is on the timetable. Remove its lessons first, or deactivate it instead.",
      );
    }
    await this.prisma.client.$transaction([
      this.prisma.client.classSubject.deleteMany({ where: { subjectId: id } }),
      this.prisma.client.subjectTeacher.deleteMany({ where: { subjectId: id } }),
      // Soft delete; the suffix frees the code for reuse (code is unique per school).
      this.prisma.client.subject.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
          code: `${subject.code}~${Date.now()}`,
        },
      }),
    ]);
    return { success: true };
  }

  /** Replace the set of classes that study this subject (and their teachers). */
  async setClasses(schoolId: string, id: string, input: SetSubjectClassesInput) {
    await this.require(schoolId, id);
    const classIds = input.assignments.map((row) => row.classId);
    if (new Set(classIds).size !== classIds.length) {
      throw new BadRequestException("A class can only be listed once.");
    }
    const [classes, teacherCount] = await Promise.all([
      this.prisma.client.class.count({
        where: { id: { in: classIds }, schoolId, deletedAt: null },
      }),
      this.countTeachers(
        schoolId,
        input.assignments.flatMap((row) => (row.teacherId ? [row.teacherId] : [])),
      ),
    ]);
    if (classes !== classIds.length) {
      throw new BadRequestException("Choose classes that belong to this school.");
    }
    if (teacherCount.expected !== teacherCount.found) {
      throw new BadRequestException("Choose active teachers that belong to this school.");
    }

    // Only teachers assigned to this subject can be put in charge of it in a class.
    const [qualified, current] = await Promise.all([
      this.prisma.client.subjectTeacher.findMany({ where: { subjectId: id }, select: { teacherId: true } }),
      this.prisma.client.classSubject.findMany({ where: { subjectId: id }, select: { classId: true, teacherId: true } }),
    ]);
    const unqualified = findUnqualifiedTeachers(
      input.assignments,
      new Set(qualified.map((row) => row.teacherId)),
      new Map(current.map((row) => [row.classId, row.teacherId])),
    );
    if (unqualified.length) {
      throw new BadRequestException(
        "Only teachers assigned to this subject can teach it in a class. Assign them to the subject first.",
      );
    }

    const removed = await this.prisma.client.classSubject.findMany({
      where: { subjectId: id, classId: { notIn: classIds } },
      select: { classId: true, class: { select: { name: true } } },
    });
    if (removed.length) {
      const scheduled = await this.prisma.client.timetableEntry.findMany({
        where: { subjectId: id, classId: { in: removed.map((row) => row.classId) } },
        select: { class: { select: { name: true } } },
        distinct: ["classId"],
      });
      if (scheduled.length) {
        throw new ConflictException(
          `Remove this subject from the timetable of ${scheduled
            .map((row) => row.class?.name)
            .join(", ")} before unassigning it.`,
        );
      }
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.classSubject.deleteMany({
        where: { subjectId: id, classId: { notIn: classIds } },
      });
      for (const row of input.assignments) {
        await tx.classSubject.upsert({
          where: { classId_subjectId: { classId: row.classId, subjectId: id } },
          create: {
            classId: row.classId,
            subjectId: id,
            teacherId: row.teacherId ?? null,
            isCompulsory: row.isCompulsory,
          },
          update: { teacherId: row.teacherId ?? null, isCompulsory: row.isCompulsory },
        });
      }
    });
    return this.list(schoolId, true).then((all) => all.find((s) => s.id === id));
  }

  /** Replace the set of teachers qualified to teach this subject. */
  async setTeachers(schoolId: string, id: string, input: SetSubjectTeachersInput) {
    await this.require(schoolId, id);
    const unique = [...new Set(input.teacherIds)];
    const check = await this.countTeachers(schoolId, unique);
    if (check.expected !== check.found) {
      throw new BadRequestException("Choose active teachers that belong to this school.");
    }
    await this.prisma.client.$transaction([
      this.prisma.client.subjectTeacher.deleteMany({
        where: { subjectId: id, teacherId: { notIn: unique } },
      }),
      this.prisma.client.subjectTeacher.createMany({
        data: unique.map((teacherId) => ({ subjectId: id, teacherId })),
        skipDuplicates: true,
      }),
    ]);
    return this.list(schoolId, true).then((all) => all.find((s) => s.id === id));
  }

  private async countTeachers(schoolId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return { expected: 0, found: 0 };
    const found = await this.prisma.client.teacher.count({
      where: { id: { in: unique }, schoolId, deletedAt: null, isActive: true },
    });
    return { expected: unique.length, found };
  }

  private async require(schoolId: string, id: string) {
    const subject = await this.prisma.client.subject.findFirst({
      where: { id, schoolId, deletedAt: null },
    });
    if (!subject) throw new NotFoundException("Subject not found.");
    return subject;
  }

  private async ensureCodeFree(schoolId: string, code: string, exceptId?: string) {
    const clash = await this.prisma.client.subject.findFirst({
      where: { schoolId, code, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`The subject code ${code} is already in use.`);
  }
}
