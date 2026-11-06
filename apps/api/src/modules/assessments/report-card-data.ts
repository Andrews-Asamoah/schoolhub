import { rankByPercentage } from "./assessment-entry.js";

/**
 * Builds the numbers a report card shows. Pure functions, so every rule (what
 * counts as the exam, how the class score adds up, who is ranked, what
 * attendance means) is tested without a database.
 */

/** Component types that make up the exam. Everything else the school sets counts as class score. */
export const EXAM_COMPONENT_TYPES: readonly string[] = ["FINAL_EXAM"];

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface ReportComponent {
  id: string;
  componentType: string;
  maxMarks: number;
  weight: number;
}

export interface ReportCell {
  componentId: string;
  marksObtained: number;
}

export interface ScoreSplit {
  /** Weighted marks from everything except the exam. */
  classScore: number;
  /** What the class score is out of: the weights the school gave those components. */
  classWeight: number;
  examScore: number;
  examWeight: number;
  /** classScore + examScore. */
  totalScore: number;
  totalWeight: number;
}

/**
 * A component contributes (marks / max) x weight, and a repeatable component
 * (three class tests, say) contributes the average of its marks, exactly as
 * marks entry does. The class score adds up every non-exam component; the
 * total is the class score plus the exam score.
 */
export function splitScore(components: readonly ReportComponent[], cells: readonly ReportCell[]): ScoreSplit {
  let classScore = 0;
  let classWeight = 0;
  let examScore = 0;
  let examWeight = 0;
  for (const component of components) {
    const isExam = EXAM_COMPONENT_TYPES.includes(component.componentType);
    if (isExam) examWeight += component.weight;
    else classWeight += component.weight;
    const own = cells.filter((cell) => cell.componentId === component.id);
    if (own.length === 0 || component.maxMarks <= 0) continue;
    const contribution = (own.reduce((sum, cell) => sum + cell.marksObtained / component.maxMarks, 0) / own.length) * component.weight;
    if (isExam) examScore += contribution;
    else classScore += contribution;
  }
  return {
    classScore: round2(classScore),
    classWeight: round2(classWeight),
    examScore: round2(examScore),
    examWeight: round2(examWeight),
    totalScore: round2(classScore + examScore),
    totalWeight: round2(classWeight + examWeight),
  };
}

/** The school's own wording for a grade (the grading scale's description), or null. */
export function gradeRemark(grade: string | null, scales: readonly { grade: string; description: string }[]): string | null {
  if (!grade) return null;
  return scales.find((scale) => scale.grade === grade)?.description?.trim() || null;
}

/**
 * Overall class position: pupils ranked by their average subject percentage,
 * with equal averages sharing a position. Only pupils in the batch are ranked.
 */
export function overallPositions(
  pupils: readonly { id: string; classId: string; subjectPercentages: readonly number[] }[],
): Map<string, number> {
  const result = new Map<string, number>();
  const byClass = new Map<string, { id: string; percentage: number | null }[]>();
  for (const pupil of pupils) {
    const average = pupil.subjectPercentages.length
      ? round2(pupil.subjectPercentages.reduce((sum, value) => sum + value, 0) / pupil.subjectPercentages.length)
      : null;
    byClass.set(pupil.classId, [...(byClass.get(pupil.classId) ?? []), { id: pupil.id, percentage: average }]);
  }
  for (const rows of byClass.values()) for (const [id, position] of rankByPercentage(rows)) result.set(id, position);
  return result;
}

export interface AttendanceSummary {
  /** Days the pupil was present or late. */
  present: number;
  /** Days the register was taken for the pupil this term. */
  total: number;
  /** Whole percentage, or null when no register was taken. */
  rate: number | null;
}

const ATTENDED = new Set(["PRESENT", "LATE"]);

/** Attendance for the term from the register: present or late counts as attended. */
export function summariseAttendance(statuses: readonly string[]): AttendanceSummary | null {
  if (statuses.length === 0) return null;
  const present = statuses.filter((status) => ATTENDED.has(status)).length;
  return { present, total: statuses.length, rate: Math.round((present / statuses.length) * 100) };
}

export interface ScoreRow {
  subject: { id: string; name: string; code: string };
  totalScore: number;
  percentage: number;
  grade: string | null;
  position: number | null;
  remarks: string | null;
  template: { components: ReportComponent[]; gradeScales: { grade: string; description: string }[] };
  cells: { componentId: string; componentName: string; weight: number; marksObtained: number; maxMarks: number; percentage: number }[];
}

/** One subject line of a report: the stored result plus the class/exam split and the grade's remark. */
export function buildSubjectRow(row: ScoreRow) {
  const split = splitScore(row.template.components, row.cells);
  return {
    subject: row.subject,
    totalScore: row.totalScore,
    percentage: row.percentage,
    grade: row.grade,
    position: row.position,
    remarks: row.remarks,
    classScore: split.classScore,
    classWeight: split.classWeight,
    examScore: split.examScore,
    examWeight: split.examWeight,
    totalWeight: split.totalWeight,
    gradeRemark: gradeRemark(row.grade, row.template.gradeScales),
    components: row.cells.map((cell) => ({
      name: cell.componentName,
      marksObtained: cell.marksObtained,
      maxMarks: cell.maxMarks,
      percentage: cell.percentage,
      weight: cell.weight,
    })),
  };
}

export type ReportSubjectRow = ReturnType<typeof buildSubjectRow>;

/** The pupil-level figures shown at the top of a report. */
export function buildSummary(subjects: readonly ReportSubjectRow[], position: number | null, classSize: number) {
  const average = subjects.length ? round2(subjects.reduce((sum, row) => sum + row.percentage, 0) / subjects.length) : null;
  return { average, subjectsGraded: subjects.length, overallPosition: position, classSize };
}
