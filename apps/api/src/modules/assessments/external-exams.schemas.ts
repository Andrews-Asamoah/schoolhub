import { z } from "zod";
/** School-entered external exam results are NOT a WAEC result-verification service. */
export const externalExamCreateSchema=z.object({
  academicYearId:z.string().min(1),
  classId:z.string().min(1),
  examYear:z.number().int().min(2000).max(2100),
}).strict();
export const externalIndexSchema=z.object({
  indexNumber:z.string().trim().min(5).max(60).regex(/^[A-Za-z0-9/-]+$/),
  expectedVersion:z.number().int().min(1),
}).strict();
export const externalResultRowSchema=z.object({
  candidateId:z.string().min(1),
  status:z.enum(["GRADED","ABSENT","WITHHELD","CANCELLED"]),
  grade:z.number().int().min(1).max(9).nullable(),
  expectedVersion:z.number().int().min(0),
}).strict().superRefine((row,ctx)=>{
  if((row.status==="GRADED")!==(row.grade!==null))ctx.addIssue({
    code:"custom",path:["grade"],message:"Only a graded result has a grade between 1 and 9.",
  });
});
export const externalResultBatchSchema=z.object({
  paperId:z.string().min(1),
  sourceReference:z.string().trim().min(5).max(200),
  entries:z.array(externalResultRowSchema).min(1).max(120),
}).strict().superRefine((input,ctx)=>{
  const ids=input.entries.map(row=>row.candidateId);
  if(ids.length!==new Set(ids).size)ctx.addIssue({code:"custom",path:["entries"],
    message:"Duplicate candidates in one submission are not allowed."});
});
