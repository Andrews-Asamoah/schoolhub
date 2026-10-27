import { BadRequestException, HttpException, Injectable, Logger } from "@nestjs/common";
import { Prisma, type School } from "@prisma/client";
import { createStaffSchema, createTeacherSchema, STUDENT_IMPORT_LIMITS } from "@schoolhub/shared";
import type { PeopleService } from "./people.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { parseUpload } from "../students/import/import-parse.js";

type Kind = "teacher" | "staff";
type ImportRow = Record<string, string> & { rowNumber: number };
type PreviewRow = { rowNumber: number; name: string; status: "ready" | "duplicate" | "error"; errors: string[]; row: Record<string, unknown> | null };

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string[]> = {
  firstName: ["firstname", "givenname"], lastName: ["lastname", "surname", "familyname"],
  email: ["email", "emailaddress"], phone: ["phone", "phonenumber", "mobile"],
  gender: ["gender", "sex"], dateOfBirth: ["dateofbirth", "dob"],
  staffNumber: ["staffnumber", "employeenumber"], hireDate: ["hiredate", "datehired", "startdate"],
  employmentType: ["employmenttype", "employment"], department: ["department", "departmentname"],
  staffType: ["stafftype", "role", "category"], jobTitle: ["jobtitle", "position"],
  qualification: ["qualification", "highestqualification"], specialization: ["specialization", "subjectspecialism"],
  experience: ["experience", "yearsofexperience"], staffId: ["staffid", "employeeid"],
};
const fieldByHeader = new Map(Object.entries(aliases).flatMap(([field, names]) => names.map(name => [name, field] as const)));
const required = ["firstName", "lastName", "email", "phone", "gender", "dateOfBirth", "hireDate", "employmentType"];

@Injectable()
export class StaffImportService {
  private readonly logger = new Logger(StaffImportService.name);
  constructor(private readonly prisma: PrismaService, private readonly people: PeopleService) {}

  async preview(school: Pick<School, "id">, file: { buffer: Buffer; originalname: string }, kind: Kind) {
    const { format, sheet } = await parseUpload(file.buffer, file.originalname);
    const mapped = new Map<number, string>();
    const seenFields = new Set<string>();
    const missing: string[] = [];
    sheet.headers.forEach((header, index) => {
      const field = fieldByHeader.get(normalize(header));
      if (field && !seenFields.has(field)) { mapped.set(index, field); seenFields.add(field); }
    });
    for (const field of required) if (!seenFields.has(field)) missing.push(field);
    if (kind === "teacher") {
      if (!seenFields.has("department")) missing.push("department");
      if (!seenFields.has("qualification")) { /* optional in the creation schema */ }
    } else if (!seenFields.has("staffType")) missing.push("staffType");
    if (missing.length) throw new BadRequestException(`Missing required columns: ${missing.join(", ")}. Download the template and keep its headings.`);

    const [departments, teachers, staff] = await Promise.all([
      this.prisma.client.department.findMany({ where: { schoolId: school.id }, select: { id: true, name: true } }),
      this.prisma.client.teacher.findMany({ where: { schoolId: school.id, deletedAt: null }, select: { staffNumber: true, invitationEmail: true } }),
      this.prisma.client.staff.findMany({ where: { schoolId: school.id, deletedAt: null }, select: { staffNumber: true, staffId: true, profile: { select: { user: { select: { email: true } } } } } }),
    ]);
    const existingEmails = new Set([
      ...teachers.map(x => x.invitationEmail?.trim().toLowerCase()),
      ...staff.map(x => x.profile.user?.email?.trim().toLowerCase()),
    ].filter((x): x is string => Boolean(x)));
    const existingNumbers = new Set([
      ...teachers.map(x => x.staffNumber), ...staff.map(x => x.staffNumber), ...staff.map(x => x.staffId),
    ].filter((x): x is string => Boolean(x)).map(x => x.trim().toLowerCase()));
    const seenEmails = new Set<string>();
    const rows: PreviewRow[] = sheet.records.map(record => {
      const raw: Record<string, string> = {};
      for (const [index, field] of mapped) raw[field] = (record.cells[index] ?? "").trim();
      const name = [raw.firstName, raw.lastName].filter(Boolean).join(" ") || "(no name)";
      const errors: string[] = [];
      for (const field of required) if (!raw[field]) errors.push(`${field} is required.`);
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      for (const field of ["dateOfBirth", "hireDate"]) if (raw[field] && !datePattern.test(raw[field])) errors.push(`${field} must use YYYY-MM-DD.`);
      if (raw.gender && !["MALE", "FEMALE", "OTHER"].includes(raw.gender.toUpperCase())) errors.push("gender must be MALE, FEMALE or OTHER.");
      const email = (raw.email ?? "").toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email address.");
      const department = departments.find(d => d.name.toLowerCase() === (raw.department ?? "").toLowerCase());
      if (kind === "teacher" && raw.department && !department) errors.push(`Department "${raw.department}" was not found in this school.`);
      if (kind === "staff" && raw.department && !department) errors.push(`Department "${raw.department}" was not found in this school.`);
      if (kind === "staff" && raw.staffType && !["ACCOUNTANT","HEADTEACHER","ADMIN","LIBRARIAN","DRIVER","SECURITY","NURSE","COUNSELOR","IT_SUPPORT","RECEPTIONIST","COOK","CLEANER","OTHER"].includes(raw.staffType.toUpperCase())) errors.push("staffType must be a supported staff category.");
      const number = (raw.staffNumber || raw.staffId || "").toLowerCase();
      const duplicate = Boolean(email && (existingEmails.has(email) || seenEmails.has(email))) || Boolean(number && existingNumbers.has(number));
      if (email) seenEmails.add(email);
      if (errors.length) return { rowNumber: record.rowNumber, name, status: "error" as const, errors, row: null };
      if (duplicate) return { rowNumber: record.rowNumber, name, status: "duplicate" as const, errors: ["Email or staff identifier already exists in this school or upload."], row: null };
      const row: Record<string, unknown> = {
        firstName: raw.firstName, lastName: raw.lastName, email, phone: raw.phone,
        gender: raw.gender.toUpperCase(), dateOfBirth: raw.dateOfBirth, hireDate: raw.hireDate,
        employmentType: (raw.employmentType || "FULL_TIME").toUpperCase(),
      };
      if (department) row.departmentId = department.id;
      if (kind === "teacher") {
        row.staffNumber = raw.staffNumber || undefined; row.qualification = raw.qualification || undefined;
        row.specialization = raw.specialization || undefined;
        if (raw.experience) row.experience = Number(raw.experience);
      } else {
        row.staffId = raw.staffId || undefined; row.staffNumber = raw.staffNumber || undefined;
        row.staffType = (raw.staffType || "OTHER").toUpperCase(); row.jobTitle = raw.jobTitle || undefined;
      }
      const schema = kind === "teacher" ? createTeacherSchema : createStaffSchema;
      const checked = schema.safeParse(row);
      if (!checked.success) return { rowNumber: record.rowNumber, name, status: "error" as const, errors: checked.error.issues.map(issue => issue.message), row: null };
      return { rowNumber: record.rowNumber, name, status: "ready" as const, errors: [], row: checked.data as Record<string, unknown> };
    });
    const count = (status: PreviewRow["status"]) => rows.filter(row => row.status === status).length;
    return { file: { name: file.originalname, format, rows: rows.length }, summary: { total: rows.length, ready: count("ready"), duplicate: count("duplicate"), error: count("error") }, rows };
  }

