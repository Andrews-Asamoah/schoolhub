import { z } from "zod";

// ============================================================================
// ROLES & ACCESS
// ============================================================================

export const ROLES = [
  "owner",
  "admin",
  "headmistress",
  "teacher",
  "accountant",
  "staff",
  "student",
  "guardian",
] as const;
export type Role = (typeof ROLES)[number];

// ============================================================================
// STUDENT SCHEMAS
// ============================================================================

export const studentGuardianSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  otherNames: z.string().trim().max(100).optional(),
  phone: z.string().trim().min(5).max(30),
  alternatePhone: z.string().trim().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  relationshipType: z.enum([
    "FATHER",
    "MOTHER",
    "GUARDIAN",
    "SIBLING",
    "RELATIVE",
    "OTHER",
  ]),
  occupation: z.string().trim().max(100).optional(),
  employer: z.string().trim().max(100).optional(),
  residentialAddress: z.string().trim().max(250).optional(),
  city: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  isPrimary: z.boolean(),
});
export type StudentGuardianInput = z.infer<typeof studentGuardianSchema>;

export const createStudentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  otherNames: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).default("MALE"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  departmentId: z.string().optional(),
  houseId: z.string().optional(),
  nationality: z.string().default("Ghanaian"),
  residentialAddress: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyRelationship: z.string().optional(),
  bloodGroup: z.string().optional(),
  allergies: z.string().optional(),
  medicalConditions: z.string().optional(),
  guardians: z
    .array(studentGuardianSchema)
    .max(10, "A student can have up to 10 guardians")
    .default([])
    .refine(
      (guardians) =>
        guardians.length === 0 ||
        guardians.filter((guardian) => guardian.isPrimary).length === 1,
      "Choose exactly one primary guardian.",
    ),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema
  .omit({ guardians: true })
  .partial();
export const updateStudentRecordSchema = updateStudentSchema.extend({
  status: z
    .enum([
      "ACTIVE",
      "GRADUATED",
      "WITHDRAWN",
      "SUSPENDED",
      "TRANSFERRED",
      "EXPELLED",
      "DECEASED",
    ])
    .optional(),
});
export type UpdateStudentInput = z.infer<typeof updateStudentRecordSchema>;

export const createTeacherSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  teacherId: z.string().trim().max(40).optional(),
  staffNumber: z.string().trim().max(40).optional(),
  invitationEmail: z.string().email().optional().or(z.literal("")),
  departmentId: z.string().min(1),
  qualification: z.string().trim().max(150).optional(),
  specialization: z.string().trim().max(150).optional(),
  experience: z.number().int().min(0).max(70).optional(),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERN"])
    .default("FULL_TIME"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

export const createStaffSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email(),
  phone: z.string().trim().min(5).max(30),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().trim().max(40).optional(),
  staffNumber: z.string().trim().max(40).optional(),
  staffType: z.enum([
    "ACCOUNTANT",
    "HEADTEACHER",
    "ADMIN",
    "LIBRARIAN",
    "DRIVER",
    "SECURITY",
    "NURSE",
    "COUNSELOR",
    "IT_SUPPORT",
    "RECEPTIONIST",
    "COOK",
    "CLEANER",
    "OTHER",
  ]),
  departmentId: z.string().optional(),
  jobTitle: z.string().trim().max(100).optional(),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERN"])
    .default("FULL_TIME"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const createGuardianSchema = studentGuardianSchema
  .omit({ isPrimary: true })
  .extend({
    studentIds: z.array(z.string().min(1)).max(100).default([]),
  });
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;

export const updatePeopleStatusSchema = z.object({
  isActive: z.boolean(),
});
export type UpdatePeopleStatusInput = z.infer<typeof updatePeopleStatusSchema>;

// ============================================================================
// ACADEMIC & CLASS SCHEMAS
// ============================================================================

export const createClassSchema = z.object({
  name: z.string().trim().min(1, "Class name is required").max(100),
  level: z.string().trim().min(1, "Class level is required").max(60),
  capacity: z.number().int().positive().optional(),
  departmentId: z.string().min(1, "Department is required"),
  isGraduatingClass: z.boolean().default(false),
  isActive: z.boolean().default(true),
  order: z.number().int().optional(),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = createClassSchema
  .extend({
    capacity: z.number().int().positive().nullable().optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one class field to update",
  });
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const createClassTeacherAssignmentSchema = z.object({
  teacherId: z.string().min(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});
export type CreateClassTeacherAssignmentInput = z.infer<
  typeof createClassTeacherAssignmentSchema
>;

export const createEnrollmentSchema = z
  .object({
    studentIds: z.array(z.string().min(1)).min(1).max(100),
    classId: z.string().min(1),
    academicYearId: z.string().min(1),
    termId: z.string().min(1),
  })
  .refine(
    (value) => new Set(value.studentIds).size === value.studentIds.length,
    {
      message: "Each student can only be selected once",
      path: ["studentIds"],
    },
  );
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, "Enter a department name").max(100),
  code: z
    .string()
    .trim()
    .min(2, "Enter a department code")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Use only letters, numbers, and hyphens")
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(500).optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const createSubjectSchema = z.object({
  name: z.string().min(1, "Subject name is required"),
  code: z.string().min(1, "Subject code is required"),
  description: z.string().optional(),
  periodsPerWeek: z.number().int().min(1).default(4),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const createAcademicYearSchema = z
  .object({
    name: z.string().min(1, "Academic year name is required (e.g. 2025/2026)"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
    isCurrent: z.boolean().default(false),
    terms: z
      .array(
        z.object({
          name: z.string().trim().min(2).max(60),
          termNumber: z.number().int().min(1).max(3),
          startDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
          endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
          isCurrent: z.boolean().default(false),
        }),
      )
      .max(3)
      .optional(),
  })
  .superRefine((year, context) => {
    if (year.endDate <= year.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The academic year must end after it starts.",
      });
    }

    const termNumbers = new Set<number>();
    const orderedTerms = (year.terms ?? [])
      .map((term, index) => ({ term, index }))
      .sort((first, second) =>
        first.term.startDate.localeCompare(second.term.startDate),
      );

    orderedTerms.forEach(({ term, index }, orderedIndex) => {
      if (term.endDate <= term.startDate) {
        context.addIssue({
          code: "custom",
          path: ["terms", index, "endDate"],
          message: "The term must end after it starts.",
        });
      }
      if (term.startDate < year.startDate || term.endDate > year.endDate) {
        context.addIssue({
          code: "custom",
          path: ["terms", index, "startDate"],
          message: "Term dates must fall within the academic year.",
        });
      }
      if (termNumbers.has(term.termNumber)) {
        context.addIssue({
          code: "custom",
          path: ["terms", index, "termNumber"],
          message: "Each term must have a unique number.",
        });
      }
      termNumbers.add(term.termNumber);

      const previousTerm = orderedTerms[orderedIndex - 1]?.term;
      if (previousTerm && term.startDate <= previousTerm.endDate) {
        context.addIssue({
          code: "custom",
          path: ["terms", index, "startDate"],
          message: "Terms cannot overlap.",
        });
      }
    });

    if ((year.terms ?? []).filter((term) => term.isCurrent).length > 1) {
      context.addIssue({
        code: "custom",
        path: ["terms"],
        message: "Only one term can be current.",
      });
    }
  });
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

export const setAcademicContextSchema = z.object({
  academicYearId: z.string().min(1),
  termId: z.string().min(1),
});
export type SetAcademicContextInput = z.infer<typeof setAcademicContextSchema>;

export const updateSchoolMemberRolesSchema = z.object({
  roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length),
});
export type UpdateSchoolMemberRolesInput = z.infer<
  typeof updateSchoolMemberRolesSchema
>;

// ============================================================================
// ATTENDANCE SCHEMAS
// ============================================================================

export const attendanceRecordSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum([
    "PRESENT",
    "ABSENT",
    "LATE",
    "EXCUSED",
    "SICK",
    "PERMISSION",
  ]),
  remarks: z.string().optional(),
});

export const batchAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  records: z
    .array(attendanceRecordSchema)
    .min(1, "At least one record is required"),
});
export type BatchAttendanceInput = z.infer<typeof batchAttendanceSchema>;

// ============================================================================
// ASSESSMENT & SCORING SCHEMAS
// ============================================================================

export const recordScoreSchema = z.object({
  studentId: z.string().min(1),
  subjectId: z.string().min(1),
  termId: z.string().min(1),
  templateId: z.string().min(1),
  componentId: z.string().min(1),
  marksObtained: z.number().min(0),
  maxMarks: z.number().min(0),
  occurrenceIndex: z.number().int().default(0),
});
export type RecordScoreInput = z.infer<typeof recordScoreSchema>;

// ============================================================================
// FINANCE & BILLING SCHEMAS
// ============================================================================

export const recordPaymentSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  billId: z.string().optional(),
  amount: z.number().positive("Amount must be greater than zero"),
  paymentMethod: z.enum([
    "CASH",
    "BANK_TRANSFER",
    "CHEQUE",
    "MOBILE_MONEY",
    "CARD",
    "ONLINE",
    "OTHER",
  ]),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const generateBillSchema = z.object({
  academicYearId: z.string().min(1),
  termId: z.string().optional(),
  feeStructureId: z.string().min(1),
  classId: z.string().optional(),
  studentId: z.string().optional(), // if targeting single student
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().optional(),
});
export type GenerateBillInput = z.infer<typeof generateBillSchema>;

// ============================================================================
// SUPER ADMIN SCHEMAS
// ============================================================================

export const enrollSchoolSchema = z.object({
  // School details
  schoolName: z.string().min(2),
  schoolCode: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, "Uppercase letters, numbers, hyphens only"),
  schoolEmail: z.string().email().optional(),
  schoolPhone: z.string().optional(),
  schoolAddress: z.string().optional(),
  subdomain: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  region: z.string().optional(),

  // Admin account
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
});
export type EnrollSchoolInput = z.infer<typeof enrollSchoolSchema>;

