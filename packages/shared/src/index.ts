import { z } from "zod";

// ============================================================================
// ROLES & ACCESS
// ============================================================================

export const ROLES = [
  "owner",
  "admin",
  "headteacher",
  "teacher",
  "accountant",
  "staff",
  "student",
  "guardian",
] as const;
export type Role = (typeof ROLES)[number];

/** Effective school administration membership, including assigned additional roles. */
export const SCHOOL_ADMIN_ROLES = ["owner", "admin", "headteacher"] as const;
export function hasSchoolAdministrationRole(member: { role: string; roles?: readonly string[] | null }): boolean {
  return [member.role, ...(member.roles ?? [])].some((role) =>
    (SCHOOL_ADMIN_ROLES as readonly string[]).includes(role));
}

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

/**
 * Domain part for guardian login emails. Unlike student addresses, guardian
 * addresses use the school's own domain without the "st." prefix.
 */
export function guardianEmailDomain(
  schoolEmail: string | null | undefined,
  schoolSubdomain: string,
): string {
  const domain = schoolEmail?.split("@")[1]?.trim().toLowerCase();
  if (
    domain &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain) &&
    !PUBLIC_EMAIL_DOMAINS.has(domain)
  ) {
    return domain;
  }
  return `${schoolSubdomain.trim().toLowerCase()}.${STUDENT_LOGIN_EMAIL_DOMAIN}`;
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
export const updateHouseSchema = createHouseSchema.partial().extend({
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Choose a valid hex color").nullable().optional(),
  motto: z.string().trim().max(200).nullable().optional(),
  houseTeacherId: z.string().nullable().optional(),
});
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


/** Save a batch of marks for one class and subject. `marks: null` clears a mark. */
export const saveAssessmentEntrySchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  templateId: z.string().min(1),
  termId: z.string().min(1).optional(),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        componentId: z.string().min(1),
        occurrenceIndex: z.number().int().min(0).max(50).default(0),
        marks: z.number().min(0).max(10000).nullable(),
        expectedMarks: z.number().min(0).max(10000).nullable().optional(),
      }),
    )
    .min(1, "There are no marks to save")
    .max(5000),
});
export type SaveAssessmentEntryInput = z.infer<typeof saveAssessmentEntrySchema>;

// ---- bulk upload of marks ---------------------------------------------------

/** Headings of the two columns that identify a pupil in the marks upload sheet. */
export const MARKS_IMPORT_IDENTITY_HEADERS = {
  admissionNumber: "Admission No",
  name: "Pupil name",
} as const;

export interface MarksImportComponent {
  id: string;
  name: string;
  maxMarks: number;
  /** How many marks the component takes per pupil (1 unless it is repeatable). */
  slots: number;
  subjectStrandName?: string | null;
}

export interface MarksImportColumn {
  componentId: string;
  /** Zero-based entry position within a repeatable component. */
  occurrenceIndex: number;
  maxMarks: number;
  /** The label without the "(out of N)" suffix. Unique within one assessment. */
  label: string;
  /** The exact heading written into the template. */
  header: string;
}

/**
 * One column per mark a pupil can receive: a repeatable component such as three
 * quizzes gets one column per entry. The template writer and the upload parser
 * both build their columns here, so the headings can never drift apart.
 */
export function marksImportColumns(components: readonly MarksImportComponent[]): MarksImportColumn[] {
  return components.flatMap((component) =>
    Array.from({ length: Math.max(component.slots, 1) }, (_, occurrenceIndex) => {
      const label = [
        component.name.trim(),
        component.subjectStrandName ? `– ${component.subjectStrandName.trim()}` : "",
        component.slots > 1 ? String(occurrenceIndex + 1) : "",
      ]
        .filter(Boolean)
        .join(" ");
      return {
        componentId: component.id,
        occurrenceIndex,
        maxMarks: component.maxMarks,
        label,
        header: `${label} (out of ${component.maxMarks})`,
      };
    }),
  );
}

/** Lower-case, accent-free, letters and digits only, so "Class Test 1 (out of 20)" matches "class test 1". */
export function normalizeMarksImportKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\(\s*out of\s*[\d.,]+\s*\)\s*$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const sheetRef = {
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  templateId: z.string().min(1),
};

/** A teacher signs a sheet off. Pupils who could not be assessed are listed as excused. */
export const submitAssessmentEntrySchema = z.object({
  ...sheetRef,
  excusedStudentIds: z.array(z.string().min(1)).max(500).default([]),
  note: z.string().trim().max(500).optional(),
});
export type SubmitAssessmentEntryInput = z.infer<typeof submitAssessmentEntrySchema>;

/** Ask for marks to change on a sheet that is locked, submitted or past its deadline. */
export const requestMarkCorrectionSchema = z.object({
  ...sheetRef,
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(2000),
  items: z
    .array(
      z.object({
        studentId: z.string().min(1),
        componentId: z.string().min(1),
        occurrenceIndex: z.number().int().min(0).max(50).default(0),
        marks: z.number().min(0).max(10000).nullable(),
      }),
    )
    .min(1, "Choose at least one mark to correct")
    .max(500),
});
export type RequestMarkCorrectionInput = z.infer<typeof requestMarkCorrectionSchema>;

export const reviewMarkCorrectionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(2000).optional(),
});
export type ReviewMarkCorrectionInput = z.infer<typeof reviewMarkCorrectionSchema>;

/** Grant more time for one class, or for one teacher in that class. */
export const extendAssessmentDeadlineSchema = z.object({
  templateId: z.string().min(1),
  classId: z.string().min(1),
  teacherId: z.string().min(1).nullable().default(null),
  /** A calendar date, YYYY-MM-DD; the extension runs to the end of that day. */
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-18"),
  reason: z.string().trim().max(500).optional(),
});
export type ExtendAssessmentDeadlineInput = z.infer<typeof extendAssessmentDeadlineSchema>;

export const reopenAssessmentEntrySchema = z.object({
  ...sheetRef,
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
});
export type ReopenAssessmentEntryInput = z.infer<typeof reopenAssessmentEntrySchema>;

