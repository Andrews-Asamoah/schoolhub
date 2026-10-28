import { jsPDF } from "jspdf";
import { snapshotHash } from "./report-version.js";

export interface GradeBand { grade:string; min:number; max:number; description:string }
export interface MockPaperResult {
  id:string; name:string; code:string; maxMarks:number;
  mark:number|null; status:"MARKED"|"ABSENT"; percentage:number|null; grade:string|null;
}
export interface MockSnapshot {
  schemaVersion:1; kind:"INTERNAL_MOCK"; name:string; number:number;
  school:{name:string;code:string}; year:string;term:string;className:string;
  pupil:{name:string;admissionNumber:string|null}; papers:MockPaperResult[];
  grading:{name:string;bands:GradeBand[];scoreRounding:"NEAREST_WHOLE_PERCENT"};
  average:number|null; position:number|null; positionMethod:"COMPETITION";
  capturedAt:string;
}
export function validateBands(bands:readonly GradeBand[]) {
  if(!bands.length)throw new Error("Configure a grading system before generating mock reports.");
  // Policy is explicit: grade score rounded to the nearest whole percentage point.
  // Every integer from 0 to 100 must map to exactly one school's configured grade.
  for(let mark=0;mark<=100;mark++){
    const matches=bands.filter(b=>b.min<=mark&&mark<=b.max);
    if(matches.length!==1)throw new Error("Grading bands must assign exactly one grade for each whole percentage point (0–100).");
  }
  if(bands.some(b=>!Number.isFinite(b.min)||!Number.isFinite(b.max)||b.min>b.max||!b.grade.trim())){
    throw new Error("Invalid school grading band.");
  }
}
export function gradeForPercentage(percentage:number,bands:readonly GradeBand[]):string {
  const gradePoint=Math.round(percentage);
  const match=bands.find(b=>b.min<=gradePoint&&gradePoint<=b.max);
  if(!match)throw new Error("Percentage has no configured grade.");
  return match.grade;
}
/** Competition ranking (1, 1, 3); a pupil absent in any subject is unranked. */
export function competitionRanks(rows:readonly {id:string;average:number|null}[]):Map<string,number|null>{
  const complete=rows.filter((r):r is {id:string;average:number}=>r.average!==null)
    .sort((a,b)=>b.average-a.average||a.id.localeCompare(b.id));
  const result=new Map<string,number|null>(rows.map(r=>[r.id,null]));
  let previous:number|null=null,rank=0;
  complete.forEach((row,i)=>{if(previous===null||row.average!==previous)rank=i+1;
    result.set(row.id,rank);previous=row.average;});
  return result;
}
export function mockSnapshotPdf(snapshot:MockSnapshot, approval:{
  hash:string; version:number; teacherName:string;teacherRemark:string;teacherAt:Date;
  headName:string;headRemark:string;headAt:Date;publishedAt:Date;
}):Buffer{
  const doc=new jsPDF({unit:"pt",format:"a4",compress:true});
  const limit=doc.internal.pageSize.getHeight()-48;
  const width=doc.internal.pageSize.getWidth()-88;
  let y=46;
  const write=(value:string,size=10,bold=false)=>{
    doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);
    const text=doc.splitTextToSize(value,width) as string[];
    for(const line of text){if(y>limit){doc.addPage();y=48;}doc.text(line,44,y);y+=size+5;}y+=5;
  };
  write(snapshot.school.name,18,true);
  write(snapshot.name.toUpperCase()+" — SCHOOL-ISSUED INTERNAL EXAMINATION REPORT",11,true);
  write(snapshot.year+" · "+snapshot.term+" · "+snapshot.className);
  write("Pupil: "+snapshot.pupil.name+" · Admission: "+(snapshot.pupil.admissionNumber??"—"),11,true);
  y+=7;write("SUBJECT RESULTS",11,true);
  for(const p of snapshot.papers){
    write(p.name+" ("+p.code+") · "+(p.status==="ABSENT"?"ABSENT":
      p.mark+"/"+p.maxMarks+" · "+p.percentage+"% · Grade "+p.grade));
  }
  y+=5;
  write("Overall average: "+(snapshot.average===null?"Not calculated (absent in one or more papers)":snapshot.average+"%"));
  write("Class position: "+(snapshot.position===null?"Unranked":String(snapshot.position)+" (competition ranking)"));
  write("Grading policy: "+snapshot.grading.name+"; rounded to nearest whole % point for grade lookup.",9);
  y+=7;write("CLASS TEACHER RECOMMENDATION",11,true);
  write(approval.teacherRemark);write("Electronic approval: "+approval.teacherName+" · "+approval.teacherAt.toISOString(),9);
  y+=4;write("HEADTEACHER RECOMMENDATION",11,true);
  write(approval.headRemark);write("Electronic approval: "+approval.headName+" · "+approval.headAt.toISOString(),9);
  y+=7;write("Published "+approval.publishedAt.toISOString()+" · Report v"+approval.version,9);
  write("Snapshot SHA-256: "+approval.hash,8);
  write("Electronic workflow sign-offs; not certificate-based digital signatures.",8);
  doc.setProperties({title:snapshot.name+" · "+snapshot.pupil.name,subject:"School internal mock examination result"});
  return Buffer.from(doc.output("arraybuffer"));
}
export { snapshotHash };
