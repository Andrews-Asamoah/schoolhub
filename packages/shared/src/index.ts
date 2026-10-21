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
// PASSWORD POLICY & CREDENTIALS
// ============================================================================

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Password rules shared by the API (authoritative) and the web client
 * (instant feedback). Length matters most; the character-class rules keep
 * trivially weak choices such as "password12" out.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

/** Trimmed, lower-cased, validated email (uses the Zod 4 top-level `z.email()`). */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one",
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Returned exactly once by every endpoint that provisions or resets a login.
 * The temporary password is never stored in readable form and cannot be
 * retrieved again - only reset.
 */
export interface IssuedCredentials {
  /** Value to type into the "Email" box on the sign-in page. */
  loginEmail: string;
  /** Short ID a student may type instead of the full login email (their username). */
  loginId?: string;
  temporaryPassword: string;
  role: Role;
  mustChangePassword: true;
}

export const STUDENT_LOGIN_EMAIL_DOMAIN = "schoolhub.gh";

/** Deterministic, globally unique login email for a student account. */
export function studentLoginEmail(admissionNumber: string, schoolSubdomain: string) {
  return `${admissionNumber.trim().toLowerCase()}@students.${schoolSubdomain
    .trim()
    .toLowerCase()}.${STUDENT_LOGIN_EMAIL_DOMAIN}`;
}

/**
 * Free mail providers. A school that registered with one of these (e.g.
 * info@gmail.com) has no domain of its own, and many schools would share it,
 * so its students get an address under the platform domain instead.
 */
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
]);

/**
 * Domain part of a student's login email: "st." + the school's own email
 * domain. info@manaint.edu.gh  ->  st.manaint.edu.gh
 */
export function studentEmailDomain(
  schoolEmail: string | null | undefined,
  schoolSubdomain: string,
): string {
  const domain = schoolEmail?.split("@")[1]?.trim().toLowerCase();
  if (
    domain &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain) &&
    !PUBLIC_EMAIL_DOMAINS.has(domain)
  ) {
    return `st.${domain}`;
  }
  return `st.${schoolSubdomain.trim().toLowerCase()}.${STUDENT_LOGIN_EMAIL_DOMAIN}`;
}

const toLetters = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (e.g. é -> e)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Base username: first letter of the first name + "." + surname.
 * Andrews Asamoah -> a.asamoah. Returns null when a name has no usable letters.
 */
export function studentUsernameBase(firstName: string, surname: string): string | null {
  const initial = toLetters(firstName).replace(/[0-9]/g, "").charAt(0);
  const last = toLetters(surname);
  if (!initial || !last) return null;
  return `${initial}.${last}`;
}

