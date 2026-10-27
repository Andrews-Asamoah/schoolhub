import { z } from "zod";

export const createSchoolAssignmentSchema = z.object({
  classId: z.string().trim().min(1).max(100),
  subjectId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(3).max(160),
  instructions: z.string().trim().min(1).max(10_000),
  dueAt: z.string().datetime().nullable().optional(),
  maxScore: z.number().finite().positive().max(100_000),
});
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
