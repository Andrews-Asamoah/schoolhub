import { z } from "zod";
import {
  createAssignmentSchema,
  gradeAssignmentSchema,
  recommendationSchema,
} from "@/api/teacher";
export const assignmentFormSchema = z
  .object({
    classId: z.string().min(1),
    subjectId: z.string().min(1),
    title: z.string(),
    instructions: z.string(),
    maxScore: z.string().trim().min(1),
    dueDate: z.string(),
  })
  .transform((v): z.input<typeof createAssignmentSchema> => ({
    classId: v.classId,
    subjectId: v.subjectId,
    title: v.title,
    instructions: v.instructions,
    maxScore: Number(v.maxScore),
    dueAt: v.dueDate ? v.dueDate + "T23:59:00.000Z" : null,
  }))
  .pipe(createAssignmentSchema);
export const gradeFormSchema = z
  .object({ score: z.string().trim().min(1), feedback: z.string() })
  .transform((v): z.input<typeof gradeAssignmentSchema> => ({
    ...v,
    score: Number(v.score),
  }))
  .pipe(gradeAssignmentSchema);
export { recommendationSchema };
/** Blank is an explicit clear only for internal assessment cells, never a zero. */
export function numericMark(
  value: string,
  max: number,
  nullable = true,
): number | null {
  if (!value.trim()) {
    if (nullable) return null;
    throw new Error("Enter a mark.");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Use a score with up to two decimal places.");
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max)
    throw new Error("The score is outside the allowed range.");
  return n;
}
