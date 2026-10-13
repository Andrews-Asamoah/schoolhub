import {
  Controller,
  Get,
  Post,
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
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { recordScoreSchema, type RecordScoreInput } from "@schoolhub/shared";
import type { School } from "@prisma/client";

@Controller("assessments")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get("templates")
  listTemplates(@CurrentSchool() school: School) {
    return this.assessmentsService.listAssessmentTemplates(school.id);
  }

  @Post("scores")
  @Roles("owner", "admin", "teacher")
  recordScore(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(recordScoreSchema)) body: RecordScoreInput,
  ) {
    return this.assessmentsService.recordComponentScore(
      school.id,
      user.id,
      body,
    );
  }

  @Get("student/:studentId/report")
  getStudentReport(
    @CurrentSchool() school: School,
    @Param("studentId") studentId: string,
    @Query("termId") termId: string,
  ) {
    return this.assessmentsService.getStudentReportCard(
      school.id,
      studentId,
      termId,
    );
  }
}
