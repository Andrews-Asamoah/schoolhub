import { z } from "zod";
import { defineEndpoint } from "./endpoint";

const named = z.object({ id: z.string(), name: z.string() });
const counts = z.array(z.object({ label: z.string(), value: z.number() }));
const page = z.object({ page: z.number(), totalPages: z.number() });

export const listTeacherStudents = defineEndpoint({
  method: "GET",
  path: "/students",
  roles: ["teacher"],
  response: z.object({
    data: z.array(
      z.object({
        id: z.string(),
        admissionNumber: z.string().nullable(),
        status: z.string(),
        class: named.nullable(),
        profile: z.object({
          firstName: z.string(),
          lastName: z.string(),
          otherNames: z.string().nullish(),
          user: z.object({ image: z.string().nullable() }).nullish(),
        }),
      }),
    ),
    meta: page,
  }),
});

const assignment = z.object({
  classId: z.string(),
  className: z.string(),
  teacherName: z.string().nullable(),
});

export const listTeacherSubjects = defineEndpoint({
  method: "GET",
  path: "/subjects",
  roles: ["teacher"],
  response: z.array(
    named.extend({
      code: z.string(),
      description: z.string().nullable(),
      periodsPerWeek: z.number(),
      isActive: z.boolean(),
      classes: z.array(assignment),
      teachers: z.array(named),
      strands: z.array(
        named.extend({
          isActive: z.boolean(),
          assignments: z.array(assignment),
        }),
      ),
    }),
  ),
});

export const getTeacherSchoolReport = defineEndpoint({
  method: "GET",
  path: "/dashboard/analytics",
  roles: ["teacher"],
  response: z.object({
    generatedAt: z.string(),
    metrics: z.object({
      activeStudents: z.number(),
      activeTeachers: z.number(),
      newAdmissionsThisMonth: z.number(),
    }),
    genderDistribution: counts,
    enrollmentGrowth: z.array(
      z.object({
        month: z.string(),
        population: z.number(),
        newAdmissions: z.number(),
      }),
    ),
  }),
});

export const listTeacherTimetableOptions = defineEndpoint({
  method: "GET",
  path: "/timetable/setup",
  roles: ["teacher"],
  response: z.object({
    academicYear: named.nullable(),
    academicYears: z.array(named),
    classes: z.array(named),
    teachers: z.array(named),
    classrooms: z.array(named),
  }),
});

export const teacherSchedule = z.object({
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
      subjectStrand: named.nullish(),
      teacher: named.nullish(),
    }),
  ),
});

export const getSchoolTimetable = defineEndpoint({
  method: "GET",
  path: "/timetable",
  roles: ["teacher"],
  response: teacherSchedule,
});

export const listTeacherClasses = defineEndpoint({
  method: "GET",
  path: "/academics/classes",
  roles: ["teacher"],
  response: z.array(
    named.extend({
      level: z.string(),
      capacity: z.number().nullish(),
      isActive: z.boolean(),
      department: named.nullable(),
      classTeacher: z
        .object({
          profile: z
            .object({ firstName: z.string(), lastName: z.string() })
            .nullish(),
          firstName: z.string().nullish(),
          lastName: z.string().nullish(),
        })
        .nullable(),
      _count: z.object({ students: z.number() }),
    }),
  ),
});
