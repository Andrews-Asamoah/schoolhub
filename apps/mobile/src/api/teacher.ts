import { File } from "expo-file-system";
import { reportApprovalSchema, reportDataSchema } from "./report-preview";
import { z } from "zod";
import {
  batchAttendanceSchema,
  teacherPayslipSchema,
  createSchoolAssignmentSchema,
  publishAssignmentBatchSchema,
  saveAssessmentEntrySchema,
  submitAssessmentEntrySchema,
  requestMarkCorrectionSchema,
  importAssessmentMarksBatchSchema,
  STUDENT_IMPORT_LIMITS,
  addClubMemberSchema,
} from "@schoolhub/shared";
import { teacherSchedule } from "./teacher-workspace";
import { appendUploadFile, defineDownload, defineEndpoint } from "./endpoint";
const named = z.object({ id: z.string(), name: z.string() });
const profile = z.object({ firstName: z.string(), lastName: z.string() });
const optionalText = z.string().nullish();
const subject = named.extend({ code: z.string() });
export const teachingSchema = z.object({
  teacher: named.nullable(),
  term: named.nullable(),
  classes: z.array(
    named.extend({
      level: z.string(),
      isClassTeacher: z.boolean(),
      studentCount: z.number(),
      subjects: z.array(subject),
    }),
  ),
});
export type Teaching = z.infer<typeof teachingSchema>;
export const getTeaching = defineEndpoint({
  method: "GET",
  path: "/teaching/me",
  roles: ["teacher"],
  response: teachingSchema,
});
export const getTeacherPayslips = defineEndpoint({
  method: "GET",
  path: "/finance/me/payslips",
  roles: ["teacher"],
  response: z.array(teacherPayslipSchema),
});
export const shareTeacherPayslip = defineDownload({
  method: "GET",
  path: "/finance/me/payslips/:payslipId/pdf",
  roles: ["teacher"],
});
export const getTeacherTimetable = defineEndpoint({
  method: "GET",
  path: "/timetable/mine",
  roles: ["teacher"],
  response: teacherSchedule,
});
export const getRoster = defineEndpoint({
  method: "GET",
  path: "/academics/classes/:id/students",
  roles: ["teacher"],
  response: z.array(
    z.object({
      id: z.string(),
      admissionNumber: z.string().nullable(),
      profile,
    }),
  ),
});
export const getTeacherStudent = defineEndpoint({
  method: "GET",
  path: "/students/:id/profile",
  roles: ["teacher"],
  response: z.object({
    id: z.string(),
    admissionNumber: z.string().nullable(),
    status: z.string(),
    profile: profile.extend({ otherNames: optionalText, image: optionalText }),
    class: named.nullable(),
    house: named.nullable(),
    department: named.nullish(),
  }),
});
export const getTeacherStudentRecords = defineEndpoint({
  method: "GET",
  path: "/students/:id/profile",
  roles: ["teacher"],
  response: z.object({
    admissionNumber: z.string().nullable(),
    username: optionalText,
    loginEmail: optionalText,
    admissionDate: optionalText,
    previousSchool: optionalText,
    health: z
      .object({
        bloodGroup: optionalText,
        allergies: optionalText,
        medicalConditions: optionalText,
      })
      .optional(),
    guardians: z
      .array(
        named.extend({
          relationshipType: z.string(),
          isPrimary: z.boolean(),
          phone: optionalText,
          email: optionalText,
        }),
      )
      .optional(),
    profile: profile.extend({
      dateOfBirth: optionalText,
      gender: optionalText,
      nationality: optionalText,
      residentialAddress: optionalText,
      city: optionalText,
      region: optionalText,
      email: optionalText,
      emergencyContactName: optionalText,
      emergencyContactPhone: optionalText,
      emergencyRelationship: optionalText,
    }),
  }),
});
export const getTeacherStudentSubjects = defineEndpoint({
  method: "GET",
  path: "/students/:id/subjects",
  roles: ["teacher"],
  response: z.object({
    subjects: z.array(
      z.object({
        subjectId: z.string(),
        name: z.string(),
        teacherName: z.string().nullable(),
      }),
    ),
  }),
});
export const getTeacherStudentAttendance = defineEndpoint({
  method: "GET",
  path: "/attendance/student/:studentId",
  roles: ["teacher"],
  response: z.object({
    summary: z.record(z.string(), z.number()),
    attendanceRate: z.number().nullable(),
    recordedDays: z.number(),
    missingDates: z.array(z.string()),
  }),
});
export const registerSchema = z.array(
  z.object({
    studentId: z.string(),
    admissionNumber: z.string().nullable(),
    name: z.string(),
    attendance: z
      .object({
        status: z.enum([
          "PRESENT",
          "ABSENT",
          "LATE",
          "EXCUSED",
          "SICK",
          "PERMISSION",
        ]),
        remarks: z.string().nullable(),
      })
      .nullable(),
  }),
);
export type Register = z.infer<typeof registerSchema>;
export type AttendanceStatus = NonNullable<
  Register[number]["attendance"]
