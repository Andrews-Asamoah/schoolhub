import { z } from "zod";

export const reportDataSchema = z.object({
  subjects: z
    .array(
      z.object({
        subject: z.object({ name: z.string() }),
        totalScore: z.number().nullish(),
        percentage: z.number().nullish(),
        grade: z.string().nullish(),
        gradeRemark: z.string().nullish(),
        position: z.number().nullish(),
        components: z
          .array(
            z.object({
              name: z.string(),
              marksObtained: z.number(),
              maxMarks: z.number(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  summary: z
    .object({
      average: z.number().nullish(),
      overallPosition: z.number().nullish(),
      classSize: z.number().optional(),
    })
    .nullish(),
  attendance: z
    .object({
      present: z.number(),
      total: z.number(),
      rate: z.number().nullish(),
    })
    .nullish(),
  remarks: z
    .array(
      z.object({
        content: z.string(),
        type: z.string(),
        teacher: z.string().nullish(),
      }),
    )
    .optional(),
});
export const reportApprovalSchema = z.object({
  teacher: z
    .object({ name: z.string().nullish(), remark: z.string().nullish() })
    .nullish(),
  head: z
    .object({ name: z.string().nullish(), remark: z.string().nullish() })
    .nullish(),
});
export type ReportData = z.infer<typeof reportDataSchema>;
export type ReportApproval = z.infer<typeof reportApprovalSchema>;
