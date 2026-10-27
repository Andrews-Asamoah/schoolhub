import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
export const calendarConfigurationSchema = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  reason: z.string().trim().min(8).max(400),
  overrides: z.array(z.object({
    date: isoDate, isInstructional: z.boolean(), label: z.string().trim().min(2).max(160),
  }).strict()).max(250),
}).strict();
export const attendanceExclusionSchema = z.object({
  studentId: z.string().min(1), termId: z.string().min(1), date: isoDate,
  reason: z.string().trim().min(8).max(400),
}).strict();
export const revokeExclusionSchema = z.object({
  reason: z.string().trim().min(8).max(400),
}).strict();