/** Candidate usernames in order: a.asamoah, a.asamoah1, a.asamoah2, ... */
export function studentUsernameCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}${attempt}`;
}

export const CREDENTIAL_SUBJECT_KINDS = ["student", "teacher", "staff", "guardian"] as const;
export type CredentialSubjectKind = (typeof CREDENTIAL_SUBJECT_KINDS)[number];

// ============================================================================
// STUDENT SCHEMAS
// ============================================================================

export const studentGuardianSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  otherNames: z.string().trim().max(100).optional(),
  phone: z.string().trim().min(5).max(30),
  alternatePhone: z.string().trim().max(30).optional(),
  email: z.email().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  relationshipType: z.enum([
    "FATHER",
    "MOTHER",
    "GUARDIAN",
    "SIBLING",
    "GRANDFATHER",
    "GRANDMOTHER",
    "RELATIVE",
    "OTHER",
  ]),
  occupation: z.string().trim().max(100).optional(),
  employer: z.string().trim().max(100).optional(),
  residentialAddress: z.string().trim().max(250).optional(),
  city: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  isPrimary: z.boolean(),
  /** Create a parent-portal login. Requires an email address. */
  createLogin: z.boolean().default(false),
});
export type StudentGuardianInput = z.infer<typeof studentGuardianSchema>;

/**
 * A <select> that has nothing chosen posts "". Treat that (and whitespace) as
 * "not provided" so it never reaches the database as an invalid foreign key.
 */
export const optionalId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

export const createStudentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  otherNames: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).default("MALE"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  /** Department the student belongs to (must exist in this school). */
  departmentId: optionalId,
  /** Class to place the student in for the current (or given) term. */
  classId: optionalId,
  /** Optional: defaults to the school's current academic year / term. */
  academicYearId: optionalId,
  termId: optionalId,
  houseId: optionalId,
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

// Class placement is changed through enrollments (it is per term), not here.
export const updateStudentSchema = createStudentSchema
  .omit({ guardians: true, classId: true, academicYearId: true, termId: true })
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
  staffNumber: z.string().trim().max(40).optional(),
  /** Sign-in email. A login is always created for new teachers. */
  email: emailSchema,
  phone: z.string().trim().max(30).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
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
  email: emailSchema,
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

export const createHouseSchema = z.object({
  name: z.string().trim().min(2, "Enter a house name").max(100),
  code: z
    .string()
    .trim()
    .min(2, "Enter a house code")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Use only letters, numbers, and hyphens")
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Choose a valid hex color")
    .optional(),
  motto: z.string().trim().max(200).optional(),
  houseTeacherId: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type CreateHouseInput = z.infer<typeof createHouseSchema>;
export const updateHouseSchema = createHouseSchema.partial();
export type UpdateHouseInput = z.infer<typeof updateHouseSchema>;

export const createClubSchema = z.object({
  name: z.string().trim().min(2, "Enter a club name").max(100),
  description: z.string().trim().max(500).optional(),
  teacherInChargeId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});
export type CreateClubInput = z.infer<typeof createClubSchema>;
export const updateClubSchema = createClubSchema.partial();
export type UpdateClubInput = z.infer<typeof updateClubSchema>;

export const addClubMemberSchema = z.object({
  studentId: z.string().min(1, "Select a student"),
  role: z.string().trim().max(50).optional().nullable(),
});
export type AddClubMemberInput = z.infer<typeof addClubMemberSchema>;

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
  /**
   * Needed the first time someone is given the teacher role: a teacher record
   * (which carries a department) is created so they appear in class, subject
   * and timetable pickers.
   */
  teacherDepartmentId: z.string().min(1).optional(),
  /**
   * Needed the first time someone is given the guardian (parent) role and no
   * phone number is on file: a guardian record is created so they can be linked
   * to their children and use the parent portal.
   */
  guardianPhone: z.string().trim().min(7).max(30).optional(),
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

/** Save a batch of marks for one class and subject. `marks: null` clears a mark. */
export const saveAssessmentEntrySchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  templateId: z.string().min(1),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        componentId: z.string().min(1),
        occurrenceIndex: z.number().int().min(0).max(50).default(0),
        marks: z.number().min(0).max(10000).nullable(),
      }),
    )
    .min(1, "There are no marks to save")
    .max(5000),
});
export type SaveAssessmentEntryInput = z.infer<typeof saveAssessmentEntrySchema>;

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
  schoolEmail: z.email().optional(),
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
  adminEmail: emailSchema,
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
  schoolEmail: z.union([z.email(), z.literal("")]).optional(),
  schoolPhone: z.string().optional(),
  schoolAddress: z.string().optional(),
});
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;

export const addSchoolAdminSchema = z.object({
  name: z.string().min(2),
  email: emailSchema,
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

// ============================================================================
// EDITING PEOPLE RECORDS
// ============================================================================
// Update schemas list their fields explicitly (instead of `.partial()`) so
// that Zod defaults, such as employmentType = FULL_TIME, can never silently
// overwrite stored values when a field is simply left out of an edit.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const genderEnum = z.enum(["MALE", "FEMALE", "OTHER"]);
const employmentTypeEnum = z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERN"]);

export const updateTeacherSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  staffNumber: z.string().trim().max(40).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().max(30).optional(),
  gender: genderEnum.optional(),
  dateOfBirth: isoDate.optional().or(z.literal("")),
  departmentId: z.string().min(1).optional(),
  qualification: z.string().trim().max(150).optional(),
  specialization: z.string().trim().max(150).optional(),
  experience: z.number().int().min(0).max(70).optional(),
  employmentType: employmentTypeEnum.optional(),
  hireDate: isoDate.optional(),
});
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;

export const updateStaffSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  gender: genderEnum.optional(),
  dateOfBirth: isoDate.optional(),
  staffNumber: z.string().trim().max(40).optional(),
  staffType: createStaffSchema.shape.staffType.optional(),
  departmentId: z.string().optional(),
  jobTitle: z.string().trim().max(100).optional(),
  employmentType: employmentTypeEnum.optional(),
  hireDate: isoDate.optional(),
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const updateGuardianSchema = studentGuardianSchema
  .omit({ isPrimary: true, createLogin: true })
  .partial()
  .extend({
    /** Link this guardian to more students (existing links are kept). */
    addStudentIds: z.array(z.string().min(1)).max(50).optional(),
  });
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;

// ============================================================================
// ACADEMIC YEARS & TERMS (editing)
// ============================================================================

export const updateAcademicYearSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  isCurrent: z.boolean().optional(),
});
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;

export const createTermSchema = z.object({
  name: z.string().trim().min(2).max(60),
  termNumber: z.number().int().min(1).max(3),
  startDate: isoDate,
  endDate: isoDate,
  isCurrent: z.boolean().default(false),
});
export type CreateTermInput = z.infer<typeof createTermSchema>;

export const updateTermSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  isCurrent: z.boolean().optional(),
});
export type UpdateTermInput = z.infer<typeof updateTermSchema>;

// ============================================================================
// SUBJECTS (management)
// ============================================================================

export const subjectCodeSchema = z
  .string()
  .trim()
  .min(2, "Subject code is required")
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _")
  .transform((value) => value.toUpperCase());

export const saveSubjectSchema = z.object({
  name: z.string().trim().min(2, "Subject name is required").max(100),
  code: subjectCodeSchema,
  description: z.string().trim().max(500).optional(),
  periodsPerWeek: z.number().int().min(1).max(20),
  isActive: z.boolean().optional(),
});
export type SaveSubjectInput = z.infer<typeof saveSubjectSchema>;

export const setSubjectClassesSchema = z.object({
  assignments: z
    .array(
      z.object({
        classId: z.string().min(1),
        teacherId: z.string().min(1).nullable().optional(),
        isCompulsory: z.boolean().default(true),
      }),
    )
    .max(200),
});
export type SetSubjectClassesInput = z.infer<typeof setSubjectClassesSchema>;

export const setSubjectTeachersSchema = z.object({
  teacherIds: z.array(z.string().min(1)).max(200),
});
export type SetSubjectTeachersInput = z.infer<typeof setSubjectTeachersSchema>;

// ============================================================================
// TIMETABLE
// ============================================================================

export const TIMETABLE_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type TimetableDay = (typeof TIMETABLE_DAYS)[number];

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

export const savePeriodSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    startTime: clockTime,
    endTime: clockTime,
    sortOrder: z.number().int().min(0).max(100).optional(),
    /** Department the period belongs to. null/omitted = default periods for classes with no department. */
    departmentId: z.string().min(1).nullable().optional(),
  })
  .refine((period) => period.endTime > period.startTime, {
    path: ["endTime"],
    message: "A period must end after it starts.",
  });
export type SavePeriodInput = z.infer<typeof savePeriodSchema>;

/** Copy one department's periods to others. null from = the default (no-department) periods. */
export const copyPeriodsSchema = z
  .object({
    fromDepartmentId: z.string().min(1).nullable(),
    toDepartmentIds: z.array(z.string().min(1)).min(1, "Choose a department to copy to").max(30),
  })
  .refine((input) => !input.toDepartmentIds.includes(input.fromDepartmentId ?? ""), {
    path: ["toDepartmentIds"],
    message: "Choose departments other than the one you are copying from.",
  });
export type CopyPeriodsInput = z.infer<typeof copyPeriodsSchema>;

export const saveClassroomSchema = z.object({
  name: z.string().trim().min(1).max(60),
  capacity: z.number().int().positive().max(1000).optional(),
});
export type SaveClassroomInput = z.infer<typeof saveClassroomSchema>;

export const saveTimetableEntrySchema = z
  .object({
    classId: z.string().min(1, "Choose a class"),
    dayOfWeek: z.enum(TIMETABLE_DAYS),
    periodId: z.string().min(1, "Choose a period"),
    type: z.enum(["LESSON", "BREAK", "ACTIVITY"]).default("LESSON"),
    subjectId: z.string().min(1).optional(),
    teacherId: z.string().min(1).optional(),
    classroomId: z.string().min(1).optional(),
    label: z.string().trim().max(60).optional(),
  })
  .superRefine((entry, context) => {
    if (entry.type === "LESSON" && !entry.subjectId) {
      context.addIssue({ code: "custom", path: ["subjectId"], message: "Choose a subject for a lesson." });
    }
    if (entry.type !== "LESSON" && !entry.label) {
      context.addIssue({ code: "custom", path: ["label"], message: "Give this slot a label, e.g. Lunch." });
    }
  });
export type SaveTimetableEntryInput = z.infer<typeof saveTimetableEntrySchema>;

// ============================================================================
// ADMISSIONS (enrollment windows, applications, entrance exam, admission)
// ============================================================================

export const ADMISSION_CYCLE_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type AdmissionCycleStatus = (typeof ADMISSION_CYCLE_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "EXAM_SCHEDULED",
  "EXAM_COMPLETED",
  "ACCEPTED",
  "WAITLISTED",
  "REJECTED",
  "ADMITTED",
  "WITHDRAWN",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const GUARDIAN_RELATIONSHIPS = [
  "FATHER",
  "MOTHER",
  "GUARDIAN",
  "GRANDFATHER",
  "GRANDMOTHER",
  "SIBLING",
  "RELATIVE",
  "OTHER",
] as const;

/** Admin: create / edit an enrollment window. */
export const saveAdmissionCycleSchema = z
  .object({
    name: z.string().trim().min(3, "Give the intake a name").max(120),
    academicYearId: z.string().min(1, "Choose an academic year"),
    termId: optionalId,
    opensAt: isoDate,
    closesAt: isoDate,
    status: z.enum(ADMISSION_CYCLE_STATUSES).optional(),
    examMaxScore: z.number().positive().max(1000).default(100),
    passMark: z.number().min(0).max(1000).default(50),
    /** Cash fee each applicant pays on exam day (0 = no fee). Non-refundable. */
    admissionFee: z
      .number()
      .min(0, "The fee cannot be negative")
      .max(1_000_000)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
        message: "Use at most two decimal places.",
      })
      .default(0),
    instructions: z.string().trim().max(2000).optional(),
    classes: z
      .array(
        z.object({
          classId: z.string().min(1),
          /** Maximum number of applicants that can be accepted. Empty = no limit. */
          seats: z.number().int().positive().max(5000).nullable().optional(),
        }),
      )
      .min(1, "Open at least one class for applications")
      .max(100),
  })
  .refine((v) => v.closesAt >= v.opensAt, {
    path: ["closesAt"],
    message: "Applications must close on or after the opening date.",
  })
  .refine((v) => v.passMark <= v.examMaxScore, {
    path: ["passMark"],
    message: "The pass mark cannot be higher than the exam's maximum score.",
  })
  .refine((v) => new Set(v.classes.map((c) => c.classId)).size === v.classes.length, {
    path: ["classes"],
    message: "A class can only be listed once.",
  });
export type SaveAdmissionCycleInput = z.infer<typeof saveAdmissionCycleSchema>;

/** Public: the enrollment form a prospective student's guardian fills in. */
export const submitApplicationSchema = z.object({
  classId: z.string().min(1, "Choose the class applied for"),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  otherNames: z.string().trim().max(100).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: isoDate,
  nationality: z.string().trim().min(2).max(60).default("Ghanaian"),
  previousSchool: z.string().trim().max(150).optional(),
  previousClass: z.string().trim().max(60).optional(),
  residentialAddress: z.string().trim().max(250).optional(),
  city: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  guardianFirstName: z.string().trim().min(1, "Guardian first name is required").max(100),
  guardianLastName: z.string().trim().min(1, "Guardian last name is required").max(100),
  guardianPhone: z.string().trim().min(7, "Enter a valid phone number").max(30),
  guardianEmail: z.email("Enter a valid email address").optional().or(z.literal("")),
  guardianRelationship: z.enum(GUARDIAN_RELATIONSHIPS),
  /** Must be ticked: the guardian confirms the details are correct. */
  declaration: z.literal(true, { error: "Please confirm the declaration." }),
  /** Honeypot - real users never see or fill this; bots do. */
  website: z.string().max(200).optional(),
});
export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>;

/** Public: look up an application's progress (reference + the contact used to apply). */
export const trackApplicationSchema = z.object({
  applicationNumber: z.string().trim().min(5).max(40),
  contact: z.string().trim().min(5).max(120),
});
export type TrackApplicationInput = z.infer<typeof trackApplicationSchema>;

export const scheduleExamSchema = z.object({
  applicationIds: z.array(z.string().min(1)).min(1).max(500),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/, "Use a valid date and time"),
  venue: z.string().trim().min(2, "Enter the exam venue").max(150),
});
export type ScheduleExamInput = z.infer<typeof scheduleExamSchema>;

export const recordExamScoreSchema = z.object({
  score: z.number().min(0, "Score cannot be negative").max(1000),
});
export type RecordExamScoreInput = z.infer<typeof recordExamScoreSchema>;

export const decideApplicationSchema = z
  .object({
    decision: z.enum(["ACCEPTED", "WAITLISTED", "REJECTED"]),
    note: z.string().trim().max(500).optional(),
    /** Accept an applicant who is below the pass mark (needs a written reason). */
    overridePassMark: z.boolean().default(false),
  })
  .refine((v) => !v.overridePassMark || (v.note && v.note.length >= 5), {
    path: ["note"],
    message: "Explain why the pass mark is being overridden.",
  });
export type DecideApplicationInput = z.infer<typeof decideApplicationSchema>;

export const admitApplicationSchema = z.object({
  houseId: optionalId,
});
export type AdmitApplicationInput = z.infer<typeof admitApplicationSchema>;

export const ADMISSION_FEE_STATUSES = ["NOT_REQUIRED", "PENDING", "PAID", "EXEMPTED"] as const;
export type AdmissionFeeStatus = (typeof ADMISSION_FEE_STATUSES)[number];

/** Cash received from an applicant for the entrance exam. The amount is the fee due. */
export const receiveAdmissionFeeSchema = z.object({
  /** Defaults to today. */
  paymentDate: isoDate.optional(),
  notes: z.string().trim().max(300).optional(),
});
export type ReceiveAdmissionFeeInput = z.infer<typeof receiveAdmissionFeeSchema>;

/** Waive the fee for an applicant. A reason is mandatory and is kept on record. */
export const exemptAdmissionFeeSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Give a reason for the exemption (at least 5 characters).")
    .max(300),
});
export type ExemptAdmissionFeeInput = z.infer<typeof exemptAdmissionFeeSchema>;

// ============================================================================
// SCHOOL SETTINGS + SELF-SERVICE PROFILE
// ============================================================================

/** Blank text becomes null so a field can be cleared; missing stays "unchanged". */
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    schema.nullable().optional(),
  );

const phoneText = z.string().trim().min(5, "Enter a valid phone number").max(30);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Details an owner or admin may change. Code and subdomain are identifiers and are not editable. */
export const updateSchoolSettingsSchema = z.object({
  name: z.string().trim().min(2, "School name is required").max(120).optional(),
  email: clearable(z.email("Enter a valid email address").max(160)),
  phone: clearable(phoneText),
  address: clearable(z.string().trim().max(250)),
  motto: clearable(z.string().trim().max(150)),
  website: clearable(
    z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() && !/^https?:\/\//i.test(value.trim())
          ? `https://${value.trim()}`
          : value,
      z
        .url("Enter a valid website address")
        .max(200)
        .refine((value) => /^https?:\/\//i.test(value), "Use an http or https address"),
    ),
  ),
  primaryColor: z.string().regex(HEX_COLOR, "Use a colour like #3B82F6").optional(),
  secondaryColor: z.string().regex(HEX_COLOR, "Use a colour like #10B981").optional(),
});
export type UpdateSchoolSettingsInput = z.infer<typeof updateSchoolSettingsSchema>;

/** Roles whose name is part of an official school record, so only the school can change it. */
export const NAME_LOCKED_ROLES = ["student", "guardian"] as const;

/** Basic details any signed-in user may change about themselves. Email and role are not included. */
export const updateMyProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100).optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(100).optional(),
  otherNames: clearable(z.string().trim().max(100)),
  phone: clearable(phoneText),
  alternatePhone: clearable(phoneText),
  residentialAddress: clearable(z.string().trim().max(250)),
  city: clearable(z.string().trim().max(100)),
  region: clearable(z.string().trim().max(100)),
  emergencyContactName: clearable(z.string().trim().max(150)),
  emergencyContactPhone: clearable(phoneText),
  emergencyRelationship: clearable(z.string().trim().max(100)),
});
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;
