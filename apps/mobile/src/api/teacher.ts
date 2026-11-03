import { z } from "zod";
import {
  batchAttendanceSchema,
  saveAssessmentEntrySchema,
  addClubMemberSchema,
} from "@schoolhub/shared";
import { defineEndpoint } from "./endpoint";
const named = z.object({ id: z.string(), name: z.string() });
const profile = z.object({ firstName: z.string(), lastName: z.string() });
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
export const getTeacherClasses = defineEndpoint({
  method: "GET",
  path: "/academics/classes",
  roles: ["teacher"],
  response: z.array(named),
});
export const getTeacherTimetable = defineEndpoint({
  method: "GET",
  path: "/timetable/mine",
  roles: ["teacher"],
  response: z.object({
    entries: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        label: z.string().nullable(),
        dayOfWeek: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        class: named.nullable(),
        subject: named.nullable(),
        classroom: named.nullable(),
      }),
    ),
  }),
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
    profile,
    class: named.nullable(),
    house: named.nullable(),
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
  request: batchAttendanceSchema,
  response: z.object({
    success: z.boolean(),
    count: z.number(),
    date: z.string(),
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
        }),
      ),
    })
    .nullable(),
  canEdit: z.boolean(),
  readOnlyReason: z.string().nullable(),
  students: z.array(
    z.object({
      studentId: z.string(),
      name: z.string(),
      marks: z.array(
        z.object({
          componentId: z.string(),
          occurrenceIndex: z.number(),
          marks: z.number(),
        }),
      ),
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
export const createAssignmentSchema = z.object({
  classId: z.string().trim().min(1).max(100),
  subjectId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(3).max(160),
  instructions: z.string().trim().min(1).max(10000),
  dueAt: z.string().datetime().nullable().optional(),
  maxScore: z.number().finite().positive().max(100000),
});
export const gradeAssignmentSchema = z.object({
  score: z.number().finite().min(0).max(100000),
  feedback: z.string().trim().max(2000).nullable().optional(),
});
export const managedAssignmentsSchema = z.object({
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
          student: z.object({ id: z.string(), profile }),
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
