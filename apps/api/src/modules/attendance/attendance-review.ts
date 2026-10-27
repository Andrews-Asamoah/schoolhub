import { isoDay } from "./attendance-calendar.js";

export interface ReviewEnrollment {
  studentId: string;
  /** Eligible enrolment starts on the latest admission, term or effective start date. */
  start: string;
  end: string;
}

export interface ReviewMark { studentId: string; date: string }
export interface ReviewExclusion { studentId: string; date: string }

/** A day with no enrolment is not an unmarked register.
 * An explicitly excluded pupil is never counted in that date's denominator.
 * An absent pupil counts as marked only if an ABSENT mark was actually saved.
 */
export function classRegisterGaps(input: {
  dates: readonly string[];
  enrollments: readonly ReviewEnrollment[];
  marks: readonly ReviewMark[];
  exclusions: readonly ReviewExclusion[];
}) {
  const markKeys = new Set(input.marks.map(row => row.studentId + "|" + row.date));
  const exclusionKeys = new Set(input.exclusions.map(row => row.studentId + "|" + row.date));
  const seenDays = new Set<string>();
  const days: { date: string; expected: number; marked: number; missing: number; coverageRate: number }[] = [];
  let expectedMarks = 0;
  let recordedMarks = 0;
  for (const date of input.dates) {
    isoDay(date);
    if (seenDays.has(date)) throw new Error("Duplicate instructional calendar date");
    seenDays.add(date);
    let expected = 0;
    let marked = 0;
    for (const enrollment of input.enrollments) {
      if (date < enrollment.start || date > enrollment.end ||
        exclusionKeys.has(enrollment.studentId + "|" + date)) continue;
      expected++;
      if (markKeys.has(enrollment.studentId + "|" + date)) marked++;
    }
    if (!expected) continue;
    expectedMarks += expected;
    recordedMarks += marked;
    if (marked < expected) days.push({
      date, expected, marked, missing: expected - marked,
      coverageRate: Math.round(marked / expected * 100),
    });
  }
  return {
    days, incompleteDays: days.length,
    expectedMarks, recordedMarks, missingMarks: expectedMarks - recordedMarks,
    coverageRate: expectedMarks ? Math.round(recordedMarks / expectedMarks * 100) : null,
  };
}
