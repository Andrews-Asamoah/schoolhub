/**
 * Sample report card data for previewing a design. Fixed and deterministic, so
 * a design always previews the same way and the data can never be mistaken for
 * a real pupil's record. Shapes match what published reports carry.
 */
export interface SampleComponent { name: string; marksObtained: number; maxMarks: number; percentage: number; weight: number }
export interface SampleSubject {
  subject: { id: string; name: string; code: string };
  totalScore: number;
  percentage: number;
  grade: string | null;
  position: number | null;
  components: SampleComponent[];
}
export interface SampleReport {
  pupil: { firstName: string; lastName: string; admissionNumber: string; className: string };
  setName: string;
  academicYear: string;
  term: string;
  subjects: SampleSubject[];
  remarks: { type: string; content: string; teacher: string }[];
}

const COMPONENTS = [
  { name: "Class tests", max: 30, weight: 15 },
  { name: "Group work", max: 20, weight: 15 },
  { name: "Project work", max: 20, weight: 10 },
  { name: "End-of-term exam", max: 100, weight: 60 },
] as const;

/** Share of each component's marks earned, one row per subject: [tests, group, project, exam]. */
const SUBJECTS: { name: string; code: string; earned: [number, number, number, number]; position: number }[] = [
  { name: "English Language", code: "ENG", earned: [0.83, 0.85, 0.8, 0.78], position: 4 },
  { name: "Mathematics", code: "MTH", earned: [0.9, 0.95, 0.85, 0.88], position: 2 },
  { name: "Integrated Science", code: "SCI", earned: [0.8, 0.75, 0.9, 0.72], position: 6 },
  { name: "Social Studies", code: "SOC", earned: [0.7, 0.8, 0.75, 0.66], position: 9 },
  { name: "Religious & Moral Education", code: "RME", earned: [0.93, 0.9, 0.95, 0.84], position: 3 },
  { name: "Computing", code: "ICT", earned: [0.87, 0.9, 0.92, 0.81], position: 5 },
  { name: "Ghanaian Language", code: "GHL", earned: [0.6, 0.7, 0.65, 0.58], position: 12 },
  { name: "Creative Arts & Design", code: "CAD", earned: [0.77, 0.85, 0.9, 0.7], position: 7 },
  { name: "Career Technology", code: "CTE", earned: [0.55, 0.6, 0.7, 0.48], position: 15 },
];
const PRIMARY_SUBJECTS = new Set(["ENG", "MTH", "SCI", "SOC", "RME", "CAD"]);

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Ghana's 1–9 school grading, used only to make the sample look realistic. */
export function sampleGrade(percentage: number): string {
  const bands = [80, 70, 65, 60, 55, 50, 45, 35];
  const index = bands.findIndex((min) => percentage >= min);
  return String(index === -1 ? 9 : index + 1);
}

/** A sample report for a design; primary designs get a shorter, simpler subject list. */
export function buildSampleReport(layoutType?: string): SampleReport {
  const primary = layoutType === "primary";
  const subjects = SUBJECTS.filter((row) => !primary || PRIMARY_SUBJECTS.has(row.code)).map((row, index): SampleSubject => {
    const components = COMPONENTS.map((component, slot): SampleComponent => {
      const marksObtained = round1(component.max * row.earned[slot]!);
      return { name: component.name, marksObtained, maxMarks: component.max, percentage: round1((marksObtained / component.max) * 100), weight: component.weight };
    });
    const total = round1(components.reduce((sum, item) => sum + (item.marksObtained / item.maxMarks) * item.weight, 0));
    return {
      subject: { id: `sample-${index}`, name: row.name, code: row.code },
      totalScore: total,
      percentage: total,
      grade: sampleGrade(total),
      position: row.position,
      components,
    };
  });
  return {
    pupil: { firstName: "Ama Serwaa", lastName: "Mensah", admissionNumber: "SAMPLE-0001", className: primary ? "Primary 4B" : "JHS 2A" },
    setName: "End of Term 2 Report",
    academicYear: "2026/2027",
    term: "Term 2",
    subjects,
    remarks: [
      { type: "CLASS_TEACHER", content: "Ama works steadily and takes part well in class. With more practice in her weaker subjects she can improve further next term.", teacher: "Class teacher" },
      { type: "HEADTEACHER", content: "A pleasing report. Keep up the good effort and discipline.", teacher: "Headteacher" },
    ],
  };
}