export const sendEntryRemindersSchema = z.object({
  templateId: z.string().min(1),
  /** Teacher ids to remind; omit to remind every teacher with unfinished sheets. */
  teacherIds: z.array(z.string().min(1)).max(200).optional(),
});
export type SendEntryRemindersInput = z.infer<typeof sendEntryRemindersSchema>;

// ============================================================================
// FINANCE & BILLING SCHEMAS
// ============================================================================

export const recordPaymentSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  billId: z.string().optional(),
  amount: z.number().finite().positive("Amount must be greater than zero"),
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
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  /** Client-generated unique key (e.g. a UUID). Retrying with the same key never records a second receipt. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
  /** Explicit per-fee-component allocation. Older clients retain the API's FIFO fallback. */
  allocations: z.array(z.object({
    billItemId: z.string().min(1),
    amount: z.number().finite().positive("Each allocation must be greater than zero"),
  })).min(1).optional(),
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
  /** Optional fee item IDs are explicit opt-ins; all mandatory items remain billable. */
  optionalItemIds: z.array(z.string().min(1)).max(100).default([]),
});
export type GenerateBillInput = z.infer<typeof generateBillSchema>;

export type StudentStatementEntryType =
  | "INVOICE"
  | "DISCOUNT"
  | "RECEIPT"
  | "REVERSAL"
  | "REFUND"
  | "ADJUSTMENT";

export interface StudentStatementEntry {
  id: string;
  date: string;
  type: StudentStatementEntryType;
  reference: string;
  description: string;
  academicYear?: string | null;
  term?: string | null;
  billId?: string | null;
  paymentId?: string | null;
  /** Signed amount: positive increases receivables; negative reduces receivables. */
  amount: string;
  runningBalance: string;
}

export interface StudentStatementResponse {
  student: {
    id: string;
    admissionNumber: string | null;
    name: string;
  };
  scope: "term" | "year" | "all";
  period: { from: string | null; to: string | null; academicYear?: string | null; term?: string | null };
  openingBalance: string;
  entries: StudentStatementEntry[];
  closingBalance: string;
  ageing: { days0To30: string; days31To60: string; days61To90: string; days90Plus: string; notDue: string };
  unallocatedCredit: string;
  dataSource: "bills_and_payments";
}

export const createExpenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  amount: z.number().positive("Amount must be greater than zero"),
  description: z.string().trim().min(3, "Enter a meaningful expense description").max(500),
  payee: z.string().trim().max(200).optional(),
  category: z.enum([
    "SALARY", "UTILITIES", "SUPPLIES", "MAINTENANCE", "TRANSPORT",
    "RENT", "INSURANCE", "TAXES", "OTHER",
  ]).default("OTHER"),
  paymentMethod: z.enum([
    "CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE", "OTHER",
  ]).default("CASH"),
  registryCategoryId: optionalId,
  checkNumber: z.string().trim().max(120).optional(),
  voucherNumber: z.string().trim().max(120).optional(),
  referenceNumber: z.string().trim().max(120).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(2, "Item name must contain at least 2 characters").max(150),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(100).optional(),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  minQuantity: z.number().int().min(0).default(0),
  initialQuantity: z.number().int().min(0).default(0),
});
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;

export const updateInventoryItemSchema = z.object({
  name: z.string().trim().min(2, "Item name must contain at least 2 characters").max(150),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(100).optional(),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  minQuantity: z.number().int().min(0).default(0),
});
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

export const createInventoryCategorySchema = z.object({
  name: z.string().trim().min(2, "Category name must contain at least 2 characters").max(100),
  description: z.string().trim().max(300).optional(),
});
export type CreateInventoryCategoryInput = z.infer<typeof createInventoryCategorySchema>;

export const inventoryStockMovementSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  quantity: z.number().int().positive("Quantity must be a positive whole number"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  description: z.string().trim().max(500).optional(),
  recipientName: z.string().trim().max(150).optional(),
});
export type InventoryStockMovementInput = z.infer<typeof inventoryStockMovementSchema>;

export const updatePayrollSalarySchema = z.object({
  monthlySalary: z.number().finite().min(0, "Monthly salary cannot be negative").max(10000000),
});
export type UpdatePayrollSalaryInput = z.infer<typeof updatePayrollSalarySchema>;



// ============================================================================
// SUPER ADMIN SCHEMAS
// ============================================================================

/** Subdomains the platform itself uses; a school may never claim them. */
export const RESERVED_SUBDOMAINS = ["api", "admin", "www", "app", "demo", "staging", "mail", "static", "docs", "status", "support"] as const;

export const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])$/, "Lowercase letters, numbers and hyphens; cannot start or end with a hyphen")
  .refine((value) => !(RESERVED_SUBDOMAINS as readonly string[]).includes(value), "This subdomain is reserved");

// Schools fund their own Hubtel Programmable SMS account. Never use query-string credentials.
export const schoolHubtelConnectionSchema = z.object({
  senderId: z.string().trim().min(1).max(11).regex(/^[A-Za-z0-9]+$/, "Use 1–11 letters/numbers from your approved Hubtel sender ID"),
  clientId: z.string().trim().min(1).max(128).regex(/^[^\s:]+$/, "Invalid Hubtel Client ID"),
  clientSecret: z.string().trim().min(1).max(256).regex(/^[^\s]+$/, "Invalid Hubtel Client secret"),
  apiBaseUrl: z.enum(["https://sms.hubtel.com/v1/messages", "https://smsc.hubtel.com/v1/messages"]).default("https://sms.hubtel.com/v1/messages"),
});
export type SchoolHubtelConnectionInput = z.infer<typeof schoolHubtelConnectionSchema>;

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
  subdomain: subdomainSchema,
  region: z.string().optional(),

  // Optional: encrypted school-funded SMS connection. Channels start disabled.
  smsConnection: schoolHubtelConnectionSchema.optional(),

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
  subdomain: subdomainSchema,
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
  reason: z.string().trim().min(10, "Enter a reason of at least 10 characters").max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.banned && !value.reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A reason is required when suspending a school administrator",
    });
  }
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

// ----------------------------------------------------------------------------
// Subscription rules (single source of truth for API enforcement and the UI)
// ----------------------------------------------------------------------------

