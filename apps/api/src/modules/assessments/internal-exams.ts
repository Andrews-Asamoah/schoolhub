import type { Prisma } from "@prisma/client";
import type { TeacherAssignments } from "../../common/scope/teacher-scope.service.js";

/** No mock score is copied into a termly SBA record or a WAEC result. */
export function validateMockMarks(maxMarks:number, entries:readonly {status:"MARKED"|"ABSENT";marks:number|null}[]) {
  if(!Number.isFinite(maxMarks)||maxMarks<=0) throw new Error("Invalid paper maximum.");
  for(const entry of entries){
    if(entry.status==="ABSENT"&&entry.marks!==null)throw new Error("An absent pupil must not receive a zero mark.");
    if(entry.status==="MARKED"&&(!Number.isFinite(entry.marks)||entry.marks===null||
       entry.marks<0||entry.marks>maxMarks||Math.abs(Math.round(entry.marks*100)-entry.marks*100)>1e-7)){
       throw new Error("Recorded marks must be within the paper maximum and have at most two decimal places.");
    }
  }
}
export function mockPercent(mark:number|null,maxMarks:number):number|null{
  return mark===null?null:Math.round(mark/maxMarks*10000)/100;
}

/**
 * The subject papers a teacher is assigned to, as a database filter: the papers of
 * a class's subjects they teach whole, or in which they teach a teaching area (strand).
 * This is the same rule that lets a teacher finalise a paper, so the paper list a
 * teacher sees is exactly the set they can act on. A teacher with no subject
 * assignment gets an empty `OR`, which matches nothing.
 */
export function assignedPaperFilter(
  assignments:Pick<TeacherAssignments,"subjectAssignments"|"subjectStrandAssignments">,
):Prisma.InternalExamPaperWhereInput{
  const subjectsByClass=new Map<string,Set<string>>();
  for(const row of [...assignments.subjectAssignments,...assignments.subjectStrandAssignments]){
    const subjects=subjectsByClass.get(row.classId)??new Set<string>();
    subjects.add(row.subjectId);
    subjectsByClass.set(row.classId,subjects);
  }
  return {OR:[...subjectsByClass].map(([classId,subjectIds])=>({
    session:{classId},
    subjectId:{in:[...subjectIds]},
  }))};
}
