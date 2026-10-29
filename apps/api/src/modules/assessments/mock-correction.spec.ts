import {describe,expect,it} from "vitest";
import {reviseMockCohort,type MockRevisionRow} from "./mock-correction.js";
const bands=[{grade:"A",min:80,max:100,description:"Excellent"},{grade:"B",min:0,max:79,description:"Other"}];
function row(id:string,mark:number):MockRevisionRow{
  return {candidateId:id,studentId:id,version:1,snapshot:{
    schemaVersion:1,kind:"INTERNAL_MOCK",name:"Mock 1",number:1,year:"2026",term:"1",className:"JHS3",
    school:{name:"Sample",code:"X"},pupil:{name:id,admissionNumber:id},
    papers:[{id:"p",name:"Computing",code:"CMP",status:"MARKED",mark,maxMarks:100,
      percentage:mark,grade:mark>=80?"A":"B"}],average:mark,position:1,
    grading:{name:"Sample",bands,scoreRounding:"NEAREST_WHOLE_PERCENT"},
    positionMethod:"COMPETITION",capturedAt:"2026-10-01T12:00:00Z",
  }};
}
describe("immutable mock correction recomputation",()=>{
  it("recalculates all candidate ranks and creates versions without mutating source",()=>{
    const originals=[row("a",90),row("b",85),row("c",70)];
    const copy=JSON.stringify(originals);
    const updated=reviseMockCohort(originals,{candidateId:"c",paperId:"p",status:"MARKED",marks:95},
      {correctionId:"case1",approvedAt:"2026-10-28T01:00:00Z"});
    expect(updated.map(x=>x.snapshot.position)).toEqual([2,3,1]);
    expect(updated.map(x=>x.version)).toEqual([2,2,2]);
    expect(updated[2]!.snapshot.papers[0]!.grade).toBe("A");
    expect(JSON.stringify(originals)).toBe(copy);
  });
  it("keeps an absence unranked instead of treating it as zero",()=>{
    const revised=reviseMockCohort([row("a",90),row("b",80)],{candidateId:"a",paperId:"p",
      status:"ABSENT",marks:null},{correctionId:"case2",approvedAt:"2026-10-28T01:00:00Z"});
    expect(revised[0]!.snapshot.average).toBeNull();
    expect(revised[0]!.snapshot.position).toBeNull();
    expect(revised[1]!.snapshot.position).toBe(1);
  });
  it("refuses out-of-range changes or the wrong paper",()=>{
    expect(()=>reviseMockCohort([row("a",90)],{candidateId:"a",paperId:"p",
      status:"MARKED",marks:101},{correctionId:"x",approvedAt:"now"})).toThrow();
    expect(()=>reviseMockCohort([row("a",90)],{candidateId:"a",paperId:"x",
      status:"MARKED",marks:70},{correctionId:"x",approvedAt:"now"})).toThrow();
  });
});
