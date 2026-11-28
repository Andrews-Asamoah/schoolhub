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
export { externalResultBatchSchema } from "@schoolhub/shared";
