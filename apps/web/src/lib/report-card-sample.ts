import type { ReportDocApproval, ReportDocSubject, ReportDocumentProps } from "@/components/reports/report-card-document";

/**
 * Sample report card data for previewing a design. Fixed and deterministic, so
 * a design always previews the same way and the data can never be mistaken for
 * a real pupil's record. Shapes match what published reports carry.
 */
export interface SampleReport {
  pupil: { name: string; admissionNumber: string; className: string };
  setName: string;
  academicYear: string;
  term: string;
  subjects: ReportDocSubject[];
  summary: NonNullable<ReportDocumentProps["summary"]>;
  attendance: NonNullable<ReportDocumentProps["attendance"]>;
  approval: ReportDocApproval;
}

/** [name, max marks, weight, counts as exam]. Class score weights add to 50, the exam is 50. */
const COMPONENTS = [
  ["Class tests", 30, 20, false],
  ["Group work", 20, 15, false],
  ["Project work", 20, 15, false],
  ["End-of-term exam", 100, 50, true],
] as const;

/** Share of each component's marks earned, per subject: [tests, group, project, exam]. */
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

/** Ghana's 1–9 school grading with a remark for each grade, used only to make the sample look realistic. */
const GRADES = [
  { min: 80, grade: "1", remark: "Highly proficient" },
  { min: 70, grade: "2", remark: "Proficient" },
  { min: 65, grade: "3", remark: "Approaching proficiency" },
  { min: 60, grade: "4", remark: "Developing proficiency" },
  { min: 55, grade: "5", remark: "Developing" },
  { min: 50, grade: "6", remark: "Needs improvement" },
  { min: 45, grade: "7", remark: "Needs improvement" },
  { min: 35, grade: "8", remark: "Beginning" },
  { min: 0, grade: "9", remark: "Beginning" },
] as const;

const round1 = (value: number) => Math.round(value * 10) / 10;

export function sampleGrade(percentage: number): { grade: string; remark: string } {
  const band = GRADES.find((item) => percentage >= item.min)!;
  return { grade: band.grade, remark: band.remark };
}

/** A hand-drawn style squiggle standing in for a signature. */
const SIGNATURE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 56"><path d="M6 38 C 20 6, 34 50, 48 26 S 70 8, 78 34 S 98 44, 112 20 S 140 14, 150 30 L 174 22" fill="none" stroke="#1e3a8a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 48 L 160 42" fill="none" stroke="#1e3a8a" stroke-width="2" stroke-linecap="round"/></svg>',
)}`;

/** A sample report for a design; primary designs get a shorter, simpler subject list. */
export function buildSampleReport(layoutType?: string): SampleReport {
  const primary = layoutType === "primary";
  const subjects = SUBJECTS.filter((row) => !primary || PRIMARY_SUBJECTS.has(row.code)).map((row, index): ReportDocSubject => {
    const cells = COMPONENTS.map(([name, maxMarks, weight, isExam], slot) => {
      const marksObtained = round1(maxMarks * row.earned[slot]!);
      return { name, marksObtained, maxMarks, percentage: round1((marksObtained / maxMarks) * 100), weight, isExam, contribution: (marksObtained / maxMarks) * weight };
    });
    const classScore = round1(cells.filter((cell) => !cell.isExam).reduce((sum, cell) => sum + cell.contribution, 0));
    const examScore = round1(cells.filter((cell) => cell.isExam).reduce((sum, cell) => sum + cell.contribution, 0));
    const total = round1(classScore + examScore);
    const { grade, remark } = sampleGrade(total);
    return {
      subject: { id: `sample-${index}`, name: row.name, code: row.code },
      totalScore: total,
      percentage: total,
      grade,
      position: row.position,
      classScore,
      classWeight: 50,
      examScore,
      examWeight: 50,
      totalWeight: 100,
      gradeRemark: remark,
      components: cells.map(({ name, marksObtained, maxMarks, percentage, weight }) => ({ name, marksObtained, maxMarks, percentage, weight })),
    };
  });
  return {
    pupil: { name: "Ama Serwaa Mensah", admissionNumber: "SAMPLE-0001", className: primary ? "Primary 4B" : "JHS 2A" },
    setName: "End of Term 2 Report",
    academicYear: "2026/2027",
    term: "Term 2",
    subjects,
    summary: { average: round1(subjects.reduce((sum, row) => sum + row.percentage, 0) / subjects.length), subjectsGraded: subjects.length, overallPosition: 3, classSize: 38 },
    attendance: { present: 52, total: 56, rate: 93 },
    approval: {
      teacher: { name: "Class Teacher", remark: "Ama works steadily and takes part well in class. With more practice in her weaker subjects she can improve further next term.", signature: SIGNATURE },
      head: { name: "Headteacher", remark: "A pleasing report. Keep up the good effort and discipline.", signature: SIGNATURE },
    },
  };
}
