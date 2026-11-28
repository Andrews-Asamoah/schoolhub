import {
  externalResultBatchSchema,
  externalResultStatusSchema,
} from "@schoolhub/shared";
import { z } from "zod";
import { defineEndpoint } from "./endpoint";

const named = z.object({ id: z.string(), name: z.string() });
const paper = named.extend({ code: z.string() });
const count = z.number().int().nonnegative();
export const externalExamSheet = z.object({
  paper,
  canEdit: z.boolean(),
  candidates: z.array(
    named.extend({
      admissionNumber: z.string().nullable(),
      indexNumber: z.string().nullable(),
      status: externalResultStatusSchema.nullable(),
      grade: z.number().int().min(1).max(9).nullable(),
      version: count,
      sourceReference: z.string().nullable(),
    }),
  ),
});
export type ExternalExamSheet = z.infer<typeof externalExamSheet>;
export type ExternalResultStatus = z.infer<typeof externalResultStatusSchema>;

export const listTeacherExternalExams = defineEndpoint({
  method: "GET",
  path: "/external-exams",
  roles: ["teacher"],
  response: z.array(
    named.extend({
      examYear: z.number(),
      status: z.string(),
      class: named,
      academicYear: named,
      papers: z.array(
        z.object({
          id: z.string(),
          codeSnapshot: z.string(),
          nameSnapshot: z.string(),
        }),
      ),
    }),
  ),
});
export const getTeacherExternalPaper = defineEndpoint({
  method: "GET",
  path: "/external-exams/papers/:id",
  roles: ["teacher"],
  response: externalExamSheet,
});
export const getTeacherExternalSummary = defineEndpoint({
  method: "GET",
  path: "/external-exams/:id/summary",
  roles: ["teacher"],
  response: z.object({
    source: z.literal("SCHOOL_ENTERED_UNVERIFIED"),
    candidateCount: count,
    missingIndexNumbers: count,
    papers: z.array(
      paper.extend({
        recorded: count,
        expected: count,
        pending: count,
        statuses: z.object({
          GRADED: count,
          ABSENT: count,
          WITHHELD: count,
          CANCELLED: count,
        }),
        grades: z.array(z.object({ grade: z.number(), count })),
      }),
    ),
  }),
});
export const saveTeacherExternalResults = defineEndpoint({
  method: "PUT",
  path: "/external-exams/results",
  roles: ["teacher"],
  request: externalResultBatchSchema,
  response: z.object({ paperId: z.string(), saved: count }),
});