export const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "SUSPENDED",
] as const;
export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUSES)[number];

/** Length of the free trial granted when a school is enrolled. */
export const SUBSCRIPTION_TRIAL_DAYS = 30;
/** Days a school keeps working after its paid period / trial has lapsed. */
export const SUBSCRIPTION_GRACE_DAYS = 7;

export type SubscriptionAccessReason =
  | "OK"
  | "GRACE_PERIOD"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELLED"
  | "PAST_DUE";

export interface SubscriptionAccess {
  allowed: boolean;
  reason: SubscriptionAccessReason;
  /** Whole days until the lapse date (negative once lapsed). Null when no expiry is set. */
  daysRemaining: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Decides whether a school may use the platform. Pure so the API guard, the
 * dashboard and the tests all apply exactly the same policy.
 *
 * - SUSPENDED / CANCELLED: blocked immediately.
 * - TRIALING / ACTIVE / PAST_DUE: allowed until `expiresAt`, then for a short
 *   grace period (`SUBSCRIPTION_GRACE_DAYS`), then blocked.
 * - Unknown legacy values are treated as blocked (fail closed).
 */
export function evaluateSubscriptionAccess(
  status: string | null | undefined,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): SubscriptionAccess {
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const validExpiry = expiry && !Number.isNaN(expiry.getTime()) ? expiry : null;
  const daysRemaining = validExpiry
    ? Math.ceil((validExpiry.getTime() - now.getTime()) / DAY_MS)
    : null;

  const normalised = status === "CANCELED" ? "CANCELLED" : status;
  if (normalised === "SUSPENDED") return { allowed: false, reason: "SUSPENDED", daysRemaining };
  if (normalised === "CANCELLED") return { allowed: false, reason: "CANCELLED", daysRemaining };
  if (normalised !== "TRIALING" && normalised !== "ACTIVE" && normalised !== "PAST_DUE") {
    return { allowed: false, reason: "SUSPENDED", daysRemaining };
  }

  if (validExpiry && validExpiry.getTime() <= now.getTime()) {
    const graceEnds = validExpiry.getTime() + SUBSCRIPTION_GRACE_DAYS * DAY_MS;
    return now.getTime() < graceEnds
      ? { allowed: true, reason: "GRACE_PERIOD", daysRemaining }
      : { allowed: false, reason: "EXPIRED", daysRemaining };
  }
  if (normalised === "PAST_DUE") return { allowed: true, reason: "PAST_DUE", daysRemaining };
  return { allowed: true, reason: "OK", daysRemaining };
}

/** Machine-readable marker in the `error` field when a school's access is blocked. */
export const SUBSCRIPTION_INACTIVE = "SUBSCRIPTION_INACTIVE";

/** Reserved plan feature key used to license the desktop app. */
export const DESKTOP_PLAN_FEATURE = "desktop";

export const updateSubscriptionSchema = z.object({
  /** null inherits the assigned plan, undefined preserves the current override. */
  desktopEnabled: z.boolean().nullable().optional(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  /** ISO date (YYYY-MM-DD) or full ISO timestamp. `null` clears the expiry. */
  expiresAt: z
    .union([
      z
        .string()
        .trim()
        .refine((value) => !Number.isNaN(new Date(value).getTime()), "Enter a valid date"),
      z.null(),
    ])
    .optional(),
  /** Why the change was made; stored in the audit trail. */
  note: z.string().trim().max(500).optional(),
});
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

// ----------------------------------------------------------------------------
// Super-admin list queries (validated server-side; never trust raw query strings)
// ----------------------------------------------------------------------------

const pageQuery = z.coerce.number().int().min(1).max(100000).default(1);
const limitQuery = z.coerce.number().int().min(1).max(100).default(20);
const searchQuery = z.string().trim().max(100).optional();

export const superAdminSchoolsQuerySchema = z.object({
  page: pageQuery,
  limit: limitQuery,
  q: searchQuery,
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  /** `expiring` = lapses within 14 days; `lapsed` = past its expiry date. */
  expiry: z.enum(["expiring", "lapsed"]).optional(),
});
export type SuperAdminSchoolsQuery = z.infer<typeof superAdminSchoolsQuerySchema>;

export const superAdminUsersQuerySchema = z.object({
  page: pageQuery,
  limit: limitQuery,
  q: searchQuery,
  schoolId: z.string().trim().max(64).optional(),
  role: z.string().trim().max(40).optional(),
});
export type SuperAdminUsersQuery = z.infer<typeof superAdminUsersQuerySchema>;

export const SUPER_ADMIN_AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "CREDENTIALS_ISSUED",
  "ACCESS_CHANGED",
  "SUBSCRIPTION_CHANGED",
  "SCHOOL_ACCESSED",
] as const;

const auditDateQuery = z.string().trim().min(1).max(40).refine(
  (value) => !Number.isNaN(new Date(value).getTime()),
  "Enter a valid date",
);

export const superAdminAuditQuerySchema = z.object({
  page: pageQuery,
  limit: limitQuery,
  action: z.enum(SUPER_ADMIN_AUDIT_ACTIONS).optional(),
  schoolId: z.string().trim().max(64).optional(),
  actorId: z.string().trim().max(64).optional(),
  from: auditDateQuery.optional(),
  to: auditDateQuery.optional(),
  q: searchQuery,
}).superRefine((query, ctx) => {
  if (!query.from || !query.to) return;
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    to.setUTCHours(23, 59, 59, 999);
  }
  if (from.getTime() > to.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: "The end date must be on or after the start date",
    });
  }
});
export type SuperAdminAuditQuery = z.infer<typeof superAdminAuditQuerySchema>;

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