export const updateSchoolSchema = z.object({
  schoolName: z.string().min(2),
  schoolCode: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, "Uppercase letters, numbers, hyphens only"),
  subdomain: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  schoolEmail: z.union([z.string().email(), z.literal("")]).optional(),
  schoolPhone: z.string().optional(),
  schoolAddress: z.string().optional(),
});
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;

export const addSchoolAdminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});
export type AddSchoolAdminInput = z.infer<typeof addSchoolAdminSchema>;

export const setSchoolAdminBannedSchema = z.object({
  banned: z.boolean(),
});
export type SetSchoolAdminBannedInput = z.infer<
  typeof setSchoolAdminBannedSchema
>;

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(10000),
  category: z.string().trim().min(2).max(60),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});
export type CreateSupportTicketInput = z.infer<
  typeof createSupportTicketSchema
>;

export const supportTicketReplySchema = z.object({
  message: z.string().trim().min(2).max(10000),
});
export type SupportTicketReplyInput = z.infer<typeof supportTicketReplySchema>;

export const updateSupportTicketSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
});
export type UpdateSupportTicketInput = z.infer<
  typeof updateSupportTicketSchema
>;

export const updateSubscriptionSchema = z.object({
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "SUSPENDED"]),
  expiresAt: z.string().optional(),
});
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
