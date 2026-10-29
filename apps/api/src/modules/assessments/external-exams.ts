export type BECEStatus="GRADED"|"ABSENT"|"WITHHELD"|"CANCELLED";
export type BECERow={status:BECEStatus;grade:number|null};
export type GradeDistribution={grade:number;count:number};
export function validateBECEResult(row:BECERow):void{
  if(row.status==="GRADED"){
    if(row.grade===null||!Number.isInteger(row.grade)||row.grade<1||row.grade>9){
      throw new Error("A graded BECE result must have a whole grade between 1 and 9.");
    }
  }else if(row.grade!==null)throw new Error("An absent, withheld or cancelled result cannot carry a grade.");
}
export function resultSummary(rows:readonly BECERow[],expected:number){
  if(!Number.isInteger(expected)||expected<0||rows.length>expected){
    throw new Error("Invalid expected BECE result count.");
  }
  rows.forEach(validateBECEResult);
  const counts={GRADED:0,ABSENT:0,WITHHELD:0,CANCELLED:0};
  for(const row of rows)counts[row.status]++;
  return {expected,recorded:rows.length,pending:expected-rows.length,
    statuses:counts,grades:Array.from({length:9},(_,i)=>({
      grade:i+1,count:rows.filter(row=>row.status==="GRADED"&&row.grade===i+1).length,
    }))};
}
