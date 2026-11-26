import { reportApprovalSchema, reportDataSchema } from "./report-preview";
import { File } from "expo-file-system";
import { z } from "zod";
import { appendUploadFile, defineDownload, defineEndpoint } from "./endpoint";

const nullableText = z.string().nullable();
const wardSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  admissionNumber: nullableText,
  status: z.string(),
  profile: z.object({
    firstName: z.string(),
    lastName: z.string(),
    otherNames: nullableText,
    image: nullableText.optional(),
  }),
  class: z
    .object({ id: z.string(), name: z.string(), level: z.string().optional() })
    .nullable(),
  department: z.object({ id: z.string(), name: z.string() }).nullable(),
  house: z.object({ id: z.string(), name: z.string() }).nullable(),
  subjects: z.array(
    z.object({
      subjectId: z.string(),
      name: z.string(),
      code: z.string(),
      isCompulsory: z.boolean(),
      teacherName: nullableText,
    }),
  ),
});
export type GuardianWard = z.infer<typeof wardSchema>;

const wardsEndpoint = defineEndpoint({
  method: "GET",
  path: "/students/my-wards",
  roles: ["guardian"],
  response: z.array(wardSchema),
});
const wardEndpoint = defineEndpoint({
  method: "GET",
  path: "/students/my-wards/:id",
  roles: ["guardian"],
  response: wardSchema,
});

export function listMyWards(options: { signal?: AbortSignal } = {}) {
  return wardsEndpoint(options);
}
export function getMyWard(id: string, options: { signal?: AbortSignal } = {}) {
  return wardEndpoint({ params: { id }, ...options });
}

const feesSchema = z.object({
  student: z.object({
    id: z.string(),
    admissionNumber: nullableText,
    name: z.string(),
  }),
  scope: z.enum(["term", "year", "all"]),
  period: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
    academicYear: z.string().optional(),
    term: z.string().optional(),
  }),
  openingBalance: z.string(),
  entries: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      type: z.enum([
        "INVOICE",
        "DISCOUNT",
        "RECEIPT",
        "REVERSAL",
        "REFUND",
        "ADJUSTMENT",
      ]),
      reference: z.string(),
      description: z.string(),
      amount: z.string(),
      runningBalance: z.string(),
      academicYear: nullableText.optional(),
      term: nullableText.optional(),
    }),
  ),
  closingBalance: z.string(),
  ageing: z.object({
    days0To30: z.string(),
    days31To60: z.string(),
    days61To90: z.string(),
    days90Plus: z.string(),
    notDue: z.string(),
  }),
  unallocatedCredit: z.string(),
  dataSource: z.literal("bills_and_payments"),
});
export type GuardianFees = z.infer<typeof feesSchema>;
const feesEndpoint = defineEndpoint({
  method: "GET",
  path: "/students/my-wards/:id/fees",
  roles: ["guardian"],
  response: feesSchema,
});
export function getWardFees(
  id: string,
  options: { signal?: AbortSignal } = {},
) {
  return feesEndpoint({ params: { id }, query: { scope: "all" }, ...options });
}

const attendanceSchema = z.object({
  summary: z.record(z.string(), z.number()),
  totalDays: z.number(),
  recordedDays: z.number(),
  possibleDays: z.number().nullable(),
  unmarkedDays: z.number().nullable(),
  missingDates: z.array(z.string()),
  attendanceRate: z.number(),
  provisionalRate: z.number().nullable(),
  coverageRate: z.number().nullable(),
  policyMode: z.string(),
  policyActiveFrom: z.string().nullable(),
  isComplete: z.boolean(),
  recentRecords: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      status: z.string(),
      remarks: nullableText,
    }),
  ),
});
export type GuardianAttendance = z.infer<typeof attendanceSchema>;
const attendanceEndpoint = defineEndpoint({
  method: "GET",
  path: "/attendance/guardian/:studentId",
  roles: ["guardian"],
  response: attendanceSchema,
});
export function getWardAttendance(
  studentId: string,
  options: { signal?: AbortSignal } = {},
) {
  return attendanceEndpoint({ params: { studentId }, ...options });
}

const timetableSchema = z.object({
  class: z.object({ id: z.string(), name: z.string() }).nullable(),
  academicYear: z.object({ id: z.string(), name: z.string() }).nullable(),
  term: z.object({ id: z.string(), name: z.string() }).nullable(),
  entries: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      label: z.string(),
      dayOfWeek: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      class: z.object({ id: z.string(), name: z.string() }).nullable(),
      subject: z.object({ id: z.string(), name: z.string() }).nullable(),
      teacher: z.object({ id: z.string(), name: z.string() }).nullable(),
      classroom: z.object({ id: z.string(), name: z.string() }).nullable(),
    }),
  ),
});
export type GuardianTimetable = z.infer<typeof timetableSchema>;
const timetableEndpoint = defineEndpoint({
  method: "GET",
  path: "/timetable/guardian/:studentId",
  roles: ["guardian"],
  response: timetableSchema,
});
export function getWardTimetable(
  studentId: string,
  options: { signal?: AbortSignal } = {},
) {
  return timetableEndpoint({ params: { studentId }, ...options });
}

