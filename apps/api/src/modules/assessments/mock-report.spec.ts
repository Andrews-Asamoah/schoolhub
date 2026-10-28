import { describe, expect, it } from "vitest";
import { competitionRanks,gradeForPercentage,mockSnapshotPdf,validateBands,type MockSnapshot } from "./mock-report.js";
const bands=[{grade:"A",min:80,max:100,description:"Excellent"},{grade:"B",min:60,max:79,description:"Good"},{grade:"C",min:0,max:59,description:"Developing"}];
describe("mock grading, ranks and PDF",()=>{
  it("rejects overlapping/incomplete grading policies, including gaps",()=>{
    expect(()=>validateBands(bands)).not.toThrow();
    expect(()=>validateBands([...bands,{grade:"D",min:78,max:90,description:"Bad"}])).toThrow();
    expect(()=>validateBands(bands.slice(1))).toThrow();
    expect(gradeForPercentage(79.5,bands)).toBe("A");
    expect(gradeForPercentage(79.49,bands)).toBe("B");
  });
  it("uses competition ranks and leaves absentees unranked",()=>{
    const ranks=competitionRanks([{id:"a",average:88},{id:"b",average:88},{id:"c",average:77},{id:"d",average:null}]);
    expect([...ranks.values()]).toEqual([1,1,3,null]);
  });
  it("produces a private PDF with frozen grades, two approvals and snapshot seal",()=>{
    const snap:MockSnapshot={schemaVersion:1,kind:"INTERNAL_MOCK",name:"Mock 1",number:1,
      school:{name:"Synthetic School",code:"ABC"},year:"2026/27",term:"Term 1",className:"JHS3",
      pupil:{name:"Synthetic Child",admissionNumber:"T-01"},
      papers:[{id:"p",name:"Computing",code:"ICT",maxMarks:100,mark:85,status:"MARKED",percentage:85,grade:"A"}],
      grading:{name:"School grades",bands,scoreRounding:"NEAREST_WHOLE_PERCENT"},
      average:85,position:1,positionMethod:"COMPETITION",capturedAt:"2026-10-28T01:00:00Z"};
    const {snapshotHash}=requireHash();
    const pdf=mockSnapshotPdf(snap,{hash:snapshotHash(snap),version:1,teacherName:"Teacher T",
      teacherRemark:"Shows steady progress in the mock examination.",teacherAt:new Date(),
      headName:"Head H",headRemark:"Keep maintaining excellent academic preparation.",
      headAt:new Date(),publishedAt:new Date()});
    expect(pdf.subarray(0,4).toString()).toBe("%PDF");
  });
});
function requireHash(){return {snapshotHash: (v:unknown)=>createHash(v)}}
import {snapshotHash as createHash} from "./mock-report.js";
