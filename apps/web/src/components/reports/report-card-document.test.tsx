import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSampleReport } from "@/lib/report-card-sample";
import { ReportCardDocument, type ReportDocLayout } from "./report-card-document";

function render(layout: ReportDocLayout = {}, overrides: Partial<Parameters<typeof ReportCardDocument>[0]> = {}) {
  const sample = buildSampleReport("jhs");
  return renderToStaticMarkup(
    <ReportCardDocument
      printClass="x" layout={layout} school={{ name: "Test School", code: "TST", logo: null, motto: null }}
      pupil={sample.pupil} setName={sample.setName} academicYear={sample.academicYear} term={sample.term} designName="Design"
      summary={sample.summary} attendance={sample.attendance} subjects={sample.subjects} approval={sample.approval} {...overrides}
    />,
  );
}
const headers = (html: string) => [...html.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ""));

describe("ReportCardDocument", () => {
  it("lays out Subject, Class Score, Total Score, Grade, Position, Remarks in that order", () => {
    expect(headers(render())).toEqual(["Subject", "Class Score (50%)", "Total Score (100%)", "Grade", "Position", "Remarks"]);
  });
  it("adds an Exam Score column only when the design asks for it", () => {
    expect(headers(render({ showExamScore: true }))).toEqual(["Subject", "Class Score (50%)", "Exam Score (50%)", "Total Score (100%)", "Grade", "Position", "Remarks"]);
  });
  it("shows the overall position with a raised suffix, class size and attendance at the top", () => {
    const html = render();
    expect(html).toContain("3<sup");
    expect(html).toContain(">rd</sup>");
    expect(html).toContain("38"); // class size
    expect(html).toContain("93%");
    expect(html).toContain("52 of 56 days");
  });
  it("shows each subject's grade remark from the grading scale", () => {
    expect(render()).toContain("Highly proficient");
  });
  it("hides every position when the design turns positions off", () => {
    const html = render({ showPosition: false });
    expect(headers(html)).not.toContain("Position");
    expect(html).not.toContain(">rd</sup>");
  });
  it("shows both remarks with their signatures and names", () => {
    const html = render();
    expect(html).toContain("Class teacher’s remarks");
    expect(html).toContain("Headteacher’s remarks");
    expect(html.match(/<img[^>]+alt="Signature of/g)?.length).toBe(2);
  });
  it("degrades gracefully for older reports without the new fields", () => {
    const old = buildSampleReport("jhs").subjects.map(({ classScore: _a, classWeight: _b, examScore: _c, examWeight: _d, totalWeight: _e, gradeRemark: _f, ...rest }) => ({ ...rest, remarks: "Satisfactory" }));
    const html = render({}, { subjects: old, summary: null, attendance: null, approval: null });
    expect(headers(html)).toEqual(["Subject", "Class Score", "Total Score (100%)", "Grade", "Position", "Remarks"]);
    expect(html).toContain("Satisfactory");
  });
  it("falls back to recorded remarks when no approval exists", () => {
    const html = render({}, { approval: null, legacyRemarks: [{ type: "CLASS_TEACHER", content: "Well done", teacher: "Mrs A" }] });
    expect(html).toContain("Well done");
    expect(html).not.toContain("Class teacher’s remarks");
  });
});
