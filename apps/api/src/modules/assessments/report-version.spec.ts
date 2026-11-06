import { describe, expect, it } from "vitest";
import { canonicalJson, snapshotHash, academicReportPdf, type AcademicSnapshot } from "./report-version.js";
describe("immutable academic report sources", () => {
  it("computes stable hashes irrespective of object-key order", () => {
    expect(snapshotHash({ b:2,a:{d:3,c:4} })).toBe(snapshotHash({a:{c:4,d:3},b:2}));
    expect(snapshotHash({ report:{ subjects:[{grade:"A"}] } })).not.toBe(
      snapshotHash({ report:{ subjects:[{grade:"B"}] } }));
    expect(canonicalJson({z:1,a:2})).toBe('{"a":2,"z":1}');
  });
  it("generates a PDF with both distinct approval records, from the captured snapshot", () => {
    const snap: AcademicSnapshot = {
      schemaVersion:1,report:{ subjects:[{subject:{name:"Science",code:"SCI"},percentage:78,totalScore:78,grade:"B"}]},
      school:{name:"Synthetic School",code:"TST"},template:{name:"Terminal",layout:{}},
      student:{name:"Synthetic Student",admissionNumber:"TEST-001"},
      year:"2026/27",term:"Term 1",set:"Terminal Reports",capturedAt:"2026-10-27T12:00:00Z",
    };
    const pdf=academicReportPdf(snap,{version:1,snapshotHash:snapshotHash(snap),
      teacherName:"Teacher A",teacherRemark:"Good progress",teacherApprovedAt:new Date("2026-10-27T12:00:00Z"),
      headName:"Head B",headRemark:"Promising",headApprovedAt:new Date("2026-10-27T13:00:00Z"),
      publishedAt:new Date("2026-10-27T14:00:00Z")});
    expect(pdf.subarray(0,4).toString("utf8")).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(800);
  });

  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const richSnapshot = (): AcademicSnapshot => ({
    schemaVersion: 2,
    report: {
      student: { class: { id: "c1", name: "JHS 2A", level: "JHS" } },
      summary: { average: 74.5, subjectsGraded: 2, overallPosition: 3, classSize: 38 },
      attendance: { present: 52, total: 56, rate: 93 },
      subjects: [
        { subject: { name: "Mathematics", code: "MTH" }, totalScore: 82, percentage: 82, grade: "1", position: 2, classScore: 40, classWeight: 50, examScore: 42, examWeight: 50, totalWeight: 100, gradeRemark: "Highly proficient" },
        { subject: { name: "English Language", code: "ENG" }, totalScore: 67, percentage: 67, grade: "3", position: 11, classScore: 30, classWeight: 50, examScore: 37, examWeight: 50, totalWeight: 100, gradeRemark: "Proficient" },
      ],
    },
    school: { name: "Synthetic School", code: "TST" }, template: { name: "Terminal", layout: { accentColor: "#0f766e", showPosition: true } },
    student: { name: "Synthetic Student", admissionNumber: "TEST-001" },
    year: "2026/27", term: "Term 1", set: "Terminal Reports", capturedAt: "2026-10-27T12:00:00Z",
  });
  const approval = (extra = {}) => ({ version: 1, snapshotHash: "h", teacherName: "Teacher A", teacherRemark: "Good progress", teacherApprovedAt: new Date("2026-10-27T12:00:00Z"), headName: "Head B", headRemark: "Promising", headApprovedAt: new Date("2026-10-27T13:00:00Z"), publishedAt: new Date("2026-10-27T14:00:00Z"), ...extra });

  it("renders the new layout with signature images, and without them", () => {
    const signed = academicReportPdf(richSnapshot(), approval({ teacherSignature: PNG, headSignature: PNG }));
    const unsigned = academicReportPdf(richSnapshot(), approval());
    expect(signed.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(signed.byteLength).toBeGreaterThan(unsigned.byteLength); // the images are embedded
  });
  it("survives an unreadable signature and a pre-split (older) snapshot", () => {
    const old = richSnapshot();
    old.schemaVersion = 1;
    delete old.report.summary; delete old.report.attendance;
    old.report.subjects = [{ subject: { name: "Science", code: "SCI" }, totalScore: 78, percentage: 78, grade: "B" }];
    const pdf = academicReportPdf(old, approval({ teacherSignature: "data:image/png;base64,not-an-image" }));
    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });
  it("breaks a long subject list across pages", () => {
    const long = richSnapshot();
    long.report.subjects = Array.from({ length: 60 }, (_, i) => ({ ...long.report.subjects![0]!, subject: { name: "Subject " + i, code: "S" + i } }));
    const pdf = academicReportPdf(long, approval());
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });
});