/** Replace a subject's strand metadata and its class-specific teacher allocations. */
export const setSubjectStrandsSchema = z.object({
  strands: z.array(z.object({
    id: z.string().min(1).optional(),
    name: z.string().trim().min(2).max(80),
    code: z.string().trim().max(20).optional(),
    description: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).max(100).default(0),
    examWeightPercent: z.number().min(0).max(100).default(0),
    isActive: z.boolean().default(true),
    assignments: z.array(z.object({
      classId: z.string().min(1),
      teacherId: z.string().min(1),
    })).max(200).default([]),
  })).max(50),
}).superRefine((value, ctx) => {
  const names = new Set<string>();
  for (const strand of value.strands) {
    const name = strand.name.toLocaleLowerCase();
    if (names.has(name)) {
      ctx.addIssue({ code: "custom", path: ["strands"], message: "Strand names must be unique within a subject." });
    }
    names.add(name);
    const classes = strand.assignments.map((assignment) => assignment.classId);
    if (new Set(classes).size !== classes.length) {
      ctx.addIssue({ code: "custom", path: ["strands"], message: `A class can only have one teacher for ${strand.name}.` });
    }
  }
});
export type SetSubjectStrandsInput = z.infer<typeof setSubjectStrandsSchema>;

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
    subjectStrandId: z.string().min(1).optional(),
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

/**
 * One batch of lessons from a spreadsheet upload. Each row is the same payload
 * the timetable editor saves, so an import is checked exactly like a hand-made
 * lesson. `existingId` marks a period that already has a lesson to replace.
 */
export const importTimetableBatchSchema = z.object({
  academicYearId: z.string().min(1).optional(),
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int().positive(),
        /** Shown back in the results table only. */
        name: z.string().trim().max(120).optional(),
        existingId: z.string().min(1).optional(),
        row: saveTimetableEntrySchema,
      }),
    )
    .min(1),
});
export type ImportTimetableBatchInput = z.infer<typeof importTimetableBatchSchema>;

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

/**
 * Edit an applicant's exam in one go: date/time, venue and/or score. Only the
 * fields sent are changed. `score: null` clears a recorded score.
 */
export const updateApplicationExamSchema = z
  .object({
    /** ISO timestamp (preferred) or "YYYY-MM-DD[THH:mm]". */
    examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Use a valid date and time").optional(),
    venue: z.string().trim().min(2, "Enter the exam venue").max(150).optional(),
    score: z.number().min(0, "Score cannot be negative").max(1000).nullable().optional(),
  })
  .refine((v) => v.examDate !== undefined || v.venue !== undefined || v.score !== undefined, {
    message: "Nothing to update.",
  });
export type UpdateApplicationExamInput = z.infer<typeof updateApplicationExamSchema>;

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

// ============================================================================
// ASSESSMENT SETUP (templates and grading scales)
// ============================================================================

export const ASSESSMENT_TYPES = [
  "CLASS_TEST",
  "QUIZ",
  "ASSIGNMENT",
  "PROJECT",
  "PRACTICAL",
  "HOMEWORK",
  "PRESENTATION",
  "MID_TERM_EXAM",
  "MOCK_EXAM",
  "FINAL_EXAM",
] as const;
export type AssessmentTypeName = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentTypeName, string> = {
  CLASS_TEST: "Class test",
  QUIZ: "Quiz",
  ASSIGNMENT: "Assignment",
  PROJECT: "Project",
  PRACTICAL: "Practical",
  HOMEWORK: "Homework",
  PRESENTATION: "Presentation",
  MID_TERM_EXAM: "Mid-term exam",
  MOCK_EXAM: "Mock exam",
  FINAL_EXAM: "End-of-term exam",
};

export interface GradeBandLike {
  grade: string;
  minScore: number;
  maxScore: number;
}

/**
 * Problems with a set of grade bands, in plain words. Bands may leave small gaps
 * between them (80-100 then 70-79), but they must not overlap, must not repeat a
 * grade, and must cover 0 to 100 so every pupil gets a grade.
 */
export function gradeScaleProblems(bands: GradeBandLike[]): string[] {
  const problems: string[] = [];
  if (bands.length === 0) return problems;

  const seen = new Set<string>();
  for (const band of bands) {
    if (band.minScore > band.maxScore) problems.push(`${band.grade || "A grade"}: the lowest score is above the highest score.`);
    const key = band.grade.trim().toLowerCase();
    if (seen.has(key)) problems.push(`The grade "${band.grade}" is used more than once.`);
    seen.add(key);
  }

  const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.minScore <= previous.maxScore) {
      problems.push(`${previous.grade} (${previous.minScore}-${previous.maxScore}) overlaps ${current.grade} (${current.minScore}-${current.maxScore}).`);
    }
  }
  if (sorted[0]!.minScore !== 0) problems.push("The lowest grade must start at 0 so every score gets a grade.");
  if (Math.max(...bands.map((band) => band.maxScore)) !== 100) problems.push("The highest grade must reach 100.");
  return problems;
}

export const gradeBandInputSchema = z.object({
  grade: z.string().trim().min(1, "Every grade needs a name").max(4, "Keep grade names short, like A or B+"),
  description: z.string().trim().min(1, "Describe each grade, for example Excellent").max(40),
  minScore: z.number("Enter a lowest score").min(0).max(100),
  maxScore: z.number("Enter a highest score").min(0).max(100),
  gradePoint: z.number("Enter a grade point").min(0).max(10),
});

export const saveGradingSystemSchema = z
  .object({
    name: z.string().trim().min(2, "Give the grading scale a name").max(80),
    description: clearable(z.string().trim().max(300)),
    scales: z.array(gradeBandInputSchema).min(2, "Add at least two grades").max(15),
  })
  .superRefine((value, ctx) => {
    for (const message of gradeScaleProblems(value.scales)) ctx.addIssue({ code: "custom", path: ["scales"], message });
  });
export type SaveGradingSystemInput = z.infer<typeof saveGradingSystemSchema>;

// ---------------------------------------------------------------------------
// Stanine mark boundaries
//
// WAEC grades the BECE with the nine-point stanine scale (top 4% = grade 1, next 7% = 2, ...
// bottom 4% = 9). It publishes no fixed mark boundaries: for each subject, each year, the
// cut-off marks are set after marking so the grades fall close to those shares. A school
// does the same here: the minimum mark for each grade (except the lowest, which takes
// everything below) is set per assessment, subject and term, either typed in or suggested
// from the pupils' actual results.
// ---------------------------------------------------------------------------

