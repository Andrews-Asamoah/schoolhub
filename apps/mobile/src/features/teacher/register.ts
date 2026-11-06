import type {
  AttendanceStatus,
  Register,
  RegisterCalendar,
} from "@/api/teacher";
import { batchAttendanceSchema } from "@schoolhub/shared";
export function calendarBlock(
  calendar: RegisterCalendar | undefined,
  date: string,
  today: string,
): string | null {
  if (!calendar) return "The school calendar must load before marking.";
  if (date > today) return "Future dates cannot be marked.";
  if (
    date < calendar.term.startDate.slice(0, 10) ||
    date > calendar.term.endDate.slice(0, 10)
  )
    return "Choose a date in the current term.";
  const override = calendar.days.find((d) => d.date.slice(0, 10) === date);
  const weekday = new Date(date + "T00:00:00Z").getUTCDay() || 7;
  if (!(override?.isInstructional ?? calendar.isoWeekdays.includes(weekday)))
    return (
      override?.label || "School closed: this is not an instructional day."
    );
  return null;
}
export type RegisterDraft = Record<string, AttendanceStatus>;
export function attendanceBatch(
  date: string,
  rows: Register,
  draft: RegisterDraft,
) {
  const records = rows
    .filter((r) => draft[r.studentId] !== undefined)
    .map((r) => ({
      studentId: r.studentId,
      status: draft[r.studentId],
      ...(r.attendance?.remarks ? { remarks: r.attendance.remarks } : {}),
    }));
  return batchAttendanceSchema.parse({ date, records });
}
export function registerStatus(row: Register[number], draft: RegisterDraft) {
  return draft[row.studentId] ?? row.attendance?.status ?? null;
}
