import { BadRequestException, Body, Controller, Header, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { School } from "@prisma/client";
import { STUDENT_IMPORT_LIMITS, importStudentBatchSchema, type ImportStudentBatchInput } from "@schoolhub/shared";
import { CurrentSchool } from "../../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { StudentImportService } from "./student-import.service.js";

/**
 * Bulk student import. Limited to the people who run the school, because one
 * upload can create hundreds of accounts. Responses carry one-time passwords,
 * so they are never cached.
 */
@Controller("students/import")
@UseGuards(SchoolTenantGuard, RolesGuard)
@Roles("owner", "admin", "headteacher")
export class StudentImportController {
  constructor(private readonly imports: StudentImportService) {}

  /** Reads and checks a file without creating anything. */
  @Post("preview")
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: STUDENT_IMPORT_LIMITS.maxFileBytes, files: 1 } }))
  preview(@CurrentSchool() school: School, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Choose a file to upload.");
    return this.imports.preview(school, file);
  }

  /** Creates one batch of already-checked rows. The page sends a file's rows in several batches. */
  @Post()
  @Header("Cache-Control", "no-store")
  importBatch(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(importStudentBatchSchema)) body: ImportStudentBatchInput,
  ) {
    return this.imports.importBatch(school, actor.id, role, body);
  }
}
