import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AttendanceStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { calculateAttendanceRollout, dateString, eligibleInstructionalDates, isoDay, requireWeekdays } from "./attendance-calendar.js";

export type CalendarConfiguration = {
  weekdays: number[];
  reason: string;
  overrides: { date: string; isInstructional: boolean; label: string }[];
};

/** School-scoped, audited, daily calendar and individual approved absence exclusions. */
@Injectable()
export class AttendanceCalendarService {
  constructor(private readonly prisma: PrismaService) {}


  async getPolicy(schoolId: string) {
    const school = await this.prisma.client.school.findUnique({
      where: { id: schoolId }, select: { attendancePolicyActiveFrom: true },
    });
    if (!school) throw new NotFoundException("School not found.");
    return { attendancePolicyActiveFrom: school.attendancePolicyActiveFrom
      ? dateString(school.attendancePolicyActiveFrom) : null };
  }

  async setPolicy(schoolId: string, actorId: string, input: {
    attendancePolicyActiveFrom: string | null; reason: string;
  }) {
    if (input.attendancePolicyActiveFrom) {
      try { isoDay(input.attendancePolicyActiveFrom); }
      catch { throw new BadRequestException("Enter a valid activation date."); }
      if (input.attendancePolicyActiveFrom < dateString(new Date())) {
        throw new BadRequestException("Choose today or a future activation date; historical adoption requires a reviewed migration.");
      }
    }
    return this.prisma.client.$transaction(async tx => {
      const school = await tx.school.findUnique({
        where: { id: schoolId }, select: { attendancePolicyActiveFrom: true },
      });
      if (!school) throw new NotFoundException("School not found.");
      const oldDate = school.attendancePolicyActiveFrom ? dateString(school.attendancePolicyActiveFrom) : null;
      if (oldDate === input.attendancePolicyActiveFrom) {
        return { attendancePolicyActiveFrom: oldDate, changed: false };
      }
      const newValue = input.attendancePolicyActiveFrom
        ? new Date(input.attendancePolicyActiveFrom + "T00:00:00.000Z") : null;
      await tx.school.update({ where: { id: schoolId },
        data: { attendancePolicyActiveFrom: newValue } });
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE",
        entityType: "ATTENDANCE_POLICY", entityId: schoolId,
        oldValues: { activeFrom: oldDate ?? "DISABLED" },
        newValues: { activeFrom: input.attendancePolicyActiveFrom ?? "DISABLED",
          reason: input.reason.trim() } },
      });
      return { attendancePolicyActiveFrom: input.attendancePolicyActiveFrom, changed: true };
    });
  }

  private async requireTerm(schoolId: string, termId: string) {
    const term = await this.prisma.client.term.findFirst({
      where: { id: termId, academicYear: { schoolId } },
      select: { id: true, startDate: true, endDate: true, academicYearId: true,
        instructionalWeekdays: true, calendarRevision: true },
    });
    if (!term) throw new NotFoundException("Academic term not found in this school.");
    return term;
  }

  private async assertCanAmend(schoolId: string, termId: string) {
    const published = await this.prisma.client.reportCardSet.count({
      where: { schoolId, termId, status: { in: ["PUBLISHED", "ARCHIVED"] } },
    });
    if (published) throw new ConflictException("This term already has published reports. Supersede reports through a controlled amendment workflow before changing the calendar.");
  }

  async getCalendar(schoolId: string, termId: string) {
    const term = await this.requireTerm(schoolId, termId);
    const days = await this.prisma.client.academicCalendarDay.findMany({
      where: { schoolId, termId },
      orderBy: { date: "asc" },
      select: { id: true, date: true, label: true, isInstructional: true, createdAt: true, updatedAt: true },
    });
    return { term, days, isoWeekdays: term.instructionalWeekdays };
  }

  async replaceCalendar(schoolId: string, actorId: string, termId: string, input: CalendarConfiguration) {
    const term = await this.requireTerm(schoolId, termId);
    await this.assertCanAmend(schoolId, termId);
    let weekdays: number[];
    try { weekdays = requireWeekdays(input.weekdays); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    const min = dateString(term.startDate), max = dateString(term.endDate);
    const dates = new Set<string>();
    for (const entry of input.overrides) {
      try { isoDay(entry.date); } catch { throw new BadRequestException("Calendar overrides require real ISO dates."); }
      if (entry.date < min || entry.date > max) throw new BadRequestException("Calendar override falls outside its term.");
      if (dates.has(entry.date)) throw new BadRequestException("Duplicate calendar override date.");
      dates.add(entry.date);
    }
    // Under SERIALIZABLE, a transaction that waits on an advisory/row lock can
    // keep an older snapshot and miss attendance saved by the lock holder.
    // READ COMMITTED plus the shared term-row lock makes every post-lock
    // eligibility query see newly committed registers and closures.
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${termId}))`;
      await tx.$queryRaw`SELECT "id" FROM "terms" WHERE "id" = ${termId} FOR UPDATE`;
      const termNow = await tx.term.findFirst({
        where: { id: termId, academicYear: { schoolId } },
        select: { instructionalWeekdays: true, calendarRevision: true },
      });
      if (!termNow) throw new NotFoundException("Term not found.");
      const published = await tx.reportCardSet.count({ where: { schoolId, termId, status: { in: ["PUBLISHED", "ARCHIVED"] } } });
      if (published) throw new ConflictException("A report has been published since calendar editing began.");
      const existing = await tx.academicCalendarDay.findMany({ where: { schoolId, termId },
        select: { date: true, label: true, isInstructional: true } });
      const before = existing.map(row => ({ date: dateString(row.date), isInstructional: row.isInstructional, label: row.label }));
      const normal = (v: typeof before) => JSON.stringify(v.sort((a,b) => a.date.localeCompare(b.date)));
      if (JSON.stringify([...termNow.instructionalWeekdays].sort()) === JSON.stringify(weekdays) && normal(before) === normal([...input.overrides])) {
        return { changed: false, calendarRevision: termNow.calendarRevision };
      }
      const removedDays = new Set(eligibleInstructionalDates({
        start: min, end: max, asOf: max,
        weekdays: termNow.instructionalWeekdays,
        overrides: before.map(day => ({ date: day.date, isInstructional: day.isInstructional })),
      }));
      for (const day of eligibleInstructionalDates({
        start: min, end: max, asOf: max, weekdays,
        overrides: input.overrides.map(row => ({ date: row.date, isInstructional: row.isInstructional })),
      })) removedDays.delete(day);
      if (removedDays.size) {
        const marked = await tx.attendance.count({ where: {
          date: { in: [...removedDays].map(day => new Date(day + "T00:00:00.000Z")) },
          student: { schoolId },
        } });
        if (marked) throw new ConflictException(
          "Attendance has already been entered on a date now proposed as non-instructional. Review those records before closing the day.",
        );
      }
      await tx.academicCalendarDay.deleteMany({ where: { schoolId, termId } });
      if (input.overrides.length) await tx.academicCalendarDay.createMany({
        data: input.overrides.map(row => ({ schoolId, termId, date: new Date(row.date+"T00:00:00.000Z"),
          isInstructional: row.isInstructional, label: row.label.trim(), createdById: actorId })),
      });
      const updated = await tx.term.update({ where: { id: termId }, data: {
        instructionalWeekdays: weekdays, calendarRevision: { increment: 1 },
      }, select: { calendarRevision: true } });
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE",
        entityType: "ACADEMIC_CALENDAR", entityId: termId,
        oldValues: { weekdays: termNow.instructionalWeekdays, overrides: before } as Prisma.InputJsonValue,
        newValues: { weekdays, overrides: input.overrides, reason: input.reason.trim(), revision: updated.calendarRevision } as Prisma.InputJsonValue,
      } });
      return { changed: true, calendarRevision: updated.calendarRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  /** Admin-only school-wide closure; it must never erase marked class attendance. */
  async declareSchoolClosure(schoolId: string, actorId: string, termId: string, input: {
    date: string; label: string; reason: string; expectedRevision: number;
  }) {
    const term = await this.requireTerm(schoolId, termId);
    const iso = input.date;
    try { isoDay(iso); }
    catch { throw new BadRequestException("Use a valid ISO school calendar date."); }
    if (iso < dateString(term.startDate) || iso > dateString(term.endDate)) {
      throw new BadRequestException("Closure date must fall within the academic term.");
    }
    if (input.label.trim().length < 2 || input.reason.trim().length < 8) {
      throw new BadRequestException("Provide a closure label and a meaningful reason.");
    }
    return this.prisma.client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${termId}))`;
      await tx.$queryRaw`SELECT "id" FROM "terms" WHERE "id" = ${termId} FOR UPDATE`;
      const current = await tx.term.findFirst({
        where: { id: termId, academicYear: { schoolId } },
        select: { instructionalWeekdays: true, calendarRevision: true },
      });
      if (!current) throw new NotFoundException("Academic term not found.");
      if (current.calendarRevision !== input.expectedRevision) {
        throw new ConflictException("The calendar changed. Refresh the register review before declaring a closure.");
      }
      const published = await tx.reportCardSet.count({
        where: { schoolId, termId, status: { in: ["PUBLISHED", "ARCHIVED"] } },
      });
      if (published) throw new ConflictException("Reports have been published; calendar amendments require a controlled correction.");
      const day = new Date(iso + "T00:00:00.000Z");
      const existing = await tx.academicCalendarDay.findUnique({
        where: { schoolId_termId_date: { schoolId, termId, date: day } },
        select: { isInstructional: true, label: true },
      });
      if (!eligibleInstructionalDates({
        start: iso, end: iso, asOf: iso,
        weekdays: current.instructionalWeekdays,
        overrides: existing ? [{ date: iso, isInstructional: existing.isInstructional }] : [],
      }).length) throw new ConflictException("This date is already non-instructional.");
      const marked = await tx.attendance.count({
        where: { date: day, student: { schoolId } },
      });
      if (marked) throw new ConflictException(
        "One or more classes have saved attendance for this day. Review the registers before declaring a school-wide closure.",
      );
      const saved = await tx.academicCalendarDay.upsert({
        where: { schoolId_termId_date: { schoolId, termId, date: day } },
        create: { schoolId, termId, date: day, isInstructional: false,
          label: input.label.trim(), createdById: actorId },
        update: { isInstructional: false, label: input.label.trim(), createdById: actorId },
      });
      const updated = await tx.term.update({
        where: { id: termId }, data: { calendarRevision: { increment: 1 } },
        select: { calendarRevision: true },
      });
      await tx.auditLog.create({ data: {
        schoolId, userId: actorId, action: "UPDATE",
        entityType: "ACADEMIC_CALENDAR", entityId: saved.id,
        oldValues: { termId, date: iso, previous: existing?.label ?? "Weekly instructional day" },
        newValues: { termId, date: iso, label: input.label.trim(),
          isInstructional: false, reason: input.reason.trim(),
          revision: updated.calendarRevision },
      } });
      return { date: iso, schoolWide: true, calendarRevision: updated.calendarRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async listClassExclusions(schoolId: string, termId: string, classId: string) {
    const term = await this.requireTerm(schoolId, termId);
    if (!classId?.trim()) throw new BadRequestException("Choose a class.");
    const classroom = await this.prisma.client.class.findFirst({
      where: { id: classId, schoolId, deletedAt: null,
        OR: [{ academicYearId: term.academicYearId }, { academicYearId: null }] },
      select: { id: true },
    });
    if (!classroom) throw new NotFoundException("Class not found in this school and academic year.");
    const enrollments = await this.prisma.client.enrollment.findMany({
      where: { classId, academicYearId: term.academicYearId, termId,
        student: { schoolId, deletedAt: null } },
      select: { studentId: true },
    });
    if (!enrollments.length) return [];
    const rows = await this.prisma.client.studentAttendanceExclusion.findMany({
      where: { schoolId, termId, studentId: { in: enrollments.map(row => row.studentId) } },
      include: { student: { select: { profile: {
        select: { firstName: true, lastName: true },
      } } } },
      orderBy: { date: "desc" },
      take: 500,
    });
    return rows.map(({ student, date, ...row }) => ({
      ...row, date: dateString(date),
      studentName: [student.profile.firstName, student.profile.lastName].filter(Boolean).join(" "),
    }));
  }

  async listExclusions(schoolId: string, termId: string, studentId: string) {
    await this.requireTerm(schoolId, termId);
    const student = await this.prisma.client.student.findFirst({ where: { schoolId, id: studentId, deletedAt: null }, select: { id: true } });
    if (!student) throw new NotFoundException("Student not found.");
    return this.prisma.client.studentAttendanceExclusion.findMany({
      where: { schoolId, termId, studentId }, orderBy: { date: "asc" },
    });
  }

  async approveExclusion(schoolId: string, actorId: string, input: {
    studentId: string; termId: string; date: string; reason: string;
  }) {
    const term = await this.requireTerm(schoolId, input.termId);
    await this.assertCanAmend(schoolId, input.termId);
    try { isoDay(input.date); } catch { throw new BadRequestException("Invalid date."); }
    if (input.date < dateString(term.startDate) || input.date > dateString(term.endDate)) {
      throw new BadRequestException("Excluded date must be within the selected term.");
    }
    const enrollment = await this.prisma.client.enrollment.findFirst({ where: {
      studentId: input.studentId, termId: input.termId, status: "ACTIVE",
      student: { schoolId, deletedAt: null } },
      select: { id: true, effectiveFrom: true, effectiveTo: true,
        student: { select: { admissionDate: true } } },
    });
    if (!enrollment) throw new NotFoundException("Student is not actively enrolled in this school for the term.");
    const eligibleFrom = [dateString(term.startDate), dateString(enrollment.student.admissionDate),
      ...(enrollment.effectiveFrom ? [dateString(enrollment.effectiveFrom)] : [])].sort().at(-1)!;
    const eligibleTo = [dateString(term.endDate),
      ...(enrollment.effectiveTo ? [dateString(enrollment.effectiveTo)] : [])].sort()[0]!;
    if (input.date < eligibleFrom || input.date > eligibleTo) {
      throw new BadRequestException("Student was not eligible to attend on the selected date.");
    }
    const [calendarDays, daysOfTerm, existingMark] = await Promise.all([
      this.prisma.client.academicCalendarDay.findMany({ where: { schoolId, termId: input.termId },
        select: { date: true, isInstructional: true } }),
      this.prisma.client.term.findFirst({ where: { id: input.termId }, select: { instructionalWeekdays: true } }),
      this.prisma.client.attendance.findFirst({
        where: { studentId: input.studentId, date: new Date(input.date+"T00:00:00.000Z") }, select: { id: true },
      }),
    ]);
    if (existingMark) throw new ConflictException("Attendance has already been marked for this date. Review the entry before approving an exclusion.");
    const dates = eligibleInstructionalDates({
      start: input.date, end: input.date, asOf: input.date,
      weekdays: daysOfTerm?.instructionalWeekdays ?? [1,2,3,4,5],
      overrides: calendarDays.map(d => ({ date: dateString(d.date), isInstructional: d.isInstructional })),
    });
    if (!dates.length) throw new BadRequestException("An exclusion must be on an instructional day.");
    return this.prisma.client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${input.termId}))`;
      await tx.$queryRaw`SELECT "id" FROM "terms" WHERE "id" = ${input.termId} FOR UPDATE`;
      if (await tx.reportCardSet.count({ where: { schoolId, termId: input.termId, status: { in: ["PUBLISHED", "ARCHIVED"] } } })) {
        throw new ConflictException("Reports are published for this term.");
      }
      const mark = await tx.attendance.findFirst({ where: { studentId: input.studentId,
        date: new Date(input.date+"T00:00:00.000Z") }, select: { id: true } });
      if (mark) throw new ConflictException("An attendance mark already exists on the excluded date.");
      // Recheck instructional status after obtaining the calendar lock.
      const [currentTerm, currentOverride] = await Promise.all([
        tx.term.findFirst({ where: { id: input.termId, academicYear: { schoolId } },
          select: { instructionalWeekdays: true } }),
        tx.academicCalendarDay.findFirst({ where: { schoolId, termId: input.termId,
          date: new Date(input.date+"T00:00:00.000Z") }, select: { isInstructional: true } }),
      ]);
      if (!currentTerm || !eligibleInstructionalDates({
        start: input.date, end: input.date, asOf: input.date,
        weekdays: currentTerm.instructionalWeekdays,
        overrides: currentOverride ? [{ date: input.date, isInstructional: currentOverride.isInstructional }] : [],
      }).length) throw new ConflictException("The calendar has changed; this date is no longer instructional.");
      const existing = await tx.studentAttendanceExclusion.findUnique({
        where: { schoolId_studentId_termId_date: { schoolId, studentId: input.studentId,
          termId: input.termId, date: new Date(input.date+"T00:00:00.000Z") } },
      });
      if (existing) throw new ConflictException("This student already has an approved exclusion on the date.");
      const row = await tx.studentAttendanceExclusion.create({ data: {
        schoolId, studentId: input.studentId, termId: input.termId,
        date: new Date(input.date+"T00:00:00.000Z"), reason: input.reason.trim(), approvedById: actorId,
      } });
      await tx.term.update({ where: { id: input.termId }, data: { calendarRevision: { increment: 1 } } });
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "CREATE",
        entityType: "ATTENDANCE_EXCLUSION", entityId: row.id,
        newValues: { studentId: input.studentId, termId: input.termId, date: input.date, reason: input.reason } },
      });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async revokeExclusion(schoolId: string, actorId: string, exclusionId: string, reason: string) {
    const item = await this.prisma.client.studentAttendanceExclusion.findFirst({ where: { schoolId, id: exclusionId } });
    if (!item) throw new NotFoundException("Exclusion not found.");
    await this.assertCanAmend(schoolId, item.termId);
    return this.prisma.client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${item.termId}))`;
      await tx.$queryRaw`SELECT "id" FROM "terms" WHERE "id" = ${item.termId} FOR UPDATE`;
      if (await tx.reportCardSet.count({ where: { schoolId, termId: item.termId, status: { in: ["PUBLISHED", "ARCHIVED"] } } })) {
        throw new ConflictException("Reports are published for this term.");
      }
      const deleted = await tx.studentAttendanceExclusion.deleteMany({ where: { id: exclusionId, schoolId } });
      if (!deleted.count) throw new NotFoundException("Exclusion has already been revoked.");
      await tx.term.update({ where: { id: item.termId }, data: { calendarRevision: { increment: 1 } } });
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "DELETE",
        entityType: "ATTENDANCE_EXCLUSION", entityId: exclusionId, oldValues: {
          studentId: item.studentId, termId: item.termId, date: dateString(item.date), reason: item.reason,
        }, newValues: { reason: reason.trim() } } });
      return { success: true };
    });
  }

  async assertInstructionalDate(schoolId: string, termId: string, date: string, studentIds: string[]) {
    const term = await this.requireTerm(schoolId, termId);
    const overrides = await this.prisma.client.academicCalendarDay.findMany({
      where: { schoolId, termId }, select: { date: true, isInstructional: true },
    });
    if (!eligibleInstructionalDates({ start: date, end: date, asOf: date,
      weekdays: term.instructionalWeekdays, overrides: overrides.map(x => ({
        date: dateString(x.date), isInstructional: x.isInstructional,
      })) }).length) throw new BadRequestException("Attendance cannot be recorded on a school closure or non-instructional day.");
    const exclusions = await this.prisma.client.studentAttendanceExclusion.findMany({
      where: { schoolId, termId, studentId: { in: studentIds }, date: new Date(date+"T00:00:00.000Z") },
      select: { studentId: true },
    });
    if (exclusions.length) throw new ConflictException("One or more students have an approved exclusion for this day. Remove them from the register.");
  }

  async studentSummary(schoolId: string, studentId: string, academicYearId: string, term: {
    id: string; startDate: Date; endDate: Date; instructionalWeekdays: number[]; calendarRevision: number;
  }) {
    const enrollment = await this.prisma.client.enrollment.findFirst({
      where: { studentId, academicYearId, termId: term.id, student: { schoolId, deletedAt: null } },
      select: { status: true, effectiveFrom: true, effectiveTo: true,
        student: { select: { admissionDate: true } } },
    });
    if (!enrollment) throw new NotFoundException("Student is not enrolled in the selected term.");
    const start = [
      dateString(term.startDate), dateString(enrollment.student.admissionDate),
      ...(enrollment.effectiveFrom ? [dateString(enrollment.effectiveFrom)] : []),
    ].sort().at(-1)!;
    const end = [dateString(term.endDate), ...(enrollment.effectiveTo ? [dateString(enrollment.effectiveTo)] : [])].sort()[0]!;
    const asOf = dateString(new Date());
    const [days, exclusions, rows] = await Promise.all([
      this.prisma.client.academicCalendarDay.findMany({
        where: { schoolId, termId: term.id }, select: { date: true, isInstructional: true },
      }),
      this.prisma.client.studentAttendanceExclusion.findMany({
        where: { schoolId, termId: term.id, studentId }, select: { date: true },
      }),
      this.prisma.client.attendance.findMany({
        where: { studentId, date: { gte: term.startDate, lte: term.endDate } },
        select: { date: true, status: true },
      }),
    ]);
    const policy = await this.getPolicy(schoolId);
    if (!policy.attendancePolicyActiveFrom) {
      throw new BadRequestException("Calendar-based attendance has not been activated.");
    }
    let outcome: ReturnType<typeof calculateAttendanceRollout>;
    try {
      outcome = calculateAttendanceRollout({
        start, end, asOf, weekdays: term.instructionalWeekdays,
        activeFrom: policy.attendancePolicyActiveFrom,
        overrides: days.map(row => ({ date: dateString(row.date), isInstructional: row.isInstructional })),
        excludedDates: exclusions.map(row => dateString(row.date)),
        records: rows.map(row => ({ date: dateString(row.date), status: row.status as AttendanceStatus })),
      });
    } catch (error) {
      if (error instanceof Error && /invalid|exceeds|duplicate|instructional weekdays/i.test(error.message)) {
        throw new BadRequestException("The academic calendar requires correction before attendance can be calculated: " + error.message);
      }
      throw error;
    }
    const incompleteEligibility = ["WITHDRAWN","TRANSFERRED","SUSPENDED"].includes(enrollment.status) && !enrollment.effectiveTo;
    return {
      ...outcome, attendanceRate: incompleteEligibility ? null : outcome.attendanceRate,
      policyActiveFrom: policy.attendancePolicyActiveFrom,
      calendarRevision: term.calendarRevision,
      enrollmentStart: start, enrollmentEnd: end, asOf,
      approvedExclusions: exclusions.length,
      eligibilityWarning: incompleteEligibility ? "Missing effective withdrawal/transfer/suspension date; attendance rate requires verification." : null,
    };
  }
}
