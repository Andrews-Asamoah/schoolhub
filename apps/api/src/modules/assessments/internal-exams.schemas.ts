import { z } from "zod";
export const createMockSchema = z.object({ classId: z.string().min(1) }).strict();
export const mockMarkSchema = z.object({
  paperId: z.string().min(1),
  entries: z.array(z.object({
    candidateId: z.string().min(1),
    status: z.enum(["MARKED","ABSENT"]),
    marks: z.number().finite().min(0).max(9999).multipleOf(0.01).nullable(),
    expectedVersion: z.number().int().min(0),
  }).strict()).min(1).max(120).superRefine((rows,ctx)=>{
    const ids=rows.map(v=>v.candidateId);
    if(new Set(ids).size!==ids.length)ctx.addIssue({
      code:"custom",message:"Duplicate pupil in the submission."
    });
    rows.forEach((r,i)=>{
      if((r.status==="MARKED")!==(r.marks!==null))ctx.addIssue({
        code:"custom",path:[i,"marks"],message:"Absent pupils must have no marks; recorded pupils require marks."
      });
    });
  }),
}).strict();
