import { BadRequestException, Body, Controller, Header, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { School } from "@prisma/client";
import { STUDENT_IMPORT_LIMITS } from "@schoolhub/shared";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { StaffImportService } from "./staff-import.service.js";

@Controller("people/import")
@UseGuards(SchoolTenantGuard, RolesGuard)
@Roles("owner", "admin", "headteacher")
export class StaffImportController {
  constructor(private readonly imports: StaffImportService) {}

  @Post("preview")
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: STUDENT_IMPORT_LIMITS.maxFileBytes, files: 1 } }))
  preview(@CurrentSchool() school: School, @UploadedFile() file: Express.Multer.File | undefined, @Query("kind") kind: string) {
    if (!file) throw new BadRequestException("Choose a CSV or XLSX file.");
    if (kind !== "teacher" && kind !== "staff") throw new BadRequestException("kind must be teacher or staff.");
    return this.imports.preview(school, file, kind);
  }

  @Post()
  @Header("Cache-Control", "no-store")
  importBatch(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: { kind?: string; batchId?: string; rows?: { rowNumber: number; row: Record<string, unknown> }[] },
  ) {
    if (body.kind !== "teacher" && body.kind !== "staff") throw new BadRequestException("kind must be teacher or staff.");
    if (!body.batchId || body.batchId.length > 100) throw new BadRequestException("A valid batchId is required.");
    if (!Array.isArray(body.rows)) throw new BadRequestException("rows must be an array.");
    return this.imports.importBatch(school, actor.id, schoolRole, body.kind, body.batchId, body.rows);
  }
}
