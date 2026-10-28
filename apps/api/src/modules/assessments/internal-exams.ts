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
