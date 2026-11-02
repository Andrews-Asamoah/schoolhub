import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger } from "@nestjs/common";
import {
  createClubSchema,
  createClassSchema,
  createDepartmentSchema,
  createHouseSchema,
  STUDENT_IMPORT_LIMITS,
  type CreateClubInput,
  type CreateClassInput,
  type CreateDepartmentInput,
  type CreateHouseInput,
  updateHouseSchema,
  type UpdateHouseInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";
import { AcademicsService } from "./academics.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { parseUpload } from "../students/import/import-parse.js";

export type AcademicStructureKind = "departments" | "houses" | "clubs" | "classes";
type RecordInput = CreateDepartmentInput | CreateHouseInput | CreateClubInput | CreateClassInput;
type PreviewStatus = "ready" | "duplicate" | "error";
type PreviewRow = {
  rowNumber: number;
  name: string;
  status: PreviewStatus | "update";
  errors: string[];
  row: Record<string, unknown> | null;
  existingId?: string;
  matchCode?: string;
};
type ExistingRecord = {
  id?: string;
  name: string;
  code?: string;
  description?: string | null;
  color?: string | null;
  motto?: string | null;
  houseTeacherId?: string | null;
  isActive?: boolean;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const fieldAliases: Record<AcademicStructureKind, Record<string, string[]>> = {
  departments: {
    name: ["name", "department", "departmentname"],
    code: ["code", "departmentcode"],
    description: ["description", "details"],
  },
  houses: {
    name: ["name", "housename", "house"],
    code: ["code", "housecode"],
    description: ["description", "details"],
    color: ["color", "colour"],
    motto: ["motto", "slogan"],
    houseTeacherEmail: ["houseteacheremail", "teacheremail", "housemasteremail"],
    isActive: ["isactive", "active", "status"],
  },
  clubs: {
    name: ["name", "clubname", "club"],
    description: ["description", "details"],
    teacherInChargeEmail: ["teacherinchargeemail", "patronemail", "teacheremail"],
    isActive: ["isactive", "active", "status"],
  },
  classes: {
    name: ["name", "classname", "class"],
    level: ["level", "grade", "classlevel"],
    departmentCode: ["departmentcode", "deptcode", "department"],
    capacity: ["capacity", "classcapacity"],
    isGraduatingClass: ["isgraduatingclass", "graduatingclass", "graduating"],
    isActive: ["isactive", "active", "status"],
    order: ["order", "sortorder", "displayorder"],
  },
};

const requiredFields: Record<AcademicStructureKind, string[]> = {
  departments: ["name", "code"],
  houses: ["name", "code"],
  clubs: ["name"],
  classes: ["name", "level", "departmentCode"],
};

const kindNames: Record<AcademicStructureKind, string> = {
  departments: "department",
  houses: "house",
  clubs: "club",
  classes: "class",
};

function isKind(value: string): value is AcademicStructureKind {
  return value === "departments" || value === "houses" || value === "clubs" || value === "classes";
}

function parseActive(value: string): boolean | undefined {
  if (!value) return undefined;
  if (/^(true|yes|1|active)$/i.test(value)) return true;
  if (/^(false|no|0|inactive)$/i.test(value)) return false;
  throw new Error("isActive must be TRUE or FALSE.");
}

function parseBoolean(value: string, field: string): boolean | undefined {
  if (!value) return undefined;
  if (/^(true|yes|1)$/i.test(value)) return true;
  if (/^(false|no|0)$/i.test(value)) return false;
  throw new Error(`${field} must be TRUE or FALSE.`);
}

function responseMessage(error: HttpException): string {
  const body = error.getResponse();
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null && "message" in body) {
    const message = body.message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(" ");
  }
  return error.message;
}

@Injectable()
export class AcademicStructureImportService {
  private readonly logger = new Logger(AcademicStructureImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly academics: AcademicsService,
  ) {}

  async preview(
    school: Pick<School, "id">,
    file: { buffer: Buffer; originalname: string },
    rawKind: string,
  ) {
    if (!isKind(rawKind)) throw new BadRequestException("kind must be departments, houses, clubs or classes.");
    const kind = rawKind;
    const { format, sheet } = await parseUpload(file.buffer, file.originalname);
    const fieldByHeader = new Map(
      Object.entries(fieldAliases[kind]).flatMap(([field, aliases]) =>
        aliases.map((alias) => [alias, field] as const),
      ),
    );
    const columns = new Map<number, string>();
    for (const [index, header] of sheet.headers.entries()) {
      const field = fieldByHeader.get(normalize(header));
      if (field && ![...columns.values()].includes(field)) columns.set(index, field);
    }

    const missing = requiredFields[kind].filter((field) => ![...columns.values()].includes(field));
    if (missing.length) {
      throw new BadRequestException(`Missing required columns: ${missing.join(", ")}. Download the template and keep its headings.`);
    }

    const [existing, teachers, departments] = await Promise.all([
      this.loadExisting(school.id, kind),
      kind === "houses" || kind === "clubs"
        ? this.prisma.client.teacher.findMany({
            where: { schoolId: school.id, isActive: true, deletedAt: null },
            select: { id: true, invitationEmail: true },
          })
        : Promise.resolve([]),
      kind === "classes"
        ? this.prisma.client.department.findMany({
            where: { schoolId: school.id },
            select: { id: true, name: true, code: true },
          })
        : Promise.resolve([]),
    ]);
    const teacherByEmail = new Map(
      teachers.flatMap((teacher) =>
        teacher.invitationEmail
          ? [[teacher.invitationEmail.trim().toLowerCase(), teacher.id] as const]
          : [],
      ),
    );
    const seen = new Set<string>();

    const rows: PreviewRow[] = sheet.records.map((record) => {
      const raw: Record<string, string> = {};
      for (const [index, field] of columns) raw[field] = (record.cells[index] ?? "").trim();
      const displayName = raw.name || "(no name)";
      const input: Record<string, unknown> = {
        name: raw.name,
        ...(kind === "departments" || kind === "houses" ? { code: raw.code } : {}),
        ...(raw.description ? { description: raw.description } : {}),
        ...(kind === "houses" ? {
          ...(raw.color ? { color: raw.color } : {}),
          ...(raw.motto ? { motto: raw.motto } : {}),
        } : {}),
      };
      const errors: string[] = [];
      let existingHouse: ExistingRecord | undefined;

      if (kind === "houses") {
        const codeMatch = existing.find((item) => normalize(item.code ?? "") === normalize(raw.code ?? ""));
        const nameMatch = existing.find((item) => normalize(item.name) === normalize(raw.name ?? ""));
        if (codeMatch && nameMatch && codeMatch.id !== nameMatch.id) {
          errors.push("This house name and code match different existing houses. Keep one existing identifier unchanged.");
        } else {
          existingHouse = codeMatch ?? nameMatch;
        }
        if (existingHouse) {
          input.description = raw.description || null;
          input.color = raw.color || null;
          input.motto = raw.motto || null;
          input.houseTeacherId = null;
        }
      }

      if (kind === "classes") {
        const department = departments.find((candidate) =>
          candidate.code.trim().toLowerCase() === raw.departmentCode?.trim().toLowerCase(),
        );
        if (!department) {
          errors.push(`No department with code "${raw.departmentCode || "(blank)"}" exists in this school.`);
        } else {
          input.departmentId = department.id;
        }
        input.level = raw.level;
        try {
          const graduating = parseBoolean(raw.isGraduatingClass ?? "", "isGraduatingClass");
          if (graduating !== undefined) input.isGraduatingClass = graduating;
          const active = parseActive(raw.isActive ?? "");
          if (active !== undefined) input.isActive = active;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Class flags must be TRUE or FALSE.");
        }
        if (raw.capacity) input.capacity = Number(raw.capacity);
        if (raw.order) input.order = Number(raw.order);
      }

      if (kind !== "classes") {
        try {
          const active = parseActive(raw.isActive ?? "");
          if (active !== undefined && kind !== "departments") input.isActive = active;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "isActive must be TRUE or FALSE.");
        }
      }

      const teacherEmailField = kind === "houses" ? "houseTeacherEmail" : "teacherInChargeEmail";
      if ((kind === "houses" || kind === "clubs") && raw[teacherEmailField]) {
        const teacherId = teacherByEmail.get(raw[teacherEmailField]!.toLowerCase());
        if (!teacherId) errors.push(`No active teacher with email "${raw[teacherEmailField]}" was found in this school.`);
        else input[kind === "houses" ? "houseTeacherId" : "teacherInChargeId"] = teacherId;
      }

      if (kind === "houses" && raw.isActive) {
        try {
          const active = parseActive(raw.isActive);
          if (active !== undefined) input.isActive = active;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "isActive must be TRUE or FALSE.");
        }
      }

      const schema = kind === "departments"
        ? createDepartmentSchema
        : kind === "houses"
          ? existingHouse ? updateHouseSchema : createHouseSchema
          : kind === "clubs"
            ? createClubSchema
            : createClassSchema;
      const checked = schema.safeParse(input);
      if (!checked.success) errors.push(...checked.error.issues.map((issue) => issue.message));
      if (errors.length) return { rowNumber: record.rowNumber, name: displayName, status: "error", errors, row: null };

      const data = checked.data as RecordInput;
      const checkedData = checked.data as Record<string, unknown>;
      if (existingHouse?.id) {
        for (const field of ["description", "color", "motto"] as const) {
          if (checkedData[field] === existingHouse[field]) delete input[field];
        }
        if ("houseTeacherId" in input && checkedData.houseTeacherId === existingHouse.houseTeacherId) {
          delete input.houseTeacherId;
        }
        if ("isActive" in input && checkedData.isActive === existingHouse.isActive) delete input.isActive;
      }
      const duplicateKeys = kind === "classes"
        ? [normalize(data.name)]
        : kind === "clubs"
        ? [normalize(data.name)]
        : kind === "houses"
          ? [normalize(data.name), normalize((data as CreateHouseInput).code)]
          : [normalize((data as CreateDepartmentInput).code)];
      const duplicate = (kind === "houses" && existingHouse
        ? existing.some((item) =>
            item.id !== existingHouse?.id &&
            (normalize(item.name) === normalize(data.name) ||
              normalize(item.code ?? "") === normalize((data as CreateHouseInput).code)),
          )
        : this.isDuplicate(kind, data, existing)) || duplicateKeys.some((key) => seen.has(key));
      if (duplicate) {
        const identifier = kind === "classes" || kind === "clubs" ? "name" : kind === "houses" ? "name or code" : "code";
        return {
          rowNumber: record.rowNumber,
          name: displayName,
          status: "duplicate",
          errors: [`A ${kindNames[kind]} with this ${identifier} already exists in this school or upload.`],
          row: null,
        };
      }
      for (const key of duplicateKeys) seen.add(key);
      return existingHouse?.id
        ? {
            rowNumber: record.rowNumber,
            name: displayName,
            status: "update",
            errors: [],
            row: input,
            existingId: existingHouse.id,
            ...(existingHouse.code ? { matchCode: existingHouse.code } : {}),
          }
        : { rowNumber: record.rowNumber, name: displayName, status: "ready", errors: [], row: data };
    });

    const count = (status: PreviewStatus) => rows.filter((row) => row.status === status).length;
    return {
      file: { name: file.originalname, format, rows: rows.length },
      summary: {
        total: rows.length,
        ready: count("ready"),
        update: rows.filter((row) => row.status === "update").length,
        duplicate: count("duplicate"),
        error: count("error"),
      },
      rows,
    };
  }

  async importBatch(
    school: Pick<School, "id">,
    role: string | undefined,
    rawKind: string,
    values: { rowNumber: number; row: Record<string, unknown>; existingId?: string; matchCode?: string }[],
    houseUpdateMode: string = "merge",
  ) {
    if (!isKind(rawKind)) throw new BadRequestException("kind must be departments, houses, clubs or classes.");
    const kind = rawKind;
    if (kind !== "clubs" && role !== "owner" && role !== "admin") {
      throw new ForbiddenException(`Only school owners and administrators can import ${kind}.`);
    }
    if (kind === "houses" && houseUpdateMode !== "merge" && houseUpdateMode !== "replace") {
      throw new BadRequestException("houseUpdateMode must be merge or replace.");
    }
    if (!Array.isArray(values) || values.length < 1 || values.length > STUDENT_IMPORT_LIMITS.batchSize) {
      throw new BadRequestException(`Send between 1 and ${STUDENT_IMPORT_LIMITS.batchSize} rows per batch.`);
    }

    const results: { rowNumber: number; name: string; status: "created" | "updated" | "failed"; message?: string }[] = [];
    for (const item of values) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        results.push({ rowNumber: 0, name: "(invalid row)", status: "failed", message: "The row data is invalid. Validate the file again." });
        continue;
      }
      const rowNumber = Number.isInteger(item.rowNumber) && item.rowNumber > 0 ? item.rowNumber : 0;
      if (!rowNumber || !item.row || typeof item.row !== "object" || Array.isArray(item.row)) {
        results.push({ rowNumber, name: "(invalid row)", status: "failed", message: "The row data is invalid. Validate the file again." });
        continue;
      }
      const name = typeof item.row?.name === "string" ? item.row.name : "(no name)";
      try {
        if (kind === "houses" && item.existingId) {
          if (!item.matchCode) {
            results.push({ rowNumber, name, status: "failed", message: "The house matching code is missing. Validate the file again." });
            continue;
          }
          const existing = await this.prisma.client.house.findFirst({
            where: { id: item.existingId, schoolId: school.id, code: item.matchCode },
            select: { id: true, name: true, code: true, description: true, color: true, motto: true, houseTeacherId: true, isActive: true },
          });
          if (!existing) {
            results.push({ rowNumber, name, status: "failed", message: "This house changed after validation. Validate the file again before importing." });
            continue;
          }
          const updateInput = { ...item.row };
          if (houseUpdateMode === "merge") {
            for (const field of ["description", "color", "motto", "houseTeacherId"] as const) {
              if (updateInput[field] === null) delete updateInput[field];
            }
          } else {
            for (const field of ["description", "color", "motto", "houseTeacherId"] as const) {
              if (updateInput[field] === undefined || updateInput[field] === "") updateInput[field] = null;
            }
            if (updateInput.isActive === undefined) updateInput.isActive = true;
          }
          const checkedUpdate = updateHouseSchema.safeParse(updateInput);
          if (!checkedUpdate.success) {
            results.push({
              rowNumber,
              name,
              status: "failed",
              message: checkedUpdate.error.issues.map((issue) => issue.message).join(" "),
            });
            continue;
          }
          const patch = { ...checkedUpdate.data };
          for (const field of ["name", "code", "description", "color", "motto", "houseTeacherId", "isActive"] as const) {
            if (field in patch && patch[field] === existing[field]) delete patch[field];
          }
          if (Object.keys(patch).length) {
            await this.academics.updateHouse(school.id, existing.id, patch as UpdateHouseInput);
          }
          results.push({
            rowNumber,
            name,
            status: "updated",
            ...(Object.keys(patch).length ? {} : { message: "No changes were needed." }),
          });
          continue;
        }
        if (item.existingId && kind !== "houses") {
          results.push({ rowNumber, name, status: "failed", message: "Only house rows can target an existing record." });
          continue;
        }
        const schema = kind === "departments"
          ? createDepartmentSchema
          : kind === "houses"
            ? createHouseSchema
            : kind === "clubs"
              ? createClubSchema
              : createClassSchema;
        const checked = schema.safeParse(item.row);
        if (!checked.success) {
          results.push({
            rowNumber,
            name,
            status: "failed",
            message: checked.error.issues.map((issue) => issue.message).join(" "),
          });
          continue;
        }
        if (kind === "departments") await this.academics.createDepartment(school.id, checked.data as CreateDepartmentInput);
        else if (kind === "houses") await this.academics.createHouse(school.id, checked.data as CreateHouseInput);
        else if (kind === "clubs") await this.academics.createClub(school.id, checked.data as CreateClubInput);
        else await this.academics.createClass(school.id, checked.data as CreateClassInput);
        results.push({ rowNumber, name, status: "created" });
      } catch (error) {
        if (error instanceof HttpException) {
          results.push({ rowNumber, name, status: "failed", message: responseMessage(error) });
        } else if (error instanceof Error && "code" in error && error.code === "P2002") {
          results.push({ rowNumber, name, status: "failed", message: `A ${kindNames[kind]} with this identifier already exists.` });
        } else {
          this.logger.error(`Could not import ${kindNames[kind]} from row ${rowNumber}`, error instanceof Error ? error.stack : undefined);
          results.push({ rowNumber, name, status: "failed", message: `This ${kindNames[kind]} could not be created. Please retry the row or contact support.` });
        }
      }
    }
    return { results };
  }

  private async loadExisting(schoolId: string, kind: AcademicStructureKind): Promise<ExistingRecord[]> {
    if (kind === "classes") {
      return this.prisma.client.class.findMany({
        where: { schoolId, deletedAt: null },
        select: { name: true },
      });
    }
    if (kind === "departments") {
      return this.prisma.client.department.findMany({ where: { schoolId }, select: { name: true, code: true } });
    }
    if (kind === "houses") {
      return this.prisma.client.house.findMany({
        where: { schoolId },
        select: { id: true, name: true, code: true, description: true, color: true, motto: true, houseTeacherId: true, isActive: true },
      });
    }
    return this.prisma.client.club.findMany({ where: { schoolId }, select: { name: true } });
  }

  private isDuplicate(kind: AcademicStructureKind, data: RecordInput, existing: { name: string; code?: string }[]) {
    if (kind === "clubs" || kind === "classes") return existing.some((item) => normalize(item.name) === normalize(data.name));
    if (kind === "houses") {
      const house = data as CreateHouseInput;
      return existing.some((item) =>
        normalize(item.name) === normalize(house.name) ||
        normalize(item.code ?? "") === normalize(house.code),
      );
    }
    const department = data as CreateDepartmentInput;
    return existing.some((item) => normalize(item.code ?? "") === normalize(department.code));
  }
}
