import { z } from "zod";

import { createSchoolAssignmentSchema } from "@schoolhub/shared";
export { createSchoolAssignmentSchema, publishAssignmentBatchSchema } from "@schoolhub/shared";
export type CreateSchoolAssignmentInput = z.infer<typeof createSchoolAssignmentSchema>;

export const submitSchoolAssignmentSchema = z.object({
  responseText: z.string().trim().min(1).max(20_000),
});
export type SubmitSchoolAssignmentInput = z.infer<typeof submitSchoolAssignmentSchema>;

export const gradeSchoolAssignmentSchema = z.object({
  score: z.number().finite().min(0).max(100_000),
  feedback: z.string().trim().max(2_000).nullable().optional(),
});
export type GradeSchoolAssignmentInput = z.infer<typeof gradeSchoolAssignmentSchema>;
