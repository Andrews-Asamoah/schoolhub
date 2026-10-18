import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  SaveClassroomInput,
  SavePeriodInput,
  SaveTimetableEntryInput,
} from '@schoolhub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { findPlacementClash, periodsOverlap } from './timetable-rules.js';

const entryInclude = {
  class: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, code: true } },
  teacher: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      profile: { select: { firstName: true, lastName: true } },
    },
  },
  classroom: { select: { id: true, name: true } },
  timeSlot: true,
} as const;

type EntryRow = Awaited<
  ReturnType<TimetableService['findEntries']>
>[number];

function personName(person: {
  firstName: string | null;
  lastName: string | null;
  profile: { firstName: string; lastName: string } | null;
}) {
  const first = person.firstName ?? person.profile?.firstName ?? '';
  const last = person.lastName ?? person.profile?.lastName ?? '';
  return `${first} ${last}`.trim() || 'Unnamed teacher';
}

@Injectable()
export class TimetableService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- setup ---

  /** Everything the timetable screen needs in one round trip. */
  async getSetup(schoolId: string, academicYearId?: string) {
    const db = this.prisma.client;
    const [years, periods, classrooms, classes, subjects, teachers, classSubjects] =
      await Promise.all([
        db.academicYear.findMany({
          where: { schoolId },
          orderBy: { startDate: 'desc' },
          select: { id: true, name: true, isCurrent: true },
        }),
        this.listPeriods(schoolId),
        this.listClassrooms(schoolId),
        db.class.findMany({
          where: { schoolId, deletedAt: null, isActive: true },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, level: true, academicYearId: true },
        }),
        db.subject.findMany({
          where: { schoolId, deletedAt: null, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, code: true, periodsPerWeek: true },
        }),
        db.teacher.findMany({
          where: { schoolId, deletedAt: null, isActive: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        }),
        db.classSubject.findMany({
          where: { class: { schoolId, deletedAt: null }, subject: { deletedAt: null } },
          select: { classId: true, subjectId: true, teacherId: true },
        }),
      ]);
    const year =
      years.find((row) => row.id === academicYearId) ??
      years.find((row) => row.isCurrent) ??
      null;
    return {
      academicYear: year,
      academicYears: years,
      periods,
      classrooms,
      classes,
      subjects,
      teachers: teachers
        .map((teacher) => ({ id: teacher.id, name: personName(teacher) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      classSubjects,
    };
  }

  // -------------------------------------------------------------- periods ---

  listPeriods(schoolId: string) {
    return this.prisma.client.periodTemplate.findMany({
      where: { schoolId, departmentId: null },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createPeriod(schoolId: string, input: SavePeriodInput) {
    await this.assertNoPeriodOverlap(schoolId, input);
    const count = await this.prisma.client.periodTemplate.count({
      where: { schoolId, departmentId: null },
    });
    return this.prisma.client.periodTemplate.create({
      data: {
        schoolId,
        departmentId: null,
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        sortOrder: input.sortOrder ?? count,
      },
    });
  }

  async updatePeriod(schoolId: string, id: string, input: SavePeriodInput) {
    const period = await this.requirePeriod(schoolId, id);
    await this.assertNoPeriodOverlap(schoolId, input, id);
    const timesChanged =
      period.startTime !== input.startTime || period.endTime !== input.endTime;
    if (timesChanged && (await this.countEntriesInPeriod(schoolId, period)) > 0) {
      throw new ConflictException(
        'Lessons are already scheduled in this period. Move or remove them before changing its times.',
      );
    }
    return this.prisma.client.periodTemplate.update({
      where: { id },
      data: {
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        sortOrder: input.sortOrder,
      },
    });
  }

  async deletePeriod(schoolId: string, id: string) {
    const period = await this.requirePeriod(schoolId, id);
    if ((await this.countEntriesInPeriod(schoolId, period)) > 0) {
      throw new ConflictException(
        'Lessons are scheduled in this period. Remove them before deleting it.',
      );
    }
    await this.prisma.client.periodTemplate.delete({ where: { id } });
    return { success: true };
  }

  // ----------------------------------------------------------- classrooms ---

  listClassrooms(schoolId: string) {
    return this.prisma.client.classroom.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
    });
  }

  async createClassroom(schoolId: string, input: SaveClassroomInput) {
    try {
      return await this.prisma.client.classroom.create({
        data: { schoolId, name: input.name, capacity: input.capacity },
      });
    } catch (error) {
      this.rethrowUnique(error, 'A room with that name already exists.');
    }
  }

  async updateClassroom(schoolId: string, id: string, input: SaveClassroomInput) {
    await this.requireClassroom(schoolId, id);
    try {
      return await this.prisma.client.classroom.update({
        where: { id },
        data: { name: input.name, capacity: input.capacity ?? null },
      });
    } catch (error) {
      this.rethrowUnique(error, 'A room with that name already exists.');
    }
  }

  async deleteClassroom(schoolId: string, id: string) {
    await this.requireClassroom(schoolId, id);
    // Timetable entries keep their lesson; the room is simply cleared (SetNull).
    await this.prisma.client.classroom.delete({ where: { id } });
    return { success: true };
  }

  // -------------------------------------------------------------- entries ---

  /** view: class | teacher | room. Returns flat rows the client lays out in a grid. */
  async getTimetable(
    schoolId: string,
    view: 'class' | 'teacher' | 'room',
    targetId: string,
    academicYearId?: string,
  ) {
    const yearId = await this.resolveYearId(schoolId, academicYearId);
    const entries = await this.findEntries(schoolId, yearId, {
      ...(view === 'class' ? { classId: targetId } : {}),
      ...(view === 'teacher' ? { teacherId: targetId } : {}),
      ...(view === 'room' ? { classroomId: targetId } : {}),
    });
    return { academicYearId: yearId, entries: entries.map((row) => this.toDto(row)) };
  }

  /** The signed-in teacher's own weekly timetable. */
  async getTeacherOwnTimetable(schoolId: string, userId: string, academicYearId?: string) {
    const teacher = await this.prisma.client.teacher.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!teacher) {
      throw new NotFoundException('No teacher record is linked to your account.');
    }
    return {
      teacherId: teacher.id,
      ...(await this.getTimetable(schoolId, 'teacher', teacher.id, academicYearId)),
    };
  }

  async saveEntry(
    schoolId: string,
    input: SaveTimetableEntryInput,
    options: { entryId?: string; academicYearId?: string },
  ) {
    const db = this.prisma.client;
    const yearId = await this.resolveYearId(schoolId, options.academicYearId);
    const existing = options.entryId
      ? await db.timetableEntry.findFirst({
          where: { id: options.entryId, schoolId },
        })
      : null;
    if (options.entryId && !existing) throw new NotFoundException('Lesson not found.');

    const [klass, period] = await Promise.all([
      db.class.findFirst({
        where: { id: input.classId, schoolId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.requirePeriod(schoolId, input.periodId),
    ]);
    if (!klass) throw new BadRequestException('Choose a class that belongs to this school.');

    let subjectId: string | null = null;
    let teacherId: string | null = null;
    let classroomId: string | null = null;
    if (input.type === 'LESSON') {
      const subject = await db.subject.findFirst({
        where: { id: input.subjectId, schoolId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (!subject) throw new BadRequestException('Choose an active subject from this school.');
      subjectId = subject.id;
      teacherId = input.teacherId
        ? await this.requireTeacher(schoolId, input.teacherId)
        : await this.inferTeacher(klass.id, subject.id);
    } else if (input.subjectId) {
      const subject = await db.subject.findFirst({
        where: { id: input.subjectId, schoolId, deletedAt: null },
        select: { id: true },
      });
      subjectId = subject?.id ?? null;
    }
    if (input.type !== 'BREAK' && input.classroomId) {
      classroomId = await this.requireClassroom(schoolId, input.classroomId).then((room) => room.id);
    }

    const slot = await this.ensureTimeSlot(schoolId, input.dayOfWeek, period);
    const sameSlot = await db.timetableEntry.findMany({
      where: { schoolId, academicYearId: yearId, timeSlotId: slot.id },
      include: { class: { select: { name: true } } },
    });
    const clash = findPlacementClash(
      sameSlot.map((row) => ({
        id: row.id,
        classId: row.classId,
        className: row.class?.name ?? null,
        teacherId: row.teacherId,
        classroomId: row.classroomId,
        type: row.type,
      })),
      {
        id: existing?.id,
        classId: klass.id,
        teacherId,
        classroomId,
        type: input.type,
      },
    );
    if (clash) throw new ConflictException(clash);

    const data = {
      schoolId,
      classId: klass.id,
      type: input.type,
      label: input.label || null,
      subjectId,
      teacherId: input.type === 'BREAK' ? null : teacherId,
      classroomId,
      timeSlotId: slot.id,
      academicYearId: yearId,
    };
    const saved = existing
      ? await db.timetableEntry.update({ where: { id: existing.id }, data })
      : await db.timetableEntry.create({ data });
    const full = await this.findEntries(schoolId, yearId, { id: saved.id });
    return this.toDto(full[0]!);
  }

  async deleteEntry(schoolId: string, id: string) {
    const result = await this.prisma.client.timetableEntry.deleteMany({
      where: { id, schoolId },
    });
    if (!result.count) throw new NotFoundException('Lesson not found.');
    return { success: true };
  }

  // -------------------------------------------------------------- helpers ---

  private findEntries(
    schoolId: string,
    academicYearId: string,
    where: { id?: string; classId?: string; teacherId?: string; classroomId?: string },
  ) {
    return this.prisma.client.timetableEntry.findMany({
      where: { schoolId, academicYearId, ...where },
      include: entryInclude,
      orderBy: [{ timeSlot: { startTime: 'asc' } }],
    });
  }

  private toDto(row: EntryRow) {
    return {
      id: row.id,
      type: row.type,
      label: row.label,
      dayOfWeek: row.timeSlot.dayOfWeek,
      startTime: row.timeSlot.startTime,
      endTime: row.timeSlot.endTime,
      class: row.class,
      subject: row.subject,
      teacher: row.teacher ? { id: row.teacher.id, name: personName(row.teacher) } : null,
      classroom: row.classroom,
    };
  }

  private async resolveYearId(schoolId: string, academicYearId?: string) {
    const year = await this.prisma.client.academicYear.findFirst({
      where: academicYearId ? { id: academicYearId, schoolId } : { schoolId, isCurrent: true },
      select: { id: true },
    });
    if (!year) {
      throw new BadRequestException(
        'Set up a current academic year before building the timetable.',
      );
    }
    return year.id;
  }

  private async ensureTimeSlot(
    schoolId: string,
    dayOfWeek: SaveTimetableEntryInput['dayOfWeek'],
    period: { name: string; startTime: string; endTime: string },
  ) {
    const db = this.prisma.client;
    const found = await db.timeSlot.findFirst({
      where: {
        schoolId,
        departmentId: null,
        dayOfWeek,
        startTime: period.startTime,
        endTime: period.endTime,
      },
    });
    return (
      found ??
      db.timeSlot.create({
        data: {
          schoolId,
          departmentId: null,
          dayOfWeek,
          startTime: period.startTime,
          endTime: period.endTime,
          label: period.name,
        },
      })
    );
  }

  /** Class-specific assignment wins, then a subject with exactly one qualified teacher. */
  private async inferTeacher(classId: string, subjectId: string) {
    const db = this.prisma.client;
    const assigned = await db.classSubject.findUnique({
      where: { classId_subjectId: { classId, subjectId } },
      select: { teacherId: true },
    });
    if (assigned?.teacherId) return assigned.teacherId;
    const qualified = await db.subjectTeacher.findMany({
      where: { subjectId, teacher: { isActive: true, deletedAt: null } },
      select: { teacherId: true },
      take: 2,
    });
    return qualified.length === 1 ? qualified[0]!.teacherId : null;
  }

  private async requireTeacher(schoolId: string, id: string) {
    const teacher = await this.prisma.client.teacher.findFirst({
      where: { id, schoolId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!teacher) throw new BadRequestException('Choose an active teacher from this school.');
    return teacher.id;
  }

  private async requirePeriod(schoolId: string, id: string) {
    const period = await this.prisma.client.periodTemplate.findFirst({
      where: { id, schoolId },
    });
    if (!period) throw new NotFoundException('Period not found.');
    return period;
  }

  private async requireClassroom(schoolId: string, id: string) {
    const room = await this.prisma.client.classroom.findFirst({ where: { id, schoolId } });
    if (!room) throw new NotFoundException('Room not found.');
    return room;
  }

  private countEntriesInPeriod(
    schoolId: string,
    period: { startTime: string; endTime: string },
  ) {
    return this.prisma.client.timetableEntry.count({
      where: {
        schoolId,
        timeSlot: { startTime: period.startTime, endTime: period.endTime },
      },
    });
  }

  private async assertNoPeriodOverlap(
    schoolId: string,
    input: { startTime: string; endTime: string },
    exceptId?: string,
  ) {
    const others = await this.prisma.client.periodTemplate.findMany({
      where: { schoolId, departmentId: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    const clash = others.find((other) => periodsOverlap(other, input));
    if (clash) {
      throw new BadRequestException(
        `These times overlap ${clash.name} (${clash.startTime}–${clash.endTime}).`,
      );
    }
  }

  private rethrowUnique(error: unknown, message: string): never {
    if ((error as { code?: string })?.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
