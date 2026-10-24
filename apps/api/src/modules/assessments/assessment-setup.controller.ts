import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import {
  saveAssessmentTemplateSchema,
  saveGradingSystemSchema,
  type SaveAssessmentTemplateInput,
  type SaveGradingSystemInput,
} from "@schoolhub/shared";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AssessmentSetupService } from "./assessment-setup.service.js";

/** Setting up assessments is for the people who run the school. */
@Controller("assessments/setup")
@UseGuards(SchoolTenantGuard, RolesGuard)
@Roles("owner", "admin", "headteacher")
export class AssessmentSetupController {
  constructor(private readonly setup: AssessmentSetupService) {}

  @Get()
  getSetup(@CurrentSchool() school: School) {
    return this.setup.getSetup(school.id);
  }

  @Post("templates")
  createTemplate(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(saveAssessmentTemplateSchema)) body: SaveAssessmentTemplateInput,
  ) {
    return this.setup.createTemplate(school.id, user.id, body);
  }

  @Put("templates/:id")
  updateTemplate(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveAssessmentTemplateSchema)) body: SaveAssessmentTemplateInput,
  ) {
    return this.setup.updateTemplate(school.id, user.id, id, body);
  }

  @Post("templates/:id/duplicate")
  duplicateTemplate(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.setup.duplicateTemplate(school.id, user.id, id);
  }

  @Delete("templates/:id")
  deleteTemplate(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.setup.deleteTemplate(school.id, user.id, id);
  }

  @Post("grading-systems")
  createGradingSystem(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(saveGradingSystemSchema)) body: SaveGradingSystemInput,
  ) {
    return this.setup.createGradingSystem(school.id, user.id, body);
  }

  @Put("grading-systems/:id")
  updateGradingSystem(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveGradingSystemSchema)) body: SaveGradingSystemInput,
  ) {
    return this.setup.updateGradingSystem(school.id, user.id, id, body);
  }

  @Delete("grading-systems/:id")
  deleteGradingSystem(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.setup.deleteGradingSystem(school.id, user.id, id);
  }
}
