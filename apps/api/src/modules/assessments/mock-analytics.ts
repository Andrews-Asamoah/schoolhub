import { rankByPercentage } from "./assessment-entry.js";

/** Level bands used to label how a pupil is doing on the latest mock (average percentage). */
export const MOCK_STATUS_THRESHOLDS = { onTrack: 50, watch: 40 } as const;
/** A move of at least this many percentage points between two mocks counts as a real trend. */
export const MOCK_TREND_DELTA = 5;

export type MockStatus = "ON_TRACK" | "WATCH" | "AT_RISK";
export type MockTrend = "IMPROVING" | "STEADY" | "DECLINING" | "NEW";

export interface MockInfo { id: string; name: string; sequence: number | null; yearName: string }
export interface MockStudentInfo { id: string; name: string; admissionNumber: string }
export interface MockScoreRow {
  studentId: string; templateId: string; subjectId: string; subjectName: string;
  percentage: number; grade: string | null; gradePoint: number | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function statusFor(average: number | null): MockStatus | null {
  if (average == null) return null;
  if (average >= MOCK_STATUS_THRESHOLDS.onTrack) return "ON_TRACK";
  if (average >= MOCK_STATUS_THRESHOLDS.watch) return "WATCH";
  return "AT_RISK";
}

export function trendFor(averages: number[]): { change: number | null; trend: MockTrend } {
  if (averages.length < 2) return { change: null, trend: "NEW" };
  const change = round1(averages[averages.length - 1]! - averages[averages.length - 2]!);
  return { change, trend: change >= MOCK_TREND_DELTA ? "IMPROVING" : change <= -MOCK_TREND_DELTA ? "DECLINING" : "STEADY" };
}

/**
 * Turns raw mock scores into everything the analysis page charts. `mocks` must already be in
 * sitting order. A pupil who did not sit a mock simply has no point for it (never a zero).
 */
export function buildMockAnalytics(mocks: MockInfo[], students: MockStudentInfo[], scores: MockScoreRow[]) {
  const mockIds = mocks.map((mock) => mock.id);
  const byMock = new Map(mockIds.map((id) => [id, scores.filter((row) => row.templateId === id)]));

  // Pupil average per mock, then class position among the pupils who sat it.
  const averageByStudentMock = new Map<string, number>();
  const positionByStudentMock = new Map<string, number>();
  for (const mockId of mockIds) {
    const perStudent = new Map<string, number[]>();
    for (const row of byMock.get(mockId)!) perStudent.set(row.studentId, [...(perStudent.get(row.studentId) ?? []), row.percentage]);
    const rows = [...perStudent].map(([id, values]) => ({ id, percentage: mean(values) }));
    rows.forEach((row) => averageByStudentMock.set(`${row.id}:${mockId}`, row.percentage!));
    for (const [id, position] of rankByPercentage(rows)) positionByStudentMock.set(`${id}:${mockId}`, position);
  }

  const subjectIds = [...new Map(scores.map((row) => [row.subjectId, row.subjectName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const mockSummaries = mocks.map((mock) => {
    const averages = students.map((s) => averageByStudentMock.get(`${s.id}:${mock.id}`)).filter((v): v is number => v != null);
    return {
      ...mock,
      sat: averages.length,
      classAverage: averages.length ? round1(mean(averages)!) : null,
      highest: averages.length ? round1(Math.max(...averages)) : null,
      lowest: averages.length ? round1(Math.min(...averages)) : null,
      atRisk: averages.filter((v) => statusFor(v) === "AT_RISK").length,
    };
  });

  const subjects = subjectIds.map(([subjectId, name]) => {
    let previous: number | null = null;
    const points = mockIds.map((mockId) => {
      const rows = byMock.get(mockId)!.filter((row) => row.subjectId === subjectId);
      const average = rows.length ? round1(mean(rows.map((row) => row.percentage))!) : null;
      const delta = average != null && previous != null ? round1(average - previous) : null;
      if (average != null) previous = average;
      return { mockId, average, sat: rows.length, delta };
    });
    return { subjectId, name, points };
  });

  const gradeKey = new Map<string, number>();
  for (const row of scores) if (row.grade) gradeKey.set(row.grade, row.gradePoint ?? Number.MAX_SAFE_INTEGER);
  const grades = [...gradeKey].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], undefined, { numeric: true })).map(([grade]) => grade);
  const gradeDistribution = mockIds.map((mockId) => {
    const counts: Record<string, number> = {};
    for (const row of byMock.get(mockId)!) if (row.grade) counts[row.grade] = (counts[row.grade] ?? 0) + 1;
    return { mockId, counts };
  });

  const studentRows = students.map((student) => {
    const series = mockIds.map((mockId) => {
      const key = `${student.id}:${mockId}`;
      return {
        mockId,
        average: averageByStudentMock.has(key) ? round1(averageByStudentMock.get(key)!) : null,
        position: positionByStudentMock.get(key) ?? null,
        subjects: byMock.get(mockId)!.filter((row) => row.studentId === student.id)
          .map((row) => ({ subjectId: row.subjectId, percentage: round1(row.percentage), grade: row.grade })),
      };
    });
    const sat = series.filter((point) => point.average != null);
    const latest = sat.length ? sat[sat.length - 1]!.average : null;
    return {
      ...student,
      series,
      latestAverage: latest,
      mocksSat: sat.length,
      status: statusFor(latest),
      ...trendFor(sat.map((point) => point.average as number)),
    };
  });

  return { mocks: mockSummaries, subjects, grades, gradeDistribution, students: studentRows, thresholds: { ...MOCK_STATUS_THRESHOLDS, trendDelta: MOCK_TREND_DELTA } };
}