/** The share of candidates each stanine grade covers, best grade first. */
export const STANINE_SHARES = [4, 7, 12, 17, 20, 17, 12, 7, 4] as const;

/** The minimum mark (percentage) a pupil needs for each grade. The lowest grade has none. */
export interface GradeBoundary {
  grade: string;
  minScore: number;
}

/**
 * Problems with a set of boundaries. `grades` lists every grade of the scale, best first.
 * Boundaries must cover every grade except the lowest, and each must sit strictly below the
 * one before it, so a mark can only ever belong to one grade.
 */
export function gradeBoundaryProblems(grades: readonly string[], boundaries: readonly GradeBoundary[]): string[] {
  const problems: string[] = [];
  if (grades.length < 2) return ["This grading scale has too few grades to set boundaries."];
  const expected = grades.slice(0, -1);
  const seen = new Set<string>();
  for (const boundary of boundaries) {
    if (!expected.includes(boundary.grade)) problems.push(`Grade ${boundary.grade} does not take a boundary.`);
    if (seen.has(boundary.grade)) problems.push(`Grade ${boundary.grade} appears more than once.`);
    seen.add(boundary.grade);
  }
  for (const grade of expected) if (!seen.has(grade)) problems.push(`Enter the minimum mark for grade ${grade}.`);
  if (problems.length) return problems;

  const byGrade = new Map(boundaries.map((boundary) => [boundary.grade, boundary.minScore]));
  let previous: { grade: string; min: number } | null = null;
  for (const grade of expected) {
    const min = byGrade.get(grade)!;
    if (!Number.isFinite(min) || min <= 0 || min > 100) {
      problems.push(`Grade ${grade}: the minimum mark must be more than 0 and at most 100.`);
      continue;
    }
    if (previous && min >= previous.min) {
      problems.push(`Grade ${grade} (${min}) must need fewer marks than grade ${previous.grade} (${previous.min}).`);
    }
    previous = { grade, min };
  }
  return problems;
}

/**
 * The grade for a mark under fixed boundaries. `bands` are best grade first; the lowest
 * band takes every mark that no boundary above it claims.
 */
export function gradeFromBoundaries<B extends { grade: string }>(
  percentage: number,
  bands: readonly B[],
  minimums: Readonly<Record<string, number>>,
): B {
  for (let index = 0; index < bands.length - 1; index++) {
    const min = minimums[bands[index]!.grade];
    if (min !== undefined && percentage >= min) return bands[index]!;
  }
  return bands[bands.length - 1]!;
}

/**
 * Suggests boundaries from how a cohort actually scored, the way WAEC arrives at its yearly
 * cut-offs. `cumulativeShares` is each grade's cumulative share of the cohort, best first
 * (4, 11, 23, ... 100). For every grade it picks the mark that leaves the number of pupils
 * at or above it closest to that share of the cohort. Working from cumulative shares, never
 * from each grade's own rounded share, keeps the grades adding up to exactly the cohort size.
 * Marks tied on a cut-off always stay together. Returns one boundary per grade except the last.
 */
export function suggestBoundaries(
  percentages: readonly number[],
  grades: readonly string[],
  cumulativeShares: readonly number[],
): GradeBoundary[] {
  if (percentages.length === 0 || grades.length < 2 || grades.length !== cumulativeShares.length) return [];
  const sorted = [...percentages].sort((a, b) => b - a);
  const total = sorted.length;
  const distinct = [...new Set(sorted)];
  const above = (mark: number) => sorted.filter((value) => value >= mark).length;
  const counts = new Map(distinct.map((mark) => [mark, above(mark)]));
  const top = sorted[0]!;
  // A cut-off just above the best mark lets a grade stay empty in a very small cohort.
  const candidates: { mark: number; count: number }[] = distinct.map((mark) => ({ mark, count: counts.get(mark)! }));
  if (top < 100) candidates.push({ mark: Math.min(100, Math.round((top + 0.01) * 100) / 100), count: 0 });

  const result: GradeBoundary[] = [];
  let ceiling = Infinity;
  for (let index = 0; index < grades.length - 1; index++) {
    const target = (cumulativeShares[index]! / 100) * total;
    let best = candidates[0]!;
    for (const candidate of candidates) {
      const gap = Math.abs(candidate.count - target);
      const bestGap = Math.abs(best.count - target);
      // On an exact tie take the stricter (higher) mark.
      if (gap < bestGap || (gap === bestGap && candidate.mark > best.mark)) best = candidate;
    }
    // Boundaries must strictly fall; an empty grade takes a cent below the one above. Each one
    // also leaves a cent of room for every boundary still to come, so a cohort that all scored
    // 0 still gets a valid set instead of collapsing onto the floor.
    const room = Math.round((grades.length - 2 - index) * 0.01 * 100) / 100;
    let mark = Math.min(best.mark, Math.round((ceiling - 0.01) * 100) / 100);
    mark = Math.max(mark, Math.round((room + 0.01) * 100) / 100);
    result.push({ grade: grades[index]!, minScore: mark });
    ceiling = mark;
  }
  return result;
}

/** Saves the boundaries for one assessment, subject and term. */
export const saveGradeBoundariesSchema = z.object({
  subjectId: z.string().min(1, "Choose a subject"),
  termId: z.string().min(1, "Choose a term"),
  boundaries: z
    .array(
      z.object({
        grade: z.string().trim().min(1).max(4),
        minScore: z.number("Enter a minimum mark").min(0).max(100),
      }),
    )
    .min(1, "Enter the minimum marks")
    .max(14),
});
export type SaveGradeBoundariesInput = z.infer<typeof saveGradeBoundariesSchema>;

export const assessmentComponentInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Give every component a name").max(60),
  componentType: z.enum(ASSESSMENT_TYPES),
  maxMarks: z.number("Enter the maximum marks").positive("Maximum marks must be more than 0").max(1000),
  weight: z.number("Enter the weight").min(0, "Weight cannot be negative").max(100, "Weight cannot be more than 100"),
  isRequired: z.boolean().default(true),
  isRepeatable: z.boolean().default(false),
  expectedCount: z.number().int().min(1).max(10).default(1),
  subjectStrandId: z.string().min(1).optional(),
});
export type AssessmentComponentInput = z.infer<typeof assessmentComponentInputSchema>;

