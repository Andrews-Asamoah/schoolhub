import { z } from "zod";
import { defineEndpoint } from "./endpoint";
import { recommendationSchema } from "./teacher";
const named = z.object({ id: z.string(), name: z.string() });
export const getTeacherMocks = defineEndpoint({
  method: "GET",
  path: "/internal-exams",
  roles: ["teacher"],
  response: z.array(
    named.extend({
      status: z.string(),
      class: named,
      papers: z.array(
        z.object({
          id: z.string(),
          subjectId: z.string(),
          nameSnapshot: z.string(),
          finalizedAt: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export const mockSheetSchema = z.object({
  paper: named.extend({
    maxMarks: z.number(),
    finalizedAt: z.string().nullable(),
  }),
  session: named.extend({ status: z.string() }),
  canEdit: z.boolean(),
  candidates: z.array(
    z.object({
      id: z.string(),
      studentId: z.string(),
      name: z.string(),
      marks: z.number().nullable(),
      status: z.enum(["MARKED", "ABSENT"]).nullable(),
      version: z.number().int(),
    }),
  ),
});
export type MockSheet = z.infer<typeof mockSheetSchema>;
export const getTeacherMockPaper = defineEndpoint({
  method: "GET",
  path: "/internal-exams/papers/:id",
  roles: ["teacher"],
  response: mockSheetSchema,
});
const mockEntry = z
  .object({
    candidateId: z.string().min(1),
    status: z.enum(["MARKED", "ABSENT"]),
    marks: z.number().finite().min(0).max(9999).multipleOf(0.01).nullable(),
    expectedVersion: z.number().int().min(0),
  })
  .strict()
  .refine((r) => (r.status === "MARKED") === (r.marks !== null), {
    message: "Absent pupils have no marks; marked pupils need a score.",
  });
export const mockMarksSchema = z
  .object({
    paperId: z.string().min(1),
    entries: z
      .array(mockEntry)
      .min(1)
      .max(120)
      .refine(
        (rows) => new Set(rows.map((r) => r.candidateId)).size === rows.length,
        "Duplicate pupil.",
      ),
  })
  .strict();
export const saveTeacherMockMarks = defineEndpoint({
  method: "PUT",
  path: "/internal-exams/marks",
  roles: ["teacher"],
  request: mockMarksSchema,
  response: z.object({ saved: z.number(), paperId: z.string() }),
});
export const finalizeTeacherMock = defineEndpoint({
  method: "PATCH",
  path: "/internal-exams/papers/:id/finalize",
  roles: ["teacher"],
  response: z.object({ id: z.string(), finalized: z.boolean() }),
});
export const correctionSchema = z
  .object({
    candidateId: z.string().min(1),
    paperId: z.string().min(1),
    status: z.enum(["MARKED", "ABSENT"]),
    marks: z.number().finite().min(0).max(9999).multipleOf(0.01).nullable(),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict()
  .refine((r) => (r.status === "MARKED") === (r.marks !== null));
export const getTeacherCorrections = defineEndpoint({
  method: "GET",
  path: "/internal-exams/:id/corrections",
  roles: ["teacher"],
  response: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      reason: z.string(),
      candidate: z.object({ nameSnapshot: z.string() }),
      paper: z.object({ nameSnapshot: z.string() }),
    }),
  ),
});
export const requestTeacherCorrection = defineEndpoint({
  method: "POST",
  path: "/internal-exams/:id/corrections",
  roles: ["teacher"],
  request: correctionSchema,
  response: z.object({ id: z.string() }),
});
export const getTeacherMockReports = defineEndpoint({
  method: "GET",
  path: "/internal-exams/:id/reports",
  roles: ["teacher"],
  response: z.object({
    reports: z.array(
      z.object({
        id: z.string(),
        stage: z.string(),
        integrityOk: z.boolean(),
        teacherRemark: z.string().nullable(),
        snapshot: z.object({
          pupil: z.object({ name: z.string() }),
          average: z.number().nullable(),
          papers: z.array(
            z.object({
              name: z.string(),
              percentage: z.number().nullable(),
              grade: z.string().nullable(),
            }),
          ),
        }),
      }),
    ),
  }),
});
export const recommendTeacherMock = defineEndpoint({
  method: "POST",
  path: "/internal-exams/reports/:id/recommend",
  roles: ["teacher"],
  request: recommendationSchema,
  response: z.object({ id: z.string(), stage: z.string() }),
});
