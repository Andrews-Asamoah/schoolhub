import { BadRequestException, HttpException, Injectable, Logger } from "@nestjs/common";
import { Prisma, type School } from "@prisma/client";
import {
  type CreateStudentInput,
  type ImportStudentBatchInput,
  type NormalizedStudentRow,
  type StudentImportField,
} from "@schoolhub/shared";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { StudentsService } from "../students.service.js";
import { mapHeaders, normalizeRecord } from "./import-normalize.js";
import { parseUpload } from "./import-parse.js";
import {
  evaluateRow,
  newSeen,
  remember,
  studentKey,
  type ImportContext,
  type RowStatus,
  type RowVerdict,
} from "./import-validate.js";

export interface PreviewRow {
  rowNumber: number;
  status: RowStatus;
  errors: string[];
  warnings: string[];
  /** What would be imported. Null when the row can't be read at all. */
  row: NormalizedStudentRow | null;
  name: string;
  className: string | null;
}

export interface ImportRowResult {
  rowNumber: number;
  name: string;
  status: "created" | "skipped" | "failed";
  message?: string;
  studentId?: string;
  admissionNumber?: string | null;
  className?: string | null;
  username?: string;
  loginEmail?: string;
  temporaryPassword?: string;
  guardianLogins?: { name: string; loginEmail: string; temporaryPassword: string }[];
}

interface LoadedContext extends ImportContext {
  /** Pupils already in each class this term, and its capacity. */
  classLoad: Map<string, { name: string; capacity: number | null; taken: number }>;
}

/**
 * Importing students from a spreadsheet in two steps. The preview only reads and
 * checks the file; the import creates students in small batches, each through the
 * same code as adding one student by hand, so every rule (logins, admission numbers,
 * class capacity) applies identically.
 */
@Injectable()
export class StudentImportService {
  private readonly logger = new Logger(StudentImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
  ) {}

  async preview(school: Pick<School, "id">, file: { buffer: Buffer; originalname: string }) {
    const { format, sheet } = await parseUpload(file.buffer, file.originalname);
    const mapping = mapHeaders(sheet.headers);
    if (mapping.missing.length) {
      throw new BadRequestException(
        `The file is missing the required column${mapping.missing.length === 1 ? "" : "s"}: ${mapping.missing.join(", ")}. Download the template to see the exact headings.`,
      );
    }

    const columnOf = new Map<StudentImportField, number>();
    for (const [index, field] of mapping.fields) columnOf.set(field, index);

    const ctx = await this.loadContext(school.id);
    const seen = newSeen();
    const classIds: (string | null)[] = [];
    const rows: PreviewRow[] = sheet.records.map((record) => {
      const get = (field: StudentImportField) => {
        const index = columnOf.get(field);
        return index === undefined ? "" : (record.cells[index] ?? "");
      };
      const outcome = normalizeRecord(get, record.rowNumber);
      const rawName = `${get("firstName")} ${get("lastName")}`.replace(/\s+/g, " ").trim() || "(no name)";
      if (!outcome.row) {
        classIds.push(null);
        return { rowNumber: record.rowNumber, status: "error", errors: outcome.errors, warnings: outcome.warnings, row: null, name: rawName, className: get("className").trim() || null };
      }
      const verdict = evaluateRow(outcome.row, ctx, outcome.warnings, seen);
      classIds.push(verdict.classId);
      return {
        rowNumber: record.rowNumber,
        status: verdict.status,
        errors: verdict.errors,
        warnings: verdict.warnings,
        row: outcome.row,
        name: `${outcome.row.firstName} ${outcome.row.lastName}`,
        className: outcome.row.className ?? null,
      };
    });

    const count = (status: RowStatus) => rows.filter((row) => row.status === status).length;
    const importable = rows.filter((row) => row.status === "ready" || row.status === "warning");

    // Warn when a class would end up over capacity, since the import would refuse the extra students.
    const incoming = new Map<string, number>();
    for (const [index, row] of rows.entries()) {
      const classId = classIds[index];
      if ((row.status === "ready" || row.status === "warning") && classId) incoming.set(classId, (incoming.get(classId) ?? 0) + 1);
    }
    const notices: string[] = [];
    for (const [classId, added] of incoming) {
      const load = ctx.classLoad.get(classId);
      if (load && load.capacity !== null && load.taken + added > load.capacity) {
        notices.push(`${load.name} holds ${load.capacity} pupils and already has ${load.taken}. This file adds ${added}, so some will be refused. Raise the class capacity first if that's wrong.`);
      }
    }
    if (mapping.duplicated.length) notices.push(`These headings appear more than once and only the first was used: ${mapping.duplicated.join(", ")}.`);

    return {
      file: { name: file.originalname, format, rows: rows.length },
      columns: { recognized: mapping.recognized, ignored: mapping.ignored },
      summary: { total: rows.length, ready: count("ready"), warning: count("warning"), duplicate: count("duplicate"), error: count("error"), importable: importable.length },
      notices,
      rows,
    };
  }