/**
 * A report batch reports one assessment. The classes come from that assessment's own class
 * scope, so `classIds` is only ever a narrowing (for example publishing 3A before 3B).
 */
export const createReportSetSchema = z.object({
  name: z.string().trim().min(1, "Give the batch a name").max(120),
  /** The report design (layout), not the assessment. */
  templateId: z.string().min(1, "Choose a report design"),
  assessmentTemplateId: z.string().min(1, "Choose the assessment to report"),
  academicYearId: z.string().min(1, "Choose an academic year"),
  termId: z.string().min(1, "Choose a term"),
  classIds: z.array(z.string().min(1)).optional(),
  publishAt: z.string().trim().nullish().transform((value) => value || null),
});
export type CreateReportSetInput = z.infer<typeof createReportSetSchema>;

/** What an assessment is for. Mirrors the AssessmentCategory enum in the API schema. */
export const ASSESSMENT_CATEGORIES = ["TERMLY", "MOCK"] as const;
export type AssessmentCategoryValue = (typeof ASSESSMENT_CATEGORIES)[number];

/** The one component a standard mock exam is recorded against: a single total out of 100. */
export const MOCK_COMPONENT_DEFAULT = { name: "Mock exam", componentType: "MOCK_EXAM", maxMarks: 100, weight: 100, isRequired: true, isRepeatable: false, expectedCount: 1 } as const;

export const saveAssessmentTemplateSchema = z
  .object({
    name: z.string().trim().min(2, "Give the assessment a name").max(120),
    description: clearable(z.string().trim().max(500)),
    /** TERMLY feeds termly report cards. MOCK is a practice exam that never does. */
    category: z.enum(ASSESSMENT_CATEGORIES).default("TERMLY"),
    /** Required for a mock (so "Mock 1" can exist once per academic year); ignored for termly. */
    academicYearId: clearable(z.string().min(1)),
    /** Sitting order inside the academic year: Mock 1 is 1, Mock 2 is 2. */
    sequence: z.number().int().min(1).max(50).nullable().optional(),
    gradingSystemId: z.string().min(1, "Choose a grading scale"),
    /** Empty means every class. */
    classIds: z.array(z.string().min(1)).max(300).default([]),
    /** null means every subject. */
    subjectCode: clearable(z.string().trim().max(20)),
    /** null means every term. */
    termNumber: z.number().int().min(1).max(6).nullable().optional(),
    /** A date, YYYY-MM-DD. Marks can be entered up to the end of that day. */
    deadline: clearable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-18")),
    isActive: z.boolean().default(true),
    isLocked: z.boolean().default(false),
    components: z.array(assessmentComponentInputSchema).min(1, "Add at least one component").max(12),
  })
  .superRefine((value, ctx) => {
    const total = value.components.reduce((sum, component) => sum + component.weight, 0);
    if (Math.abs(total - 100) > 0.01) {
      ctx.addIssue({ code: "custom", path: ["components"], message: `Component weights must add up to 100%. They add up to ${Math.round(total * 100) / 100}%.` });
    }
    if (value.category === "MOCK") {
      if (!value.academicYearId) ctx.addIssue({ code: "custom", path: ["academicYearId"], message: "Choose the academic year this mock belongs to." });
      if (value.components.some((component) => component.isRepeatable)) {
        ctx.addIssue({ code: "custom", path: ["components"], message: "A mock exam is one sitting, so its components cannot repeat." });
      }
    }
    const names = new Set<string>();
    for (const component of value.components) {
      const key = component.name.trim().toLowerCase();
      if (names.has(key)) ctx.addIssue({ code: "custom", path: ["components"], message: `"${component.name}" is used twice. Give each component its own name.` });
      names.add(key);
    }
  });
export type SaveAssessmentTemplateInput = z.infer<typeof saveAssessmentTemplateSchema>;

/**
 * Whether new component settings are allowed once marks exist. Names may always
 * change; marks, weights and which components exist may not, because totals and
 * grades already recorded depend on them. Returns a reason, or null if fine.
 */
export function lockedStructureProblem(
  existing: { id: string; maxMarks: number; weight: number; componentType: string; isRequired: boolean; isRepeatable: boolean; expectedCount: number; subjectStrandId?: string | null }[],
  incoming: { id?: string; maxMarks: number; weight: number; componentType: string; isRequired: boolean; isRepeatable: boolean; expectedCount: number; subjectStrandId?: string | null }[],
): string | null {
  const message =
    "Marks have already been recorded, so the components, their maximum marks and weights can't change. You can rename components, or duplicate this assessment to start a new one.";
  if (existing.length !== incoming.length) return message;
  const byId = new Map(existing.map((component) => [component.id, component]));
  for (const component of incoming) {
    const before = component.id ? byId.get(component.id) : undefined;
    if (!before) return message;
    if (
      before.maxMarks !== component.maxMarks ||
      before.weight !== component.weight ||
      before.componentType !== component.componentType ||
      before.isRequired !== component.isRequired ||
      before.isRepeatable !== component.isRepeatable ||
      before.expectedCount !== component.expectedCount ||
      (before.subjectStrandId ?? null) !== (component.subjectStrandId ?? null)
    ) {
      return message;
    }
  }
  return null;
}


// ============================================================================
// ANNOUNCEMENTS
// ============================================================================

export const ANNOUNCEMENT_CATEGORIES = ["ACADEMIC", "EVENT", "HOUSE", "GENERAL"] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const ANNOUNCEMENT_TARGETS = [
  "ALL_STUDENTS",
  "SELECTED_CLASSES",
  "SELECTED_CLASS_GUARDIANS",
  "SCHOOL_HOUSES",
  "SCHOOL_COMMUNITY",
  "PARENTS_GUARDIANS",
  "TEACHERS",
  "OUTSTANDING_FEE_GUARDIANS",
] as const;
export type AnnouncementTarget = (typeof ANNOUNCEMENT_TARGETS)[number];

