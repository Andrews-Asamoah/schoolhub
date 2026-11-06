import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import type { School } from '@prisma/client';
import {
  STUDENT_IMPORT_LIMITS,
  saveTimetableEntrySchema,
  type ImportTimetableBatchInput,
  type TimetableDay,
} from '@schoolhub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { parseUpload } from '../students/import/import-parse.js';
import { findPeriod, normalizeKey, parseDay, parseEntryType, type EntryType } from './timetable-import-rules.js';
import { findPlacementClash, periodsOverlap, type SlotUsage } from './timetable-rules.js';
import { TimetableService } from './timetable.service.js';

type Field = 'class' | 'day' | 'period' | 'type' | 'subject' | 'strand' | 'teacher' | 'room' | 'label';

const FIELD_ALIASES: Record<Field, string[]> = {
  class: ['class', 'classname'],
  day: ['day', 'dayofweek', 'weekday'],
  period: ['period', 'periodname', 'starttime', 'start'],
  type: ['type', 'entrytype', 'kind'],
  subject: ['subject', 'subjectcode', 'subjectname'],
  strand: ['strand', 'teachingarea', 'area'],
  teacher: ['teacher', 'teacheremail', 'teachername'],
  room: ['room', 'classroom', 'roomname'],
  label: ['label', 'title', 'note', 'activity'],
};
const REQUIRED: Field[] = ['class', 'day', 'period'];

export type PreviewStatus = 'ready' | 'update' | 'duplicate' | 'error';
export interface PreviewRow {
  rowNumber: number;
  name: string;
  status: PreviewStatus;
  errors: string[];
  row: Record<string, unknown> | null;
  existingId?: string;
}
interface Placed {
  id: string;
  day: TimetableDay;
  startTime: string;
  endTime: string;
  usage: SlotUsage;
}

export interface TimetableImportResult {
  rowNumber: number;
  name: string;
  status: 'created' | 'updated' | 'failed';
  message?: string;
}

function personName(teacher: {
  firstName: string | null;
  lastName: string | null;
  profile: { firstName: string; lastName: string } | null;
}) {
  const first = teacher.firstName ?? teacher.profile?.firstName ?? '';
  const last = teacher.lastName ?? teacher.profile?.lastName ?? '';
  return `${first} ${last}`.trim();
}

function responseMessage(error: HttpException): string {
  const body = error.getResponse();
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(' ');
  }
  return error.message;
}

/**
 * Bulk upload for the class timetable. One row is one lesson, break or activity
 * for one class in one period. The preview resolves every name to an id and
 * flags problems; the import then saves each row through TimetableService so it
 * passes exactly the checks a lesson made in the editor does.
 */
@Injectable()
export class TimetableImportService {
  private readonly logger = new Logger(TimetableImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timetable: TimetableService,
  ) {}

