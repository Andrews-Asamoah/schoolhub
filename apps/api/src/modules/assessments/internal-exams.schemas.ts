import { z } from "zod";
/** One sitting's marks: each pupil once, and a mark only for a pupil who was marked present. */
const markEntriesSchema = z.array(z.object({
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
});

export const createMockSchema = z.object({ classId: z.string().min(1) }).strict();
export const mockMarkSchema = z.object({
  paperId: z.string().min(1),
  entries: markEntriesSchema,
}).strict();

export const mockSectionMarkSchema = z.object({
  sectionId: z.string().min(1),
  entries: markEntriesSchema,
}).strict();

export const mockCorrectionRequestSchema = z.object({
  candidateId:z.string().min(1),
  paperId:z.string().min(1),
  status:z.enum(["MARKED","ABSENT"]),
  marks:z.number().finite().min(0).max(9999).multipleOf(0.01).nullable(),
  expectedVersion:z.number().int().positive(),
  reason:z.string().trim().min(10).max(2000),
}).strict().superRefine((v,ctx)=>{
  if((v.status==="MARKED")!==(v.marks!==null))ctx.addIssue({
    code:"custom",path:["marks"],message:"Absent means no marks; marked pupils require numeric marks.",
  });
});
export const mockCorrectionDecisionSchema = z.object({
  reason:z.string().trim().min(10).max(2000),
}).strict();


export const mockMarksImportRefSchema = z.object({
  paperId: z.string().min(1), sectionId: z.string().min(1).optional(),
}).strict();
export const mockMarksImportBatchSchema = mockMarksImportRefSchema.extend({
  rows: z.array(z.object({
    rowNumber: z.number().int().positive(), name: z.string().max(200),
    row: mockMarkSchema.shape.entries.element,
  }).strict()).min(1).max(120),
}).superRefine((batch, ctx) => {
  const result = mockMarkSchema.shape.entries.safeParse(batch.rows.map((item) => item.row));
  if (!result.success) for (const issue of result.error.issues) {
    ctx.addIssue({ code: "custom", path: ["rows"], message: issue.message });
  }
});
