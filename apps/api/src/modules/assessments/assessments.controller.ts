import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { AssessmentsService } from "./assessments.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  recordScoreSchema,
  saveAssessmentEntrySchema,
  type RecordScoreInput,
  type SaveAssessmentEntryInput,
} from "@schoolhub/shared";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import type { School } from "@prisma/client";

@Controller("assessments")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AssessmentsController {
  constructor(
    private readonly assessmentsService: AssessmentsService,
    private readonly entry: AssessmentEntryService,
  ) {}

  /** The marks screen for one class and subject: roster, applicable assessments, marks and totals. */
  @Get("entry")
  @Roles("owner", "admin", "teacher")
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
  @Roles("owner", "admin", "teacher")
  saveEntry(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(saveAssessmentEntrySchema)) body: SaveAssessmentEntryInput,
  ) {
    return this.entry.saveEntries(school.id, user.id, role, body);
  }

  @Get("templates")
  @Roles("owner", "admin", "teacher")
  listTemplates(@CurrentSchool() school: School) {
    return this.assessmentsService.listAssessmentTemplates(school.id);
  }

  @Post("scores")
  @Roles("owner", "admin", "teacher")
  recordScore(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(recordScoreSchema)) body: RecordScoreInput,
  ) {
    return this.assessmentsService.recordComponentScore(
      school.id,
      user.id,
      body,
      role,
    );
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
  @Roles("owner", "admin", "teacher")
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
