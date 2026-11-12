import { z } from "zod";
import { defineDownload, defineEndpoint } from "./endpoint";

const nullableText = z.string().nullable();

export const studentProfileSchema = z.object({
  profile: z.object({ firstName: z.string(), lastName: z.string() }),
  class: z.object({ name: z.string() }).nullable(),
  house: z.object({ name: z.string() }).nullable(),
});
export type StudentProfile = z.infer<typeof studentProfileSchema>;

export const getMyStudentProfile = defineEndpoint({
  method: "GET",
  path: "/students/me",
  roles: ["student"],
  response: studentProfileSchema,
});

export const studentFeeStatusSchema = z.object({
  status: z.enum(["FULLY_PAID", "PARTIALLY_PAID", "YET_TO_PAY", "UNKNOWN"]),
  label: z.string(),
  description: z.string(),
  clearanceAllowed: z.boolean(),
  arrearsPolicy: z.enum(["SHOW_ONLY", "BLOCK_CLEARANCE_UNTIL_PAID"]),
  academicYear: nullableText,
  term: nullableText,
});
export const getMyFeeStatus = defineEndpoint({
  method: "GET",
  path: "/students/me/fee-status",
  roles: ["student"],
  response: studentFeeStatusSchema,
});

const subjectSchema = z.object({
  subjectId: z.string(),
  name: z.string(),
  code: z.string(),
  periodsPerWeek: z.number().nullable().optional(),
  isCompulsory: z.boolean(),
  teacherName: nullableText,
});
export const studentSubjectsSchema = z.object({
  class: z
    .object({
      id: z.string(),
      name: z.string(),
      level: z.string().nullable().optional(),
    })
    .nullable(),
  subjects: z.array(subjectSchema),
});
export const getMySubjects = defineEndpoint({
  method: "GET",
  path: "/students/me/subjects",
  roles: ["student"],
  response: studentSubjectsSchema,
});

const classmateSchema = z.object({
  id: z.string(),
  isSelf: z.boolean(),
  name: z.string(),
  house: z.string(),
});
export const studentClassmatesSchema = z.object({
  class: z
    .object({
      id: z.string(),
      name: z.string(),
      level: z.string().nullable().optional(),
    })
    .nullable(),
  classmates: z.array(classmateSchema),
});
export const getMyClassmates = defineEndpoint({
  method: "GET",
  path: "/students/me/classmates",
  roles: ["student"],
  response: studentClassmatesSchema,
});

const studentClubSchema = z.object({
  membershipId: z.string(),
  role: z.string(),
  joinedAt: z.string(),
  club: z.object({
    id: z.string(),
    name: z.string(),
    description: nullableText,
    isActive: z.boolean(),
    _count: z.object({ members: z.number() }).optional(),
  }),
});
export const getMyClubs = defineEndpoint({
  method: "GET",
  path: "/students/me/clubs",
  roles: ["student"],
  response: z.array(studentClubSchema),
});

const timetableSchema = z.object({
  class: z
    .object({
      id: z.string(),
      name: z.string(),
      level: z.string().nullable().optional(),
    })
    .nullable(),
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
export const getMyTimetable = defineEndpoint({
  method: "GET",
  path: "/timetable/me",
  roles: ["student"],
  response: timetableSchema,
});

const attendanceSchema = z.object({
  summary: z.record(z.string(), z.number()),
  totalDays: z.number(),
  recordedDays: z.number(),
  possibleDays: z.number().nullable(),
  unmarkedDays: z.number().nullable(),
  missingDates: z.array(z.string()),
  attendanceRate: z.number().nullable(),
  provisionalRate: z.number().nullable(),
  coverageRate: z.number().nullable(),
  policyMode: z.string(),
  policyActiveFrom: nullableText,
  isComplete: z.boolean(),
  academicYear: z.object({ id: z.string(), name: z.string() }),
  term: z.object({ id: z.string(), name: z.string() }),
  recentRecords: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      status: z.string(),
      remarks: nullableText,
    }),
  ),
});
export const getMyAttendance = defineEndpoint({
  method: "GET",
  path: "/attendance/me",
  roles: ["student"],
  response: attendanceSchema,
});

