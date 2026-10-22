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
export interface SetupGradingSystem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  /** A shared default: usable by every school, not editable here. */
  shared: boolean;
  usedBy: number;
  hasMarks: boolean;
  scales: SetupBand[];
}
export interface AssessmentSetup {
  term: { id: string; name: string; termNumber: number } | null;
  classes: { id: string; name: string; level: string }[];
  subjects: { id: string; code: string; name: string }[];
  templates: SetupTemplate[];
  gradingSystems: SetupGradingSystem[];
  uncovered: { classId: string; className: string; subjectId: string; subjectName: string }[];
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
  { name: "Class assessment", componentType: "CLASS_TEST", maxMarks: 30, weight: 30, isRequired: true, isRepeatable: false, expectedCount: 1 },
  { name: "End-of-term exam", componentType: "FINAL_EXAM", maxMarks: 70, weight: 70, isRequired: true, isRepeatable: false, expectedCount: 1 },
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
    components: template.components,
    ...changes,
  };
}

export const setupKey = ["assessments", "setup"] as const;
