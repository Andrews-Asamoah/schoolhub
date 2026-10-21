/**
 * Rules for entering and totalling marks. Pure functions, no database, so the
 * arithmetic that decides a pupil's grade can be tested directly.
 */

export interface TemplateScope {
  isActive: boolean;
  termNumber: number | null;
  subjectCode: string | null;
  classId: string | null;
  classIds: string[];
  classLevel: string | null;
  departmentId: string | null;
}

export interface TargetClass {
  id: string;
  level: string;
  departmentId: string | null;
}

/**
 * How specifically a template is meant for this class, subject and term, or
 * null if it does not apply. A template with no class/subject/term limits
 * applies to everything but is the least specific.
 */
export function templateSpecificity(
  template: TemplateScope,
  target: TargetClass,
  subjectCode: string,
  termNumber: number,
): number | null {
  if (!template.isActive) return null;
  if (template.termNumber != null && template.termNumber !== termNumber) return null;
  if (template.subjectCode && template.subjectCode.toLowerCase() !== subjectCode.toLowerCase()) return null;

  const limitsClass =
    template.classId != null || template.classIds.length > 0 || template.classLevel != null || template.departmentId != null;
  let score = 0;
  if (limitsClass) {
    if (template.classId === target.id || template.classIds.includes(target.id)) score += 8;
    else if (template.classLevel != null && template.classLevel === target.level) score += 4;
    else if (template.departmentId != null && template.departmentId === target.departmentId) score += 2;
    else return null;
  }
  if (template.subjectCode) score += 16;
  if (template.termNumber != null) score += 1;
  return score;
}

export interface EntryComponent {
  id: string;
  maxMarks: number;
  weight: number;
  isRequired: boolean;
  isRepeatable: boolean;
  expectedCount: number;
}

export interface MarkCell {
  componentId: string;
  occurrenceIndex: number;
  marks: number;
}

export interface GradeBand {
  grade: string;
  minScore: number;
  gradePoint: number;
}

export interface StudentResult {
  totalScore: number;
  percentage: number;
  /** Every required component has at least one mark. A grade is only given when true. */
  complete: boolean;
  grade: string | null;
  gradePoint: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * A component contributes (marks / max) x weight. A repeatable component (for
 * example three quizzes) contributes the average of the marks entered. The
 * percentage is out of the total weight, so unfinished work shows as a lower
 * percentage but gets no grade until every required component has a mark.
 */
export function computeStudentResult(
  components: EntryComponent[],
  cells: MarkCell[],
  bands: GradeBand[],
): StudentResult {
  let totalScore = 0;
  let totalWeight = 0;
  let complete = true;

  for (const component of components) {
    totalWeight += component.weight;
    const own = cells.filter((cell) => cell.componentId === component.id);
    if (own.length === 0) {
      if (component.isRequired) complete = false;
      continue;
    }
    const average = own.reduce((sum, cell) => sum + cell.marks / component.maxMarks, 0) / own.length;
    totalScore += average * component.weight;
  }

  const percentage = totalWeight > 0 ? round2((totalScore / totalWeight) * 100) : 0;
  let grade: string | null = null;
  let gradePoint: number | null = null;
  if (complete) {
    // Highest band whose minimum the percentage reaches, so gaps such as 79.5 still land somewhere.
    const band = [...bands].sort((a, b) => b.minScore - a.minScore).find((item) => percentage >= item.minScore);
    if (band) {
      grade = band.grade;
      gradePoint = band.gradePoint;
    }
  }
  return { totalScore: round2(totalScore), percentage, complete, grade, gradePoint };
}

/** Standard competition ranking (1, 2, 2, 4) among rows that have a percentage. */
export function rankByPercentage<T extends string>(rows: { id: T; percentage: number | null }[]): Map<T, number> {
  const ranked = rows
    .filter((row): row is { id: T; percentage: number } => row.percentage != null)
    .sort((a, b) => b.percentage - a.percentage);
  const positions = new Map<T, number>();
  ranked.forEach((row, index) => {
    const previous = ranked[index - 1];
    positions.set(row.id, previous && previous.percentage === row.percentage ? positions.get(previous.id)! : index + 1);
  });
  return positions;
}

export interface MarkProblem {
  componentId: string;
  studentId: string;
  message: string;
}

/** Checks entered marks against each component's limits. */
export function validateMarks(
  entries: { studentId: string; componentId: string; occurrenceIndex: number; marks: number | null }[],
  components: EntryComponent[],
): MarkProblem[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const problems: MarkProblem[] = [];
  for (const entry of entries) {
    const base = { componentId: entry.componentId, studentId: entry.studentId };
    const component = byId.get(entry.componentId);
    if (!component) {
      problems.push({ ...base, message: "This component does not belong to the chosen assessment." });
      continue;
    }
    const slots = component.isRepeatable ? Math.max(component.expectedCount, 1) : 1;
    if (!Number.isInteger(entry.occurrenceIndex) || entry.occurrenceIndex < 0 || entry.occurrenceIndex >= slots) {
      problems.push({ ...base, message: "This entry does not exist for the component." });
      continue;
    }
    if (entry.marks == null) continue; // clearing a mark is always allowed
    if (!Number.isFinite(entry.marks) || entry.marks < 0 || entry.marks > component.maxMarks) {
      problems.push({ ...base, message: `Marks must be between 0 and ${component.maxMarks}.` });
    }
  }
  return problems;
}
