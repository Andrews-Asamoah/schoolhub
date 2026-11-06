import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Post,
  Put,
  Param,
  Query,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AssessmentsService } from "./assessments.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  STUDENT_IMPORT_LIMITS,
  importAssessmentMarksBatchSchema,
  saveAssessmentEntrySchema,
  type ImportAssessmentMarksBatchInput,
  type SaveAssessmentEntryInput,
} from "@schoolhub/shared";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import { AssessmentMarksImportService } from "./assessment-marks-import.service.js";
import type { School } from "@prisma/client";

@Controller("assessments")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AssessmentsController {
  constructor(
    private readonly assessmentsService: AssessmentsService,
    private readonly entry: AssessmentEntryService,
    private readonly marksImport: AssessmentMarksImportService,
  ) {}

  /** The marks screen for one class and subject: roster, applicable assessments, marks and totals. */
  @Get("entry")
  @Roles("owner", "admin", "headteacher", "teacher")
  getEntry(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Query("classId") classId: string,
    @Query("subjectId") subjectId: string,
    @Query("templateId") templateId?: string,
  ) {
    if (!classId || !subjectId) throw new BadRequestException("Choose a class and a subject.");
    return this.entry.getSheet(school.id, user.id, role, { classId, subjectId, templateId });
  }

  @Put("entry")
  @Roles("owner", "admin", "headteacher", "teacher")
  saveEntry(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(saveAssessmentEntrySchema)) body: SaveAssessmentEntryInput,
  ) {
    return this.entry.saveEntries(school.id, user.id, role, body);
  }

  /** Checks an uploaded CSV/XLSX of marks against the class list and returns a row-by-row preview. Saves nothing. */
  @Post("entry/import/preview")
  @Roles("owner", "admin", "headteacher", "teacher")
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: STUDENT_IMPORT_LIMITS.maxFileBytes, files: 1 } }))
  previewMarksImport(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("classId") classId: string,
    @Query("subjectId") subjectId: string,
    @Query("templateId") templateId: string,
  ) {
    if (!file) throw new BadRequestException("Choose a CSV or XLSX file.");
    if (!classId || !subjectId || !templateId) throw new BadRequestException("Choose a class, a subject and an assessment.");
    return this.marksImport.preview(school.id, user.id, role, { classId, subjectId, templateId }, file);
  }

  /** Saves one batch of previewed rows in a single transaction; every row gets its own created/updated/failed result. */
  @Post("entry/import")
  @Roles("owner", "admin", "headteacher", "teacher")
  @Header("Cache-Control", "no-store")
  importMarksBatch(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(importAssessmentMarksBatchSchema)) body: ImportAssessmentMarksBatchInput,
  ) {
    return this.marksImport.importBatch(school.id, user.id, role, body);
  }

  @Get("templates")
  @Roles("owner", "admin", "headteacher", "teacher")
  listTemplates(@CurrentSchool() school: School) {
    return this.assessmentsService.listAssessmentTemplates(school.id);
  }

  @Get("me/report")
  @Roles("student")
  getMyReport(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Query("termId") termId?: string,
  ) {
    return this.assessmentsService.getMyReportCard(school.id, user.id, termId);
  }

  @Get("student/:studentId/report")
  @Roles("owner", "admin", "headteacher", "teacher")
  getStudentReport(
    @CurrentSchool() school: School,
    @Param("studentId") studentId: string,
    @Query("termId") termId: string,
    @CurrentSchoolRole() role: string | undefined,
  ) {
    return this.assessmentsService.getStudentReportCard(
      school.id,
      studentId,
      termId,
      role,
    );
  }
}
