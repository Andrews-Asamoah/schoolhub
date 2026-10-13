import { z } from "zod";

// ============================================================================
// ROLES & ACCESS
// ============================================================================

export const ROLES = [
  "owner",
  "admin",
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

export const createStudentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  otherNames: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).default("MALE"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  admissionNumber: z.string().optional(),
  classId: z.string().optional(),
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
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

// ============================================================================
// ACADEMIC & CLASS SCHEMAS
// ============================================================================

export const createClassSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  level: z.string().min(1, "Class level is required"),
  academicYearId: z.string().min(1, "Academic year is required"),
  capacity: z.number().int().positive().optional(),
  classTeacherId: z.string().optional(),
  departmentId: z.string().optional(),
  isGraduatingClass: z.boolean().default(false),
  order: z.number().int().optional(),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const createSubjectSchema = z.object({
  name: z.string().min(1, "Subject name is required"),
  code: z.string().min(1, "Subject code is required"),
  description: z.string().optional(),
  periodsPerWeek: z.number().int().min(1).default(4),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const createAcademicYearSchema = z.object({
  name: z.string().min(1, "Academic year name is required (e.g. 2025/2026)"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  isCurrent: z.boolean().default(false),
});
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

// ============================================================================
// ATTENDANCE SCHEMAS
// ============================================================================

export const attendanceRecordSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "SICK", "PERMISSION"]),
  remarks: z.string().optional(),
});

export const batchAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  records: z.array(attendanceRecordSchema).min(1, "At least one record is required"),
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
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
});
export type GenerateBillInput = z.infer<typeof generateBillSchema>;