const submissionSchema = z.object({
  id: z.string(),
  responseText: z.string(),
  status: z.string(),
  score: z.number().nullable(),
  feedback: nullableText,
  submittedAt: z.string(),
  gradedAt: z.string().nullable(),
});
const assignmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  instructions: z.string(),
  dueAt: z.string().nullable(),
  maxScore: z.number(),
  status: z.string(),
  createdAt: z.string(),
  subject: z.object({ id: z.string(), name: z.string(), code: z.string() }),
  teacher: z.object({ id: z.string(), name: z.string() }),
  submission: submissionSchema.nullable(),
});
export type StudentAssignment = z.infer<typeof assignmentSchema>;
export const studentAssignmentsSchema = z.object({
  class: z
    .object({
      id: z.string(),
      name: z.string(),
      level: z.string().nullable().optional(),
    })
    .nullable(),
  academicYear: z.object({ id: z.string(), name: z.string() }).nullable(),
  term: z.object({ id: z.string(), name: z.string() }).nullable(),
  assignments: z.array(assignmentSchema),
});
export const listMyAssignments = defineEndpoint({
  method: "GET",
  path: "/assignments",
  roles: ["student"],
  response: studentAssignmentsSchema,
});

const submissionResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  responseText: z.string(),
  submittedAt: z.string(),
});
export const submitAssignmentSchema = z.object({
  responseText: z
    .string()
    .trim()
    .min(1, "Write your response before submitting.")
    .max(20_000),
});
export const submitMyAssignment = defineEndpoint({
  method: "POST",
  path: "/assignments/:id/submission",
  roles: ["student"],
  request: submitAssignmentSchema,
  response: submissionResponseSchema,
});

const assessmentReportSchema = z.object({
  academicYear: z.object({
    id: z.string(),
    name: z.string(),
    isCurrent: z.boolean(),
  }),
  class: z.object({
    id: z.string(),
    name: z.string(),
    level: z.string().nullable().optional(),
  }),
  scores: z.array(
    z.object({
      id: z.string(),
      subject: z.object({ id: z.string(), name: z.string(), code: z.string() }),
      totalScore: z.coerce.number().nullable(),
      percentage: z.coerce.number().nullable(),
      componentScores: z.array(
        z.object({
          marksObtained: z.coerce.number(),
          maxMarks: z.coerce.number(),
          component: z.object({ name: z.string() }),
        }),
      ),
    }),
  ),
});
export const getMyAssessmentReport = defineEndpoint({
  method: "GET",
  path: "/assessments/me/report",
  roles: ["student"],
  response: assessmentReportSchema,
});

const publishedReportSchema = z.object({
  id: z.string(),
  publishedAt: z.string(),
  pdfAvailable: z.boolean(),
  set: z.object({
    name: z.string(),
    academicYear: z.object({ name: z.string() }),
    term: z.object({
      name: z.string(),
      termNumber: z.number().nullable().optional(),
    }),
  }),
});
export const listMyPublishedReports = defineEndpoint({
  method: "GET",
  path: "/assessments/report-cards/me",
  roles: ["student"],
  response: z.array(publishedReportSchema),
});
export const downloadMyReport = defineDownload({
  method: "GET",
  path: "/assessments/report-cards/me/:reportId/pdf",
  roles: ["student"],
});

export const getSchoolHousesForStudents = defineEndpoint({
  method: "GET",
  path: "/academics/houses",
  roles: ["student"],
  response: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: nullableText.optional(),
      _count: z.object({ students: z.number() }).optional(),
    }),
  ),
});
export const getSchoolClubsForStudents = defineEndpoint({
  method: "GET",
  path: "/academics/clubs",
  roles: ["student"],
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
