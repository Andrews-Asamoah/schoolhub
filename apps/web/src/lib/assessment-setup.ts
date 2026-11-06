import type { AssessmentTypeName, SaveAssessmentTemplateInput } from "@schoolhub/shared";

export interface SetupComponent {
  id: string;
  name: string;
  componentType: AssessmentTypeName;
  maxMarks: number;
  weight: number;
  isRequired: boolean;
  isRepeatable: boolean;
  expectedCount: number;
  subjectStrandId: string | null;
  subjectStrandName: string | null;
}
export interface SetupTemplate {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isLocked: boolean;
  deadline: string | null;
  termNumber: number | null;
  subjectCode: string | null;
  gradingSystem: { id: string; name: string };
  allClasses: boolean;
  classIds: string[];
  marksRecorded: number;
  components: SetupComponent[];
}
export interface SetupBand {
  grade: string;
  description: string;
  minScore: number;
  maxScore: number;
  gradePoint: number;
}
/** SCORE_BANDS grades a percentage; CLASS_RANK grades a pupil's position within their own class. */
export type GradingMethod = "SCORE_BANDS" | "CLASS_RANK";

export interface SetupGradingSystem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  method: GradingMethod;
  /** A shared default: usable by every school, not editable here. */
  shared: boolean;
  usedBy: number;
  hasMarks: boolean;
  scales: SetupBand[];
}
export interface AssessmentSetup {
  term: { id: string; name: string; termNumber: number } | null;
  classes: { id: string; name: string; level: string }[];
  subjects: { id: string; code: string; name: string; strands: { id: string; name: string; code: string | null; sortOrder: number }[] }[];
  templates: SetupTemplate[];
  gradingSystems: SetupGradingSystem[];
  uncovered: { classId: string; className: string; subjectId: string; subjectName: string }[];
}

/**
 * How a band reads on screen. Score bands show their percentage range. Class-ranked
 * bands hold cumulative class shares, so they read as the BECE does: Top 4%, Next 7%, ... Bottom 4%.
 */
export function bandRangeLabel(method: GradingMethod, band: Pick<SetupBand, "minScore" | "maxScore">, index: number, count: number): string {
  if (method === "SCORE_BANDS") return `${band.minScore}–${band.maxScore}`;
  const share = Math.round((band.maxScore - band.minScore) * 100) / 100;
  if (index === 0) return `Top ${share}%`;
  return index === count - 1 ? `Bottom ${share}%` : `Next ${share}%`;
}

/** A familiar six-grade scale, offered as a starting point. */
export const STANDARD_BANDS: SetupBand[] = [
  { grade: "A", description: "Excellent", minScore: 80, maxScore: 100, gradePoint: 4 },
  { grade: "B", description: "Very good", minScore: 70, maxScore: 79, gradePoint: 3 },
  { grade: "C", description: "Good", minScore: 60, maxScore: 69, gradePoint: 2 },
  { grade: "D", description: "Satisfactory", minScore: 50, maxScore: 59, gradePoint: 1 },
  { grade: "E", description: "Weak", minScore: 40, maxScore: 49, gradePoint: 0.5 },
  { grade: "F", description: "Fail", minScore: 0, maxScore: 39, gradePoint: 0 },
];

/** Class assessment out of 30 plus an end-of-term exam out of 70. */
export const STANDARD_COMPONENTS: Omit<SetupComponent, "id">[] = [
  { name: "Class assessment", componentType: "CLASS_TEST", maxMarks: 30, weight: 30, isRequired: true, isRepeatable: false, expectedCount: 1, subjectStrandId: null, subjectStrandName: null },
  { name: "End-of-term exam", componentType: "FINAL_EXAM", maxMarks: 70, weight: 70, isRequired: true, isRepeatable: false, expectedCount: 1, subjectStrandId: null, subjectStrandName: null },
];

/** The save payload for an existing assessment, so a quick change (on/off, lock) keeps everything else. */
export function templateToInput(template: SetupTemplate, changes: Partial<SaveAssessmentTemplateInput> = {}): SaveAssessmentTemplateInput {
  return {
    name: template.name,
    description: template.description,
    gradingSystemId: template.gradingSystem.id,
    classIds: template.allClasses ? [] : template.classIds,
    subjectCode: template.subjectCode,
    termNumber: template.termNumber,
    deadline: template.deadline ? template.deadline.slice(0, 10) : null,
    isActive: template.isActive,
    isLocked: template.isLocked,
    components: template.components.map(({ subjectStrandId, subjectStrandName: _subjectStrandName, ...component }) => ({
      ...component,
      ...(subjectStrandId ? { subjectStrandId } : {}),
    })),
    ...changes,
  };
}

export const setupKey = ["assessments", "setup"] as const;