>["status"];
export const getRegister = defineEndpoint({
  method: "GET",
  path: "/attendance/class/:classId",
  roles: ["teacher"],
  response: registerSchema,
});
export const getRegisterDates = defineEndpoint({
  method: "GET",
  path: "/attendance/class/:classId/dates",
  roles: ["teacher"],
  response: z.array(z.string()),
});
export const gapsSchema = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      missing: z.number(),
      expected: z.number(),
      historical: z.boolean(),
    }),
  ),
  missingMarks: z.number(),
  incompleteDays: z.number(),
  policyMode: z.string(),
});
export const getRegisterGaps = defineEndpoint({
  method: "GET",
  path: "/attendance/class/:classId/gaps",
  roles: ["teacher"],
  response: gapsSchema,
});
export const calendarSchema = z.object({
  term: z.object({
    id: z.string(),
    startDate: z.string(),
    endDate: z.string(),
  }),
  isoWeekdays: z.array(z.number()),
  days: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      isInstructional: z.boolean(),
    }),
  ),
});
export type RegisterCalendar = z.infer<typeof calendarSchema>;
export const getRegisterCalendar = defineEndpoint({
  method: "GET",
  path: "/attendance/calendar/:termId",
  roles: ["teacher"],
  response: calendarSchema,
});
export const saveRegister = defineEndpoint({
  method: "POST",
  path: "/attendance/batch",
  roles: ["teacher"],
  idempotent: true,
  request: batchAttendanceSchema,
  response: z.object({
    success: z.boolean(),
    count: z.number(),
    date: z.string(),
    replayed: z.boolean().optional(),
  }),
});
export const assessmentSheetSchema = z.object({
  class: named,
  subject: named,
  term: named,
  templates: z.array(named),
  template: named
    .extend({
      components: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          maxMarks: z.number(),
          slots: z.number().int().positive(),
          canEdit: z.boolean().optional(),
          canCorrect: z.boolean().optional(),
          subjectStrandName: z.string().nullish(),
        }),
      ),
      grades: z
        .array(
          z.object({ grade: z.string(), description: z.string().nullable() }),
        )
        .optional(),
    })
    .nullable(),
  canEdit: z.boolean(),
  canSubmit: z.boolean().optional(),
  canRequestCorrection: z.boolean().optional(),
  pendingCorrection: z.object({ id: z.string() }).nullish(),
  submission: z.object({ submittedAt: z.string() }).nullish(),
  readOnlyReason: z.string().nullable(),
  students: z.array(
    z.object({
      studentId: z.string(),
      admissionNumber: z.string().nullish(),
      name: z.string(),
      marks: z.array(
        z.object({
          componentId: z.string(),
          occurrenceIndex: z.number(),
          marks: z.number(),
        }),
      ),
      complete: z.boolean().optional(),
      excused: z.boolean().optional(),
      percentage: z.number().nullable(),
      grade: z.string().nullable(),
    }),
  ),
});
export type AssessmentSheet = z.infer<typeof assessmentSheetSchema>;
export const getTeacherAssessment = defineEndpoint({
  method: "GET",
  path: "/assessments/entry",
  roles: ["teacher"],
  response: assessmentSheetSchema,
});
export const saveTeacherAssessment = defineEndpoint({
  method: "PUT",
  path: "/assessments/entry",
  roles: ["teacher"],
  request: saveAssessmentEntrySchema,
  response: assessmentSheetSchema,
});
export const submitTeacherAssessment = defineEndpoint({
  method: "POST",
  path: "/assessments/entry/submit",
  roles: ["teacher"],
  request: submitAssessmentEntrySchema,
  response: assessmentSheetSchema,
});
export const requestTeacherMarkCorrection = defineEndpoint({
  method: "POST",
  path: "/assessments/corrections",
  roles: ["teacher"],
  request: requestMarkCorrectionSchema,
  response: z.object({ id: z.string(), applied: z.boolean() }),
});
export const getTeacherTemplates = defineEndpoint({
  method: "GET",
  path: "/assessments/templates",
  roles: ["teacher"],
  response: z.array(named),
});
export const getTeacherStudentReport = defineEndpoint({
  method: "GET",
  path: "/assessments/student/:studentId/report",
  roles: ["teacher"],
  response: z.object({
    scores: z.array(
      z.object({
        id: z.string(),
        subject: named,
        percentage: z.coerce.number().nullable(),
        totalScore: z.coerce.number().nullable(),
      }),
    ),
  }),
});
export const recommendationSchema = z.object({
  remark: z.string().trim().min(10).max(2000),
});
const reviewSchema = z.object({
  id: z.string(),
  stage: z.string(),
  teacherRemark: z.string().nullable(),
  draftRemark: z.string().nullish(),
});
export const getTeacherReportQueue = defineEndpoint({
  method: "GET",
  path: "/assessments/report-cards/teacher-queue",
  roles: ["teacher"],
  response: z.array(
    reviewSchema.extend({
      student: z.object({ profile }),
      set: z.object({ name: z.string(), term: z.object({ name: z.string() }) }),
      subjects: z.array(
        z.object({
          name: z.string(),
          grade: z.string().nullable(),
          percentage: z.number().nullable(),
        }),
      ),
    }),
  ),
});
export const recommendTeacherReport = defineEndpoint({
  method: "POST",
  path: "/assessments/report-cards/versions/:id/recommend",
  roles: ["teacher"],
  request: recommendationSchema,
  response: z.object({ id: z.string(), stage: z.string() }),
});
export const createAssignmentSchema = createSchoolAssignmentSchema;
export const gradeAssignmentSchema = z.object({
  score: z.number().finite().min(0).max(100000),
  feedback: z.string().trim().max(2000).nullable().optional(),
});
export const managedAssignmentsSchema = z.object({
  academicYear: named.optional(),
  term: named,
  assignments: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      instructions: z.string(),
      dueAt: z.string().nullable(),
      maxScore: z.number(),
      status: z.string(),
      class: named,
      subject: named,
      submissions: z.array(
        z.object({
          id: z.string(),
          responseText: z.string(),
          status: z.string(),
          score: z.number().nullable(),
          feedback: z.string().nullable(),
          submittedAt: z.string().optional(),
          gradedBy: named.nullish(),
          student: z.object({
            id: z.string(),
            profile,
            admissionNumber: z.string().nullish(),
            studentId: z.string().optional(),
          }),
        }),
      ),
    }),
  ),
});
export const getManagedAssignments = defineEndpoint({
  method: "GET",
  path: "/assignments/manage",
  roles: ["teacher"],
  response: managedAssignmentsSchema,
});
export const createTeacherAssignment = defineEndpoint({
  method: "POST",
  path: "/assignments",
  roles: ["teacher"],
  request: createAssignmentSchema,
  response: z.object({ id: z.string() }),
});
export const publishTeacherAssignments = defineEndpoint({
  method: "POST",
  path: "/assignments/batch",
  roles: ["teacher"],
  request: publishAssignmentBatchSchema,
  response: z.object({
    assignments: z.array(z.object({ id: z.string(), classId: z.string() })),
  }),
});
export const gradeTeacherAssignment = defineEndpoint({
  method: "PATCH",
  path: "/assignments/:id/submissions/:submissionId/grade",
  roles: ["teacher"],
  request: gradeAssignmentSchema,
  response: z.object({ id: z.string(), status: z.string() }),
});
export const getTeacherClubs = defineEndpoint({
  method: "GET",
  path: "/academics/clubs",
  roles: ["teacher"],
  response: z.array(
    named.extend({ isActive: z.boolean(), description: z.string().nullable() }),
  ),
});
export const getTeacherClub = defineEndpoint({
  method: "GET",
  path: "/academics/clubs/:id",
  roles: ["teacher"],
  response: named.extend({
    members: z.array(
      z.object({
        id: z.string(),
        role: z.string(),
        student: z.object({ id: z.string(), profile }),
      }),
    ),
  }),
});
export const addTeacherClubMember = defineEndpoint({
  method: "POST",
  path: "/academics/clubs/:id/members",
  roles: ["teacher"],
  request: addClubMemberSchema,
  response: z.object({ id: z.string() }),
});
export const removeTeacherClubMember = defineEndpoint({
  method: "DELETE",
  path: "/academics/clubs/:id/members/:studentId",
  roles: ["teacher"],
  response: z.object({ success: z.boolean() }),
});

