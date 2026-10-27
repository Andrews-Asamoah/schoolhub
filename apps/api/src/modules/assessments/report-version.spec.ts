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
});