  async importBatch(school: Pick<School, "id" | "organizationId">, actorId: string, schoolRole: string | undefined, kind: Kind, batchId: string, rows: { rowNumber: number; row: Record<string, unknown> }[]) {
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > STUDENT_IMPORT_LIMITS.batchSize) throw new BadRequestException(`Send between 1 and ${STUDENT_IMPORT_LIMITS.batchSize} rows per batch.`);
    const results: { rowNumber: number; name: string; status: "created" | "failed"; message?: string; credentials?: unknown }[] = [];
    for (const item of rows) {
      const parsed = (kind === "teacher" ? createTeacherSchema : createStaffSchema).safeParse(item.row);
      const name = [parsed.success ? parsed.data.firstName : "", parsed.success ? parsed.data.lastName : ""].filter(Boolean).join(" ") || `Row ${item.rowNumber}`;
      if (!parsed.success) { results.push({ rowNumber: item.rowNumber, name, status: "failed", message: parsed.error.issues.map(issue => issue.message).join(" ") }); continue; }
      try {
        const created = kind === "teacher"
          ? await this.people.createTeacher(school, actorId, parsed.data as any)
          : await this.people.createStaff(school, { id: actorId, schoolRole }, parsed.data as any);
        results.push({ rowNumber: item.rowNumber, name, status: "created", credentials: created.credentials ?? null });
      } catch (error) {
        if (error instanceof HttpException) results.push({ rowNumber: item.rowNumber, name, status: "failed", message: error.message });
        else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") results.push({ rowNumber: item.rowNumber, name, status: "failed", message: "A record with one of these identifiers already exists." });
        else { this.logger.error(`Staff import failed on row ${item.rowNumber}`, error instanceof Error ? error.stack : String(error)); results.push({ rowNumber: item.rowNumber, name, status: "failed", message: "Could not create this account. Review the row and retry." }); }
      }
    }
    await this.prisma.client.auditLog.create({ data: { userId: actorId, schoolId: school.id, action: "CREATE", entityType: kind === "teacher" ? "TEACHER_IMPORT" : "STAFF_IMPORT", entityId: batchId, newValues: { created: results.filter(r => r.status === "created").length, failed: results.filter(r => r.status === "failed").length, rows: rows.length } satisfies Prisma.InputJsonObject } });
    return { batchId, results, totals: { created: results.filter(r => r.status === "created").length, failed: results.filter(r => r.status === "failed").length } };
  }
}