const reportSchema = z.object({
  id: z.string(),
  setId: z.string(),
  studentId: z.string(),
  publishedAt: z.string(),
  pdfAvailable: z.boolean(),
  data: reportDataSchema.nullish().catch(null),
  approval: reportApprovalSchema.nullish().catch(null),
  student: z.object({
    admissionNumber: nullableText,
    profile: z.object({ firstName: z.string(), lastName: z.string() }),
  }),
  set: z.object({
    name: z.string(),
    academicYear: z.object({ name: z.string() }),
    term: z.object({ name: z.string() }),
  }),
});
export type GuardianReport = z.infer<typeof reportSchema>;
const reportsEndpoint = defineEndpoint({
  method: "GET",
  path: "/assessments/report-cards/guardian",
  roles: ["guardian"],
  response: z.array(reportSchema),
});
export function listGuardianReports(options: { signal?: AbortSignal } = {}) {
  return reportsEndpoint(options);
}
const reportPdfEndpoint = defineDownload({
  method: "GET",
  path: "/assessments/report-cards/guardian/:reportId/pdf",
  roles: ["guardian"],
});
export function downloadGuardianReport(
  reportId: string,
  options: { signal?: AbortSignal } = {},
) {
  return reportPdfEndpoint({ params: { reportId }, ...options });
}

const clubsEndpoint = defineEndpoint({
  method: "GET",
  path: "/academics/clubs",
  roles: ["guardian"],
  response: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: nullableText,
      isActive: z.boolean(),
      _count: z.object({ members: z.number() }),
    }),
  ),
});
export function listGuardianClubs(options: { signal?: AbortSignal } = {}) {
  return clubsEndpoint(options);
}
const housesEndpoint = defineEndpoint({
  method: "GET",
  path: "/academics/houses",
  roles: ["guardian"],
  response: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: nullableText.optional(),
      _count: z.object({ students: z.number() }).optional(),
    }),
  ),
});
export function listGuardianHouses(options: { signal?: AbortSignal } = {}) {
  return housesEndpoint(options);
}

export const absenceStatuses = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
const absenceRequest = z.object({
  id: z.string(),
  studentId: z.string(),
  fromDate: z.string(),
  toDate: z.string(),
  reason: z.string(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  decisionNote: z.string().nullable(),
  attachmentMime: z.string().nullable(),
  student: z.object({
    profile: z.object({ firstName: z.string(), lastName: z.string() }),
  }),
});
export const listAbsenceRequests = defineEndpoint({
  method: "GET",
  path: "/attendance/excuse-requests",
  roles: ["guardian"],
  response: z.object({
    items: z.array(absenceRequest),
    page: z.number(),
    totalPages: z.number(),
  }),
});
export const absenceFormSchema = z
  .object({
    studentId: z.string().min(1),
    fromDate: z.iso.date(),
    toDate: z.iso.date(),
    reason: z.string().trim().min(10).max(2000),
    file: z
      .object({
        uri: z.string(),
        name: z.string(),
        mime: z.enum([
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
        ]),
      })
      .optional(),
  })
  .refine(
    ({ fromDate, toDate }) => {
      const duration = Date.parse(toDate) - Date.parse(fromDate);
      return duration >= 0 && duration <= 30 * 86400000;
    },
    { message: "Choose an absence period of 1 to 31 days." },
  );

export const createAbsenceRequest = defineEndpoint({
  method: "POST",
  path: "/attendance/excuse-requests",
  roles: ["guardian"],
  request: absenceFormSchema,
  multipart: ({ studentId, fromDate, toDate, reason, file }) => {
    const body = new FormData();
    body.append("studentId", studentId);
    body.append("fromDate", fromDate);
    body.append("toDate", toDate);
    body.append("reason", reason);
    if (file) {
      const evidence = new File(file.uri);
      if (!evidence.exists || !evidence.size || evidence.size > 5 * 1024 * 1024)
        throw new Error("Choose a PDF or image under 5 MB.");
      appendUploadFile(body, "file", evidence, file.name, file.mime);
    }
    return body;
  },
  response: absenceRequest,
});
export const downloadAbsenceEvidence = defineDownload({
  method: "GET",
  path: "/attendance/excuse-requests/:id/evidence",
  roles: ["guardian"],
});