  async preview(
    school: Pick<School, 'id'>,
    file: { buffer: Buffer; originalname: string },
    academicYearId?: string,
  ) {
    const { format, sheet } = await parseUpload(file.buffer, file.originalname);

    const fieldByHeader = new Map(
      Object.entries(FIELD_ALIASES).flatMap(([field, aliases]) =>
        aliases.map((alias) => [alias, field as Field] as const),
      ),
    );
    const columns = new Map<number, Field>();
    for (const [index, header] of sheet.headers.entries()) {
      const field = fieldByHeader.get(normalizeKey(header));
      if (field && ![...columns.values()].includes(field)) columns.set(index, field);
    }
    const missing = REQUIRED.filter((field) => ![...columns.values()].includes(field));
    if (missing.length) {
      throw new BadRequestException(
        `Missing required columns: ${missing.join(', ')}. Download the template and keep its headings.`,
      );
    }

    const yearId = await this.timetable.resolveYearId(school.id, academicYearId);
    const db = this.prisma.client;
    const [classes, periods, subjects, teachers, rooms, classSubjects, entries] = await Promise.all([
      db.class.findMany({
        where: { schoolId: school.id, deletedAt: null, isActive: true },
        select: { id: true, name: true, departmentId: true },
      }),
      db.periodTemplate.findMany({ where: { schoolId: school.id } }),
      db.subject.findMany({
        where: { schoolId: school.id, deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          strands: { where: { isActive: true }, select: { id: true, name: true, code: true } },
        },
      }),
      db.teacher.findMany({
        where: { schoolId: school.id, deletedAt: null, isActive: true },
        select: {
          id: true,
          invitationEmail: true,
          firstName: true,
          lastName: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      }),
      db.classroom.findMany({ where: { schoolId: school.id }, select: { id: true, name: true } }),
      db.classSubject.findMany({
        where: { class: { schoolId: school.id, deletedAt: null }, subject: { deletedAt: null } },
        select: {
          classId: true,
          subjectId: true,
          teacherId: true,
          strandAssignments: { select: { subjectStrandId: true, teacherId: true } },
        },
      }),
      db.timetableEntry.findMany({
        where: { schoolId: school.id, academicYearId: yearId },
        select: {
          id: true,
          classId: true,
          teacherId: true,
          classroomId: true,
          type: true,
          class: { select: { name: true } },
          timeSlot: { select: { dayOfWeek: true, startTime: true, endTime: true } },
        },
      }),
    ]);

    const teacherEntries = teachers.map((teacher) => ({
      id: teacher.id,
      email: teacher.invitationEmail?.trim().toLowerCase() ?? '',
      nameKey: normalizeKey(personName(teacher)),
    }));
    const classSubjectByKey = new Map(classSubjects.map((row) => [`${row.classId}|${row.subjectId}`, row]));

    // Everything already on the timetable, plus rows accepted earlier in this file.
    const existing: (Placed & { classId: string | null })[] = entries.map((entry) => ({
      id: entry.id,
      classId: entry.classId,
      day: entry.timeSlot.dayOfWeek as TimetableDay,
      startTime: entry.timeSlot.startTime,
      endTime: entry.timeSlot.endTime,
      usage: {
        id: entry.id,
        classId: entry.classId,
        className: entry.class?.name ?? null,
        teacherId: entry.teacherId,
        classroomId: entry.classroomId,
        type: entry.type as EntryType,
      },
    }));
    const placed: Placed[] = [];
    const seen = new Set<string>();
    let lessonsWithoutTeacher = 0;

    const rows: PreviewRow[] = sheet.records.map((record) => {
      const raw: Partial<Record<Field, string>> = {};
      for (const [index, field] of columns) raw[field] = (record.cells[index] ?? '').trim();
      const name = `${raw.class || '(no class)'} · ${raw.day || '(no day)'} · ${raw.period || '(no period)'}`;
      const fail = (errors: string[], status: PreviewStatus = 'error'): PreviewRow => ({
        rowNumber: record.rowNumber,
        name,
        status,
        errors,
        row: null,
      });
      const errors: string[] = [];

      // ---- class, day, period ------------------------------------------------
      const classMatches = raw.class ? classes.filter((c) => normalizeKey(c.name) === normalizeKey(raw.class!)) : [];
      if (!raw.class) errors.push('Class is required.');
      else if (classMatches.length === 0) errors.push(`No active class named "${raw.class}" exists in this school.`);
      else if (classMatches.length > 1) errors.push(`More than one class is named "${raw.class}". Rename one of them first.`);
      const klass = classMatches.length === 1 ? classMatches[0]! : null;

      const day = raw.day ? parseDay(raw.day) : null;
      if (!raw.day) errors.push('Day is required.');
      else if (!day) errors.push(`"${raw.day}" is not a day. Use Monday to Sunday.`);

      const type = parseEntryType(raw.type ?? '');
      if (!type) errors.push(`"${raw.type}" is not a type. Use LESSON, BREAK or ACTIVITY.`);

      let period: (typeof periods)[number] | null = null;
      if (!raw.period) errors.push('Period is required.');
      else if (klass) {
        const deptPeriods = periods.filter((p) => (p.departmentId ?? null) === (klass.departmentId ?? null));
        period = findPeriod(deptPeriods, raw.period);
        if (!period) {
          errors.push(
            `${klass.name} has no period "${raw.period}". Use a period name or start time from this class's Periods list.`,
          );
        }
      }

      // ---- subject, strand, teacher, room -----------------------------------
      let subject: (typeof subjects)[number] | null = null;
      if (raw.subject) {
        const key = normalizeKey(raw.subject);
        const matches = subjects.filter((s) => normalizeKey(s.code) === key || normalizeKey(s.name) === key);
        if (matches.length === 0) errors.push(`No active subject "${raw.subject}" exists. Use the subject name or code.`);
        else if (new Set(matches.map((s) => s.id)).size > 1) errors.push(`"${raw.subject}" matches more than one subject. Use the subject code.`);
        else subject = matches[0]!;
      } else if (type === 'LESSON') {
        errors.push('Subject is required for a lesson.');
      }

      let strand: { id: string } | null = null;
      if (subject && type === 'LESSON') {
        if (subject.strands.length > 0) {
          const key = normalizeKey(raw.strand ?? '');
          const found = key
            ? subject.strands.find((s) => normalizeKey(s.name) === key || normalizeKey(s.code ?? '') === key)
            : null;
          if (!raw.strand) errors.push(`${subject.name} is taught in teaching areas. Name the teaching area in the strand column.`);
          else if (!found) errors.push(`"${raw.strand}" is not a teaching area of ${subject.name}.`);
          else strand = found;
        } else if (raw.strand) {
          errors.push(`${subject.name} has no teaching areas, so leave the strand blank.`);
        }
      }

      let teacherId: string | undefined;
      if (raw.teacher && type !== 'BREAK') {
        const value = raw.teacher.trim().toLowerCase();
        const matches = value.includes('@')
          ? teacherEntries.filter((t) => t.email === value)
          : teacherEntries.filter((t) => t.nameKey === normalizeKey(value));
        if (matches.length === 0) errors.push(`No active teacher "${raw.teacher}" was found. Use their email address or full name.`);
        else if (matches.length > 1) errors.push(`More than one teacher is named "${raw.teacher}". Use their email address.`);
        else teacherId = matches[0]!.id;
      }

      let classroomId: string | undefined;
      if (raw.room && type !== 'BREAK') {
        const room = rooms.find((r) => normalizeKey(r.name) === normalizeKey(raw.room!));
        if (!room) errors.push(`No room named "${raw.room}" exists. Add it under Rooms first.`);
        else classroomId = room.id;
      }

      if (errors.length || !klass || !day || !type || !period) return fail(errors);

      // ---- the same schema the timetable editor uses -------------------------
      const input = {
        classId: klass.id,
        dayOfWeek: day,
        periodId: period.id,
        type,
        ...(subject ? { subjectId: subject.id } : {}),
        ...(strand ? { subjectStrandId: strand.id } : {}),
        ...(teacherId ? { teacherId } : {}),
        ...(classroomId ? { classroomId } : {}),
        ...(raw.label ? { label: raw.label } : {}),
      };
      const checked = saveTimetableEntrySchema.safeParse(input);
      if (!checked.success) return fail(checked.error.issues.map((issue) => issue.message));

      // ---- who teaches it, mirroring TimetableService.saveEntry --------------
      let effectiveTeacherId: string | null = null;
      if (type === 'LESSON' && subject) {
        const link = classSubjectByKey.get(`${klass.id}|${subject.id}`);
        if (strand) {
          const assigned = link?.strandAssignments.find((a) => a.subjectStrandId === strand!.id)?.teacherId ?? null;
          if (!assigned) return fail([`This teaching area has no teacher assigned to ${klass.name}.`]);
          if (teacherId && teacherId !== assigned) {
            return fail(['The teacher must match the one assigned to this teaching area and class.']);
          }
          effectiveTeacherId = assigned;
        } else {
          effectiveTeacherId = teacherId ?? link?.teacherId ?? null;
        }
        if (!effectiveTeacherId) lessonsWithoutTeacher += 1;
      }
      const effectiveRoomId = type === 'BREAK' ? null : classroomId ?? null;

      // ---- duplicates and what is already scheduled --------------------------
      const slotKey = `${klass.id}|${day}|${period.id}`;
      if (seen.has(slotKey)) {
        return fail([`Another row in this file already fills ${klass.name} on ${day.toLowerCase()} in ${period.name}.`], 'duplicate');
      }
      seen.add(slotKey);

      const occupant = existing.find(
        (entry) =>
          entry.classId === klass.id &&
          entry.day === day &&
          entry.startTime === period.startTime &&
          entry.endTime === period.endTime,
      );

      const sameTime = [...existing.filter((entry) => entry.id !== occupant?.id), ...placed]
        .filter((entry) => entry.day === day && periodsOverlap(entry, period))
        .map((entry) => entry.usage);
      const clash = findPlacementClash(sameTime, {
        classId: klass.id,
        teacherId: type === 'BREAK' ? null : effectiveTeacherId,
        classroomId: effectiveRoomId,
        type,
      });
      if (clash) return fail([clash]);

      // A row that replaces a lesson is not added to `placed`: whether it replaces
      // or is skipped is chosen later, and every row is checked again on import.
      if (!occupant) {
        placed.push({
          id: `row-${record.rowNumber}`,
          day,
          startTime: period.startTime,
          endTime: period.endTime,
          usage: {
            id: `row-${record.rowNumber}`,
            classId: klass.id,
            className: klass.name,
            teacherId: type === 'BREAK' ? null : effectiveTeacherId,
            classroomId: effectiveRoomId,
            type,
          },
        });
      }

      return {
        rowNumber: record.rowNumber,
        name,
        status: occupant ? 'update' : 'ready',
        errors: [],
        row: checked.data,
        ...(occupant ? { existingId: occupant.id } : {}),
      };
    });

    const count = (status: PreviewStatus) => rows.filter((row) => row.status === status).length;
    const notices = [
      ...(lessonsWithoutTeacher > 0
        ? [
            `${lessonsWithoutTeacher} lesson${lessonsWithoutTeacher === 1 ? ' has' : 's have'} no teacher in the file or in the class's subject assignments. They are checked again on import, which uses the subject's only qualified teacher if there is exactly one.`,
          ]
        : []),
    ];
    return {
      file: { name: file.originalname, format, rows: rows.length },
      notices,
      summary: {
        total: rows.length,
        ready: count('ready'),
        update: count('update'),
        duplicate: count('duplicate'),
        error: count('error'),
      },
      rows,
    };
  }

  async importBatch(school: Pick<School, 'id'>, input: ImportTimetableBatchInput) {
    if (input.rows.length > STUDENT_IMPORT_LIMITS.batchSize) {
      throw new BadRequestException(`Send between 1 and ${STUDENT_IMPORT_LIMITS.batchSize} rows per batch.`);
    }
    const results: TimetableImportResult[] = [];
    for (const item of input.rows) {
      const name = item.name || `Row ${item.rowNumber}`;
      try {
        await this.timetable.saveEntry(school.id, item.row, {
          academicYearId: input.academicYearId,
          ...(item.existingId ? { entryId: item.existingId } : {}),
        });
        results.push({ rowNumber: item.rowNumber, name, status: item.existingId ? 'updated' : 'created' });
      } catch (error) {
        if (error instanceof HttpException) {
          results.push({ rowNumber: item.rowNumber, name, status: 'failed', message: responseMessage(error) });
        } else {
          this.logger.error(`Timetable import row ${item.rowNumber} failed`, error instanceof Error ? error.stack : String(error));
          results.push({ rowNumber: item.rowNumber, name, status: 'failed', message: 'This row could not be saved.' });
        }
      }
    }
    return { results };
  }
}
