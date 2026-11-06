import { TIMETABLE_DAYS, type TimetableDay } from '@schoolhub/shared';

/** Pure parsing rules for the timetable spreadsheet import, kept free of database access so they are easy to test. */

export const ENTRY_TYPES = ['LESSON', 'BREAK', 'ACTIVITY'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

/** Lower-cases and drops everything except letters and digits, so "JHS 1-A" matches "jhs1a". */
export const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Accepts MONDAY, Monday, Mon, Tues, Thurs … (at least three letters). */
export function parseDay(value: string): TimetableDay | null {
  const text = value.trim().toLowerCase().replace(/\.$/, '');
  if (text.length < 3) return null;
  return TIMETABLE_DAYS.find((day) => day.toLowerCase().startsWith(text)) ?? null;
}

/** Accepts 8:00, 08:00, 8.00, 0800 and 08:00:00 and returns 24-hour HH:MM, or null. */
export function parseClock(value: string): string | null {
  const match = /^(\d{1,2})[:.h]?(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Blank means LESSON. Anything else must be one of the three entry types. */
export function parseEntryType(value: string): EntryType | null {
  const text = value.trim().toUpperCase();
  if (!text) return 'LESSON';
  return (ENTRY_TYPES as readonly string[]).includes(text) ? (text as EntryType) : null;
}

/** Finds a period by its name first, then by its start time. */
export function findPeriod<P extends { name: string; startTime: string }>(periods: readonly P[], value: string): P | null {
  const key = normalizeKey(value);
  if (!key) return null;
  const byName = periods.filter((period) => normalizeKey(period.name) === key);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) return null;
  const clock = parseClock(value);
  return clock ? periods.find((period) => period.startTime === clock) ?? null : null;
}
