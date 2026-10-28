import { competitionRanks,gradeForPercentage,validateBands,type MockSnapshot,type MockPaperResult } from "./mock-report.js";
export type ScoreChange={candidateId:string;paperId:string;status:"MARKED"|"ABSENT";marks:number|null};
export type MockRevisionRow={candidateId:string;studentId:string;version:number;snapshot:MockSnapshot};
export function reviseMockCohort(rows:readonly MockRevisionRow[],change:ScoreChange,
  metadata:{correctionId:string;approvedAt:string}):{candidateId:string;studentId:string;version:number;snapshot:MockSnapshot}[]{
  if(!rows.length||new Set(rows.map(r=>r.candidateId)).size!==rows.length)throw new Error("A complete, unique candidate cohort is required.");
  if(!rows.some(r=>r.candidateId===change.candidateId))throw new Error("The corrected candidate is missing.");
  const approved=rows.map(row=>{
    const source=row.snapshot;
    if(source.kind!=="INTERNAL_MOCK")throw new Error("Unexpected report source.");
    validateBands(source.grading.bands);
    let corrected=false,absent=false,total=0,maxTotal=0;
    const papers:MockPaperResult[]=source.papers.map(p=>{
      let next={...p};
      if(row.candidateId===change.candidateId&&p.id===change.paperId){
        corrected=true;
        if(change.status==="ABSENT"){
          if(change.marks!==null)throw new Error("Absence must not carry marks.");
          next={...p,status:"ABSENT",mark:null,percentage:null,grade:null};
        }else{
          if(change.marks===null||!Number.isFinite(change.marks)||change.marks<0||
            change.marks>p.maxMarks||Math.abs(Math.round(change.marks*100)-change.marks*100)>1e-7){
              throw new Error("Corrected marks must be valid and within the paper maximum.");
          }
          const percentage=Math.round(change.marks/p.maxMarks*10000)/100;
          next={...p,status:"MARKED",mark:change.marks,percentage,
            grade:gradeForPercentage(percentage,source.grading.bands)};
        }
      }
      if(next.status==="ABSENT")absent=true;
      else{
        if(next.mark===null)throw new Error("Invalid recorded mark in original snapshot.");
        total+=next.mark;maxTotal+=next.maxMarks;
      }
      return next;
    });
    if(row.candidateId===change.candidateId&&!corrected)throw new Error("Correction paper was not part of the candidate's report.");
    const average=absent?null:Math.round(total/maxTotal*10000)/100;
    return {...row,average,papers};
  });
  const ranks=competitionRanks(approved.map(r=>({id:r.candidateId,average:r.average})));
  return approved.map(row=>({
    candidateId:row.candidateId,studentId:row.studentId,version:row.version+1,
    snapshot:{...row.snapshot,papers:row.papers,average:row.average,
      position:ranks.get(row.candidateId)??null,
      capturedAt:metadata.approvedAt,
      correction:{requestId:metadata.correctionId,baseVersion:row.version,approvedAt:metadata.approvedAt}},
  }));
}