export const saveTeacherReportDraft = defineEndpoint({
  method: "PUT",
  path: "/assessments/report-cards/versions/:id/draft",
  roles: ["teacher"],
  request: z.object({ remark: z.string().max(2000) }),
  response: z.object({ saved: z.boolean() }),
});
export const bulkRecommendTeacherReports = defineEndpoint({
  method: "POST",
  path: "/assessments/report-cards/versions/bulk-recommend",
  roles: ["teacher"],
  request: z.object({
    items: z
      .array(recommendationSchema.extend({ id: z.string() }))
      .min(1)
      .max(100),
  }),
  response: z.object({
    succeeded: z.number(),
    results: z.array(
      z.object({
        id: z.string(),
        ok: z.boolean(),
        error: z.string().optional(),
      }),
    ),
  }),
});
export const getTeacherReportPreview = defineEndpoint({
  method: "GET",
  path: "/assessments/report-cards/versions/:id/preview",
  roles: ["teacher"],
  response: z.object({
    pupil: z.object({ name: z.string() }),
    report: reportDataSchema,
    approval: reportApprovalSchema,
  }),
});
export const getTeacherArchiveFilters = defineEndpoint({
  method: "GET",
  path: "/assessments/report-cards/archive/filters",
  roles: ["teacher"],
  response: z.object({
    years: z.array(named.extend({ terms: z.array(named) })),
    classes: z.array(named),
  }),
});
export const getTeacherArchive = defineEndpoint({
  method: "GET",
  path: "/assessments/report-cards/archive",
  roles: ["teacher"],
  response: z.object({
    total: z.number(),
    pageSize: z.number(),
    items: z.array(
      z.object({
        id: z.string(),
        pupilName: z.string(),
        setName: z.string(),
        academicYear: z.string(),
        term: z.string(),
        className: z.string().nullable(),
        hasPdf: z.boolean(),
      }),
    ),
  }),
});
export const downloadTeacherArchiveReport = defineDownload({
  method: "GET",
  path: "/assessments/report-cards/archive/:reportId/pdf",
  roles: ["teacher"],
});
export const getTeacherMockOptions = defineEndpoint({
  method: "GET",
  path: "/mock-analytics/options",
  roles: ["teacher"],
  response: z.object({
    years: z.array(named),
    classes: z.array(named.extend({ yearIds: z.array(z.string()) })),
  }),
});
export const getTeacherMockAnalysis = defineEndpoint({
  method: "GET",
  path: "/mock-analytics",
  roles: ["teacher"],
  response: z.object({
    subjectsLimited: z.boolean(),
    mocks: z.array(
      named.extend({
        classAverage: z.number().nullable(),
        sat: z.number(),
        atRisk: z.number(),
      }),
    ),
    subjects: z.array(
      z.object({
        subjectId: z.string(),
        name: z.string(),
        points: z.array(
          z.object({ mockId: z.string(), average: z.number().nullable() }),
        ),
      }),
    ),
    students: z.array(
      named.extend({
        latestAverage: z.number().nullable(),
        status: z.string().nullable(),
        trend: z.string(),
        series: z.array(
          z.object({ mockId: z.string(), average: z.number().nullable() }),
        ),
      }),
    ),
  }),
});

