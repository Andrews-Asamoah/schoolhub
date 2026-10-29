import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { AttendanceCalendarService } from "./attendance-calendar.service.js";
import { classRegisterGaps } from "./attendance-review.js";
import { dateString, eligibleInstructionalDates } from "./attendance-calendar.js";

/** Read-only register completeness diagnostics. Never creates ABSENT marks. */
@Injectable()
export class AttendanceReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherScope: TeacherScopeService,
    private readonly calendar: AttendanceCalendarService,
  ) {}

  async classGaps(schoolId: string, classId: string, role: string | undefined, userId: string) {
    if (role === "teacher") {
      const allowed = await this.teacherScope.getTaughtClassIds(schoolId, userId);
      if (!allowed.includes(classId)) throw new ForbiddenException("You do not teach this class.");
    }
    const year = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true, terms: { where: { isCurrent: true },
        take: 1, select: { id: true, name: true, startDate: true, endDate: true,
          instructionalWeekdays: true, calendarRevision: true } } },
    });
    const term = year?.terms[0];
    if (!year || !term) throw new NotFoundException("No current academic term has been configured.");
    const schoolClass = await this.prisma.client.class.findFirst({
      where: { id: classId, schoolId, deletedAt: null, OR: [
        { academicYearId: year.id }, { academicYearId: null },
      ] }, select: { id: true, name: true },
    });
    if (!schoolClass) throw new NotFoundException("Class not found in the current school and year.");
    const [policy, calendar, enrollments] = await Promise.all([
      this.calendar.getPolicy(schoolId),
      this.prisma.client.academicCalendarDay.findMany({
        where: { schoolId, termId: term.id }, select: { date: true, isInstructional: true },
      }),
      this.prisma.client.enrollment.findMany({
        where: { classId, academicYearId: year.id, termId: term.id,
          status: "ACTIVE", student: { schoolId, deletedAt: null } },
        select: { studentId: true, effectiveFrom: true, effectiveTo: true,
          student: { select: { admissionDate: true } } },
      }),
    ]);
    const asOf = dateString(new Date());
    const termStart = dateString(term.startDate);
    const termEnd = dateString(term.endDate);
    const dates = eligibleInstructionalDates({
      start: termStart, end: termEnd, asOf,
      weekdays: term.instructionalWeekdays,
      overrides: calendar.map(row => ({
        date: dateString(row.date), isInstructional: row.isInstructional,
      })),
    });
    const studentIds = enrollments.map(row => row.studentId);
    const [marked, exclusions] = studentIds.length ? await Promise.all([
      this.prisma.client.attendance.findMany({
        where: { studentId: { in: studentIds },
          date: { gte: term.startDate, lte: term.endDate } },
        select: { studentId: true, date: true },
      }),
      this.prisma.client.studentAttendanceExclusion.findMany({
        where: { schoolId, termId: term.id, studentId: { in: studentIds } },
        select: { studentId: true, date: true },
      }),
    ]) : [[], []];
    const summary = classRegisterGaps({
      dates,
      enrollments: enrollments.map(row => ({
        studentId: row.studentId,
        start: [termStart, dateString(row.student.admissionDate),
          ...(row.effectiveFrom ? [dateString(row.effectiveFrom)] : [])].sort().at(-1)!,
        end: [termEnd, ...(row.effectiveTo ? [dateString(row.effectiveTo)] : [])].sort()[0]!,
      })),
      marks: marked.map(row => ({ studentId: row.studentId, date: dateString(row.date) })),
      exclusions: exclusions.map(row => ({ studentId: row.studentId, date: dateString(row.date) })),
    });
    const activation = policy.attendancePolicyActiveFrom;
    return {
      class: schoolClass,
      academicYear: { id: year.id, name: year.name },
      term: { id: term.id, name: term.name, startDate: termStart,
        endDate: termEnd, calendarRevision: term.calendarRevision },
      policyMode: !activation || activation > asOf ? "PREVIEW" as const : "ACTIVE" as const,
      policyActiveFrom: activation,
      ...summary,
      // Diagnostic days before activation do not change published or live percentages.
      days: summary.days.map(day => ({
        ...day, historical: !activation || day.date < activation,
      })),
    };
  }
}