  async importBatch(
    school: Pick<School, "id" | "organizationId" | "subdomain">,
    actorId: string,
    role: string | undefined,
    input: ImportStudentBatchInput,
  ) {
    const ctx = await this.loadContext(school.id);
    const results: ImportRowResult[] = [];

    for (const row of input.rows) {
      const name = `${row.firstName} ${row.lastName}`;
      const base = { rowNumber: row.rowNumber, name };
      const verdict = evaluateRow(row, ctx);
      if (verdict.status === "duplicate") {
        results.push({ ...base, status: "skipped", message: "Already in the school, so it was not added again." });
        continue;
      }
      if (verdict.status === "error") {
        results.push({ ...base, status: "failed", message: verdict.errors.join(" ") });
        continue;
      }
      try {
        const created = await this.students.createStudent(school, actorId, this.toCreateInput(row, verdict, input.createGuardianLogins), {
          role,
          admissionNumber: row.admissionNumber,
          admissionDate: row.admissionDate,
        });
        remember(ctx, row);
        results.push({
          ...base,
          status: "created",
          studentId: created.id,
          admissionNumber: created.admissionNumber,
          className: created.class?.name ?? null,
          username: created.credentials.loginId,
          loginEmail: created.credentials.loginEmail,
          temporaryPassword: created.credentials.temporaryPassword,
          guardianLogins: created.guardianCredentials.flatMap((guardian) =>
            guardian.credentials
              ? [{ name: guardian.name, loginEmail: guardian.credentials.loginEmail, temporaryPassword: guardian.credentials.temporaryPassword }]
              : [],
          ),
        });
      } catch (error) {
        results.push({ ...base, status: "failed", message: this.explain(error, row.rowNumber) });
      }
    }

    const totals = {
      created: results.filter((result) => result.status === "created").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
    };
    await this.prisma.client.auditLog.create({
      data: {
        userId: actorId,
        schoolId: school.id,
        action: "CREATE",
        entityType: "STUDENT_IMPORT",
        entityId: input.batchId,
        newValues: { ...totals, rows: input.rows.length, createGuardianLogins: input.createGuardianLogins } satisfies Prisma.InputJsonObject,
      },
    });
    return { batchId: input.batchId, totals, results };
  }

  // --------------------------------------------------------------- helpers

  private toCreateInput(row: NormalizedStudentRow, verdict: RowVerdict, createGuardianLogins: boolean): CreateStudentInput {
    return {
      firstName: row.firstName,
      lastName: row.lastName,
      otherNames: row.otherNames,
      gender: row.gender,
      dateOfBirth: row.dateOfBirth,
      classId: verdict.classId ?? undefined,
      houseId: verdict.houseId ?? undefined,
      nationality: row.nationality ?? "Ghanaian",
      residentialAddress: row.residentialAddress,
      city: row.city,
      region: row.region,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      emergencyRelationship: row.emergencyRelationship,
      bloodGroup: row.bloodGroup,
      allergies: row.allergies,
      medicalConditions: row.medicalConditions,
      guardians: row.guardians.map((guardian, index) => ({
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        phone: guardian.phone,
        email: guardian.email ?? "",
        relationshipType: guardian.relationshipType,
        isPrimary: index === 0,
        createLogin: createGuardianLogins && !!guardian.email,
      })),
    };
  }

  /** A message an administrator can act on. Unexpected errors are logged, not shown. */
  private explain(error: unknown, rowNumber: number): string {
    if (error instanceof HttpException) return error.message;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "Another student already uses one of these details (such as the admission number).";
    }
    this.logger.error(`Student import failed on row ${rowNumber}`, error instanceof Error ? error.stack : String(error));
    return "Something went wrong saving this student. Upload the file again to retry the rows that failed.";
  }

  private async loadContext(schoolId: string): Promise<LoadedContext> {
    const db = this.prisma.client;
    const [classes, houses, year, existing] = await Promise.all([
      db.class.findMany({ where: { schoolId, isActive: true, deletedAt: null }, select: { id: true, name: true, capacity: true } }),
      db.house.findMany({ where: { schoolId, isActive: true }, select: { id: true, name: true } }),
      db.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        select: { id: true, terms: { where: { isCurrent: true }, take: 1, select: { id: true } } },
      }),
      db.student.findMany({
        where: { schoolId, deletedAt: null },
        select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true, dateOfBirth: true } } },
      }),
    ]);
    const term = year?.terms[0];

    const admissionNumbers = new Set<string>();
    const studentKeys = new Set<string>();
    for (const student of existing) {
      if (student.admissionNumber) admissionNumbers.add(student.admissionNumber.trim().toLowerCase());
      const dob = student.profile.dateOfBirth;
      if (dob) studentKeys.add(studentKey(student.profile.firstName, student.profile.lastName, dob.toISOString().slice(0, 10)));
    }

    const counts =
      year && term
        ? await db.enrollment.groupBy({
            by: ["classId"],
            where: { academicYearId: year.id, termId: term.id, status: "ACTIVE", class: { schoolId } },
            _count: { _all: true },
          })
        : [];
    const taken = new Map(counts.map((row) => [row.classId, row._count._all]));

    return {
      classes: classes.map(({ id, name }) => ({ id, name })),
      houses,
      hasCurrentTerm: !!term,
      admissionNumbers,
      studentKeys,
      classLoad: new Map(classes.map((item) => [item.id, { name: item.name, capacity: item.capacity, taken: taken.get(item.id) ?? 0 }])),
    };
  }
}

