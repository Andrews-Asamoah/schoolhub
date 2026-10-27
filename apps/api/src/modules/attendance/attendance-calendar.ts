export type AttendanceMark = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "SICK" | "PERMISSION";
export type CalendarOverride = { date: string; isInstructional: boolean };
export type DailyMark = { date: string; status: AttendanceMark };
export const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5] as const;

/** No local timezone arithmetic: Postgres DATE is interpreted as an ISO calendar date. */
export function isoDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid ISO date");
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date");
  return date.getTime();
}

export function dateString(value: Date): string { return value.toISOString().slice(0, 10); }
export function isoWeekday(value: string): number { return ((new Date(isoDay(value)).getUTCDay() + 6) % 7) + 1; }

export function requireWeekdays(input: readonly number[]): number[] {
  if (!Array.isArray(input) || !input.length || input.length > 7
    || input.some(day => !Number.isInteger(day) || day < 1 || day > 7)
    || new Set(input).size !== input.length) throw new Error("Select unique instructional weekdays (1=Monday to 7=Sunday).");
  return [...input].sort((a, b) => a - b);
}

/** Returns the eligible instructional dates, never guesses missing registers. */
export function eligibleInstructionalDates(input: {
  start: string; end: string; asOf: string; weekdays: readonly number[];
  overrides?: readonly CalendarOverride[]; excludedDates?: readonly string[];
}): string[] {
  const start = isoDay(input.start);
  const end = Math.min(isoDay(input.end), isoDay(input.asOf));
  const weekdays = new Set(requireWeekdays(input.weekdays));
  const overrides = new Map<string, boolean>();
  for (const row of input.overrides ?? []) {
    isoDay(row.date);
    if (overrides.has(row.date)) throw new Error("Duplicate calendar override");
    overrides.set(row.date, row.isInstructional);
  }
  const exclusions = new Set((input.excludedDates ?? []).map(date => { isoDay(date); return date; }));
  if (end < start) return [];
  if ((end - start) / 86400000 > 500) throw new Error("Attendance calculation exceeds 500 days");
  const dates: string[] = [];
  for (let day = start; day <= end; day += 86400000) {
    const date = new Date(day).toISOString().slice(0, 10);
    const instructional = overrides.get(date) ?? weekdays.has(isoWeekday(date));
    if (instructional && !exclusions.has(date)) dates.push(date);
  }
  return dates;
}

/** Only the post-activation instructional dates require complete registers.
 * Earlier attendance marks keep the old recorded-days basis in an activation term.
 * A date-boundary transition does not fabricate historical attendance or absences. */
export function calculateAttendanceRollout(input: {
  start: string; end: string; asOf: string; weekdays: readonly number[];
  overrides?: readonly CalendarOverride[]; excludedDates?: readonly string[];
  records: readonly DailyMark[]; activeFrom: string;
}) {
  isoDay(input.activeFrom);
  const postStart = input.start > input.activeFrom ? input.start : input.activeFrom;
  const before = input.records.filter(row =>
    row.date >= input.start && row.date < input.activeFrom &&
    row.date <= input.end && row.date <= input.asOf);
  const historical = new Map<string, AttendanceMark>();
  for (const row of before) {
    isoDay(row.date);
    if (historical.has(row.date)) throw new Error("Duplicate historical attendance entry");
    historical.set(row.date, row.status);
  }
  const post = calculateDailyAttendance({
    ...input, start: postStart,
    records: input.records.filter(row => row.date >= input.activeFrom),
  });
  const summary = { ...post.summary };
  for (const status of historical.values()) summary[status]++;
  const historicalDays = historical.size;
  const possibleDays = historicalDays + post.possibleDays;
  const recordedDays = historicalDays + post.recordedDays;
  const daysAttended = summary.PRESENT + summary.LATE;
  const complete = post.unmarkedDays === 0 && possibleDays > 0;
  return {
    ...post, summary, totalDays: possibleDays, possibleDays, recordedDays,
    daysAttended, unmarkedDays: post.unmarkedDays,
    attendanceRate: complete ? Math.round((daysAttended / possibleDays)*100) : null,
    provisionalRate: recordedDays ? Math.round((daysAttended / recordedDays)*100) : null,
    coverageRate: possibleDays ? Math.round((recordedDays / possibleDays)*100) : null,
    isComplete: complete,
    policyMode: historicalDays ? "TRANSITION" as const : "CALENDAR" as const,
    historicalRecordedDays: historicalDays,
  };
}

export function calculateDailyAttendance(input: {
  start: string; end: string; asOf: string; weekdays: readonly number[];
  overrides?: readonly CalendarOverride[]; excludedDates?: readonly string[];
  records: readonly DailyMark[];
}) {
  const dates = eligibleInstructionalDates(input);
  const eligible = new Set(dates);
  const records = new Map<string, AttendanceMark>();
  let ignoredRecords = 0;
  for (const entry of input.records) {
    isoDay(entry.date);
    if (records.has(entry.date)) throw new Error("Duplicate attendance entry");
    records.set(entry.date, entry.status);
    if (!eligible.has(entry.date)) ignoredRecords++;
  }
  const summary: Record<AttendanceMark, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, SICK: 0, PERMISSION: 0 };
  const missingDates: string[] = [];
  for (const date of dates) {
    const status = records.get(date);
    if (!status) missingDates.push(date);
    else summary[status]++;
  }
  const possibleDays = dates.length;
  const recordedDays = possibleDays - missingDates.length;
  const daysAttended = summary.PRESENT + summary.LATE;
  return {
    summary, possibleDays, totalDays: possibleDays, recordedDays,
    daysAttended, unmarkedDays: missingDates.length,
    provisionalRate: recordedDays ? Math.round((daysAttended / recordedDays)*100) : null,
    missingDates, ignoredRecords,
    attendanceRate: possibleDays > 0 && missingDates.length === 0
      ? Math.round((daysAttended / possibleDays) * 100) : null,
    coverageRate: possibleDays > 0 ? Math.round((recordedDays / possibleDays) * 100) : null,
    isComplete: missingDates.length === 0 && possibleDays > 0,
  };
}