export const ANNOUNCEMENT_STATUSES = ["PUBLISHED", "DRAFT"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3, "Title must contain at least 3 characters").max(180),
  content: z.string().trim().min(1, "Announcement content is required").max(10000),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).default("GENERAL"),
  target: z.enum(ANNOUNCEMENT_TARGETS).default("SCHOOL_COMMUNITY"),
  /** Explicit class audience used for class and class-guardian announcements. */
  classIds: z.array(z.string().trim().min(1)).max(100).default([]),
  isPinned: z.boolean().default(false),
  status: z.enum(ANNOUNCEMENT_STATUSES).default("PUBLISHED"),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementPinSchema = z.object({
  isPinned: z.boolean(),
});
export type UpdateAnnouncementPinInput = z.infer<typeof updateAnnouncementPinSchema>;

export const updateAnnouncementStatusSchema = z.object({
  status: z.enum(ANNOUNCEMENT_STATUSES),
});
export type UpdateAnnouncementStatusInput = z.infer<typeof updateAnnouncementStatusSchema>;

// ============================================================================
// STUDENT IMPORT (bulk upload of existing students)
// ============================================================================

export const STUDENT_IMPORT_LIMITS = {
  /** Most students in one file. */
  maxRows: 1000,
  /** Students sent to the server per request, so each request stays short and progress can be shown. */
  batchSize: 25,
  maxFileBytes: 2 * 1024 * 1024,
} as const;

/**
 * One batch of previewed rows. Each row carries only the cells that change; the
 * server re-checks every one exactly as it would a hand-typed mark, and
 * `expectedMarks` makes a row fail instead of overwriting marks someone else
 * changed after the preview.
 */
export const importAssessmentMarksBatchSchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  templateId: z.string().min(1),
  termId: z.string().min(1).optional(),
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int().positive(),
        /** Shown back in the results table only. */
        name: z.string().trim().max(160).optional(),
        row: z.object({
          studentId: z.string().min(1),
          entries: z
            .array(
              z.object({
                componentId: z.string().min(1),
                occurrenceIndex: z.number().int().min(0).max(50),
                marks: z.number().min(0).max(10000),
                expectedMarks: z.number().min(0).max(10000).nullable(),
              }),
            )
            .min(1)
            .max(200),
        }),
      }),
    )
    .min(1)
    .max(STUDENT_IMPORT_LIMITS.batchSize),
});
export type ImportAssessmentMarksBatchInput = z.infer<typeof importAssessmentMarksBatchSchema>;

export const STUDENT_IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "otherNames",
  "gender",
  "dateOfBirth",
  "admissionNumber",
  "admissionDate",
  "className",
  "houseName",
  "nationality",
  "residentialAddress",
  "city",
  "region",
  "bloodGroup",
  "allergies",
  "medicalConditions",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyRelationship",
  "g1FirstName",
  "g1LastName",
  "g1Relationship",
  "g1Phone",
  "g1Email",
  "g2FirstName",
  "g2LastName",
  "g2Relationship",
  "g2Phone",
  "g2Email",
] as const;
export type StudentImportField = (typeof STUDENT_IMPORT_FIELDS)[number];

export interface StudentImportColumn {
  key: StudentImportField;
  /** The heading used in the template. */
  label: string;
  required?: boolean;
  /** Other headings people commonly use, written as lowercase letters and digits only. */
  aliases: string[];
  help: string;
  example: string;
}

const guardianColumns = (n: 1 | 2): StudentImportColumn[] => {
  const prefix = `g${n}` as "g1" | "g2";
  const label = `Guardian ${n}`;
  const alias = (suffix: string) => [`guardian${n}${suffix}`, `parent${n}${suffix}`, ...(n === 1 ? [`guardian${suffix}`, `parent${suffix}`] : [])];
  return [
    { key: `${prefix}FirstName` as StudentImportField, label: `${label} first name`, aliases: alias("firstname"), help: n === 1 ? "The main parent or guardian. Needs a phone number to be saved." : "Optional second guardian.", example: n === 1 ? "Kofi" : "Ama" },
    { key: `${prefix}LastName` as StudentImportField, label: `${label} last name`, aliases: alias("lastname").concat(alias("surname")), help: "", example: "Mensah" },
    { key: `${prefix}Relationship` as StudentImportField, label: `${label} relationship`, aliases: alias("relationship").concat(alias("relation")), help: "Father, Mother, Guardian, Grandmother, Relative...", example: n === 1 ? "Father" : "Mother" },
    { key: `${prefix}Phone` as StudentImportField, label: `${label} phone`, aliases: alias("phone").concat(alias("contact"), alias("telephone")), help: "For example 0244123456 or +233244123456.", example: "0244123456" },
    { key: `${prefix}Email` as StudentImportField, label: `${label} email`, aliases: alias("email"), help: "Optional. Needed only to create a parent-portal login.", example: "" },
  ];
};