const importRowSchema = importAssessmentMarksBatchSchema.shape.rows.element;
export const previewTeacherMarksImport = defineEndpoint({
  method: "POST",
  path: "/assessments/entry/import/preview",
  roles: ["teacher"],
  request: z.object({ uri: z.string(), name: z.string() }),
  multipart: ({ uri, name }) => {
    const file = new File(uri);
    if (
      !file.exists ||
      !file.size ||
      file.size > STUDENT_IMPORT_LIMITS.maxFileBytes
    )
      throw new Error("Choose a CSV or Excel file of 2 MB or smaller.");
    const mime = name.toLowerCase().endsWith(".csv")
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const body = new FormData();
    appendUploadFile(body, "file", file, name, mime);
    return body;
  },
  response: z.object({
    notices: z.array(z.string()),
    rows: z.array(
      z.object({
        rowNumber: z.number(),
        name: z.string(),
        status: z.enum(["ready", "update", "unchanged", "duplicate", "error"]),
        errors: z.array(z.string()),
        detail: z.string(),
        row: importRowSchema.shape.row.nullable(),
      }),
    ),
  }),
});
export const applyTeacherMarksImport = defineEndpoint({
  method: "POST",
  path: "/assessments/entry/import",
  roles: ["teacher"],
  request: importAssessmentMarksBatchSchema,
  response: z.object({
    results: z.array(
      z.object({
        rowNumber: z.number(),
        status: z.enum(["created", "updated", "failed"]),
        message: z.string().optional(),
      }),
    ),
  }),
});
