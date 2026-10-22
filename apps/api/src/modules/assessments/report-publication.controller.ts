import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ReportPublicationService } from "./report-publication.service.js";
import { ReportTemplatePresetsService } from "./report-template-presets.service.js";

@Controller("assessments/report-cards")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class ReportPublicationController {
  constructor(private readonly reports: ReportPublicationService, private readonly templatePresets: ReportTemplatePresetsService) {}

  @Get("workspace")
  @Roles("owner", "admin", "headmistress")
  getWorkspace(@CurrentSchool() school: School) { return this.reports.getWorkspace(school.id); }

  @Get("sets/:id/reports")
  @Roles("owner", "admin", "headmistress")
  getSetReports(@CurrentSchool() school: School, @Param("id") id: string) {
    return this.reports.getSetReports(school.id, id);
  }

  @Post("templates/initialize-defaults")
  @Roles("owner", "admin", "headmistress")
  initializeTemplates(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.templatePresets.initializeDefaultTemplates(school.id, user.id);
  }

  @Patch("templates/:id/activate")
  @Roles("owner", "admin", "headmistress")
  activateTemplate(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.templatePresets.activateTemplate(school.id, user.id, id);
  }

  @Get("me")
  @Roles("student")
  getMyReports(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.getMyPublishedReports(school.id, user.id);
  }

  @Get("guardian")
  @Roles("guardian")
  getGuardianReports(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.getGuardianPublishedReports(school.id, user.id);
  }

  @Post("sets")
  @Roles("owner", "admin", "headmistress")
  createSet(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    if (!body || typeof body !== "object") throw new BadRequestException("Provide report-set details.");
    const input = body as Record<string, unknown>;
    if (typeof input.name !== "string" || !input.name.trim() || typeof input.templateId !== "string" || typeof input.academicYearId !== "string" || typeof input.termId !== "string" || !Array.isArray(input.classIds) || input.classIds.length === 0 || !input.classIds.every((id) => typeof id === "string")) {
      throw new BadRequestException("A name, report template, academic year, term, and at least one class are required.");
    }
    return this.reports.createSet(school.id, user.id, {
      name: input.name.trim(), templateId: input.templateId, academicYearId: input.academicYearId,
      termId: input.termId, classIds: [...new Set(input.classIds as string[])],
      publishAt: typeof input.publishAt === "string" && input.publishAt.trim() ? input.publishAt : null,
    });
  }

  @Post("sets/:id/generate")
  @Roles("owner", "admin", "headmistress")
  generate(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reports.generate(school.id, user.id, id);
  }

  @Patch("sets/:id/publish")
  @Roles("owner", "admin", "headmistress")
  publish(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reports.publish(school.id, user.id, id);
  }
}
