import { z } from "zod";
export const rolloverPlanSchema = z.object({
 fromYearId:z.string().min(1),fromTermId:z.string().min(1),toYearId:z.string().min(1),toTermId:z.string().min(1),
 policy:z.object({name:z.string().trim().min(3).max(100),version:z.string().trim().min(1).max(40),requiresPublishedReport:z.boolean().default(true),basis:z.string().trim().min(10).max(2000)}),
 decisions:z.array(z.object({studentId:z.string().min(1),action:z.enum(['PROMOTED','REPEATED','GRADUATED','SKIPPED']),toClassId:z.string().nullable(),reason:z.string().trim().min(10).max(1000)})).min(1).max(2000),
}).superRefine((plan,context)=>{
 if(plan.fromYearId===plan.toYearId)context.addIssue({code:'custom',message:'Choose different source and target years.'});
 if(new Set(plan.decisions.map(row=>row.studentId)).size!==plan.decisions.length)context.addIssue({code:'custom',message:'Each student requires exactly one decision.'});
 for(const row of plan.decisions)if((row.action==='GRADUATED')!==!row.toClassId)context.addIssue({code:'custom',message:'Graduates have no destination class; all other decisions require one.'});
});
export type RolloverPlan=z.infer<typeof rolloverPlanSchema>;