export const STUDENT_IMPORT_COLUMNS: StudentImportColumn[] = [
  { key: "firstName", label: "First name", required: true, aliases: ["firstname", "givenname", "forename", "first"], help: "", example: "Akosua" },
  { key: "lastName", label: "Last name", required: true, aliases: ["lastname", "surname", "familyname", "last"], help: "", example: "Mensah" },
  { key: "otherNames", label: "Other names", aliases: ["othernames", "middlename", "middlenames", "othername"], help: "", example: "Serwaa" },
  { key: "gender", label: "Gender", required: true, aliases: ["gender", "sex"], help: "Male or Female (M or F also works).", example: "Female" },
  { key: "dateOfBirth", label: "Date of birth", required: true, aliases: ["dateofbirth", "dob", "birthdate", "birthday", "dateborn"], help: "Day first: 25/12/2012 or 25 Dec 2012. Year-first 2012-12-25 also works.", example: "25/12/2012" },
  { key: "admissionDate", label: "Admission date", aliases: ["admissiondate", "dateadmitted", "dateofadmission", "enrolmentdate", "enrollmentdate"], help: "When the student joined the school. Its year becomes the year in the admission number (e.g. WIS2018…). Leave blank for today.", example: "" },
  { key: "className", label: "Class", aliases: ["class", "classname", "grade", "form", "level", "currentclass"], help: "Must match a class you have already created, such as JHS 1A.", example: "JHS 1A" },
  { key: "houseName", label: "House", aliases: ["house", "housename"], help: "Must match an existing house. Optional.", example: "" },
  { key: "nationality", label: "Nationality", aliases: ["nationality", "citizenship"], help: "Blank means Ghanaian.", example: "Ghanaian" },
  { key: "residentialAddress", label: "Residential address", aliases: ["residentialaddress", "address", "homeaddress"], help: "", example: "12 Palm Street" },
  { key: "city", label: "City", aliases: ["city", "town"], help: "", example: "Accra" },
  { key: "region", label: "Region", aliases: ["region", "state", "province"], help: "", example: "Greater Accra" },
  { key: "bloodGroup", label: "Blood group", aliases: ["bloodgroup", "bloodtype"], help: "", example: "O+" },
  { key: "allergies", label: "Allergies", aliases: ["allergies", "allergy"], help: "", example: "" },
  { key: "medicalConditions", label: "Medical conditions", aliases: ["medicalconditions", "medicalcondition", "medical", "healthconditions"], help: "", example: "" },
  { key: "emergencyContactName", label: "Emergency contact name", aliases: ["emergencycontactname", "emergencycontact", "emergencyname"], help: "", example: "Kofi Mensah" },
  { key: "emergencyContactPhone", label: "Emergency contact phone", aliases: ["emergencycontactphone", "emergencyphone", "emergencycontactnumber"], help: "", example: "0244123456" },
  { key: "emergencyRelationship", label: "Emergency contact relationship", aliases: ["emergencycontactrelationship", "emergencyrelationship", "emergencyrelation"], help: "", example: "Father" },
  ...guardianColumns(1),
  ...guardianColumns(2),
];

const importText = (max: number) => z.string().trim().max(max).optional();
const importIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2012-12-25");

export const importedGuardianSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  relationshipType: z.enum(["FATHER", "MOTHER", "GUARDIAN", "SIBLING", "GRANDFATHER", "GRANDMOTHER", "RELATIVE", "OTHER"]),
  phone: z.string().trim().min(5).max(30),
  email: z.email().optional(),
});
export type ImportedGuardian = z.infer<typeof importedGuardianSchema>;

/** One student as cleaned up by the preview step. The import step accepts only this shape. */
export const normalizedStudentRowSchema = z.object({
  rowNumber: z.number().int().min(1).max(100000),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  otherNames: importText(100),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: importIsoDate,
  admissionNumber: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9/_.\- ]{0,29}$/, "Admission numbers use letters, digits and / _ . - only").optional(),
  admissionDate: importIsoDate.optional(),
  className: importText(60),
  houseName: importText(60),
  nationality: importText(60),
  residentialAddress: importText(250),
  city: importText(100),
  region: importText(100),
  bloodGroup: importText(10),
  allergies: importText(300),
  medicalConditions: importText(500),
  emergencyContactName: importText(150),
  emergencyContactPhone: importText(30),
  emergencyRelationship: importText(100),
  guardians: z.array(importedGuardianSchema).max(2).default([]),
});
export type NormalizedStudentRow = z.infer<typeof normalizedStudentRowSchema>;

export const importStudentBatchSchema = z.object({
  /** Ties the batches of one upload together in the audit trail. */
  batchId: z.string().trim().min(8).max(64),
  /** Create parent-portal logins for guardians who have an email address. */
  createGuardianLogins: z.boolean().default(false),
  rows: z.array(normalizedStudentRowSchema).min(1).max(STUDENT_IMPORT_LIMITS.batchSize),
});
export type ImportStudentBatchInput = z.infer<typeof importStudentBatchSchema>;

export interface PortalWorkItem {
  id: string;
  title: string;
  detail: string;
  page: string;
  count: number;
}
export interface PortalWorkQueue {
  generatedAt: string;
  role: string;
  term: { id: string; name: string } | null;
  items: PortalWorkItem[];
  lessons: { id: string; day: string; start: string; end: string; subject: string; className: string }[];
  upcoming: { id: string; title: string; dueAt: string | null; status: string }[];
}

// ------------------------------------------------- permanent student deletion

export const STUDENT_DELETION_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type StudentDeletionStatus = (typeof STUDENT_DELETION_STATUSES)[number];

/** A school admin asks the platform to permanently remove a wrongly created student. */
export const requestStudentDeletionSchema = z.object({
  studentId: z.string().min(1).max(128),
  reason: z
    .string()
    .trim()
    .min(10, "Say briefly why this record should be removed (at least 10 characters).")
    .max(1000),
});
export type RequestStudentDeletionInput = z.infer<typeof requestStudentDeletionSchema>;

/** The super admin turns a request down; the school sees the note. */
export const rejectStudentDeletionSchema = z.object({
  decisionNote: z.string().trim().min(3, "Tell the school why.").max(1000),
});
export type RejectStudentDeletionInput = z.infer<typeof rejectStudentDeletionSchema>;

export const studentDeletionQuerySchema = z.object({
  status: z.enum(STUDENT_DELETION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type StudentDeletionQuery = z.infer<typeof studentDeletionQuerySchema>;

/** 1 → { n: 1, suffix: "st" }, 12 → "th", 23 → "rd". For positions like 3rd, shown with a raised suffix. */
export function ordinalParts(value: number): { n: number; suffix: "st" | "nd" | "rd" | "th" } {
  const n = Math.trunc(value);
  const lastTwo = Math.abs(n) % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return { n, suffix: "th" };
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as const)[(Math.abs(n) % 10) as 1 | 2 | 3] ?? "th";
  return { n, suffix };
}

/** The weight every subject shares (for a column heading like "Class Score (50%)"), or null when they differ or none is known. */
export function commonWeight(weights: readonly (number | null | undefined)[]): number | null {
  const known = weights.filter((weight): weight is number => typeof weight === "number" && weight > 0);
  return known.length > 0 && known.length === weights.length && known.every((weight) => weight === known[0]) ? known[0]! : null;
}
