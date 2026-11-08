import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { createReportSetSchema, type CreateReportSetInput } from "@schoolhub/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ReportPublicationService } from "./report-publication.service.js";
import { ReportVersionService } from "./report-version.service.js";
import type { Response } from "express";
import { ReportTemplatePresetsService } from "./report-template-presets.service.js";

@Controller("assessments/report-cards")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class ReportPublicationController {
  constructor(private readonly reports: ReportPublicationService,
    private readonly templatePresets: ReportTemplatePresetsService,
    private readonly versions: ReportVersionService) {}

  private recommendation(body: unknown): string {
    const remark = (body && typeof body === "object" && "remark" in body)
      ? (body as { remark: unknown }).remark : undefined;
    if (typeof remark !== "string" || remark.trim().length < 10 || remark.trim().length > 2000) {
      throw new BadRequestException("Write a recommendation of 10–2000 characters.");
    }
    return remark.trim();
  }

  @Get("teacher-queue")
  @Roles("teacher")
  getTeacherReviewQueue(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.versions.teacherQueue(school.id, user.id);
  }

  @Post("versions/:id/recommend")
  @Roles("teacher")
  recommend(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string, @Body() body: unknown) {
    return this.versions.recommend(school.id, user.id, id, this.recommendation(body));
  }

  @Patch("versions/:id/head-approve")
  @Roles("headteacher")
  headteacherApprove(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string, @Body() body: unknown) {
    return this.versions.headteacherApprove(school.id, user.id, id, this.recommendation(body));
  }

  @Get("me/:reportId/pdf")
  @Roles("student")
  async studentReportPdf(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser,
    @Param("reportId") reportId: string, @Res() res: Response) {
    const file = await this.versions.publishedPdf(school.id, user.id, reportId, "student");
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("Content-Disposition", 'attachment; filename="' + file.filename + '"');
    res.setHeader("Content-Length", file.pdf.length);
    res.end(file.pdf);
  }

  @Get("guardian/:reportId/pdf")
  @Roles("guardian")
  async guardianReportPdf(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser,
    @Param("reportId") reportId: string, @Res() res: Response) {
    const file = await this.versions.publishedPdf(school.id, user.id, reportId, "guardian");
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("Content-Disposition", 'attachment; filename="' + file.filename + '"');
    res.setHeader("Content-Length", file.pdf.length);
    res.end(file.pdf);
  }


  @Get("workspace")
  @Roles("owner", "admin", "headteacher")
  getWorkspace(@CurrentSchool() school: School) { return this.reports.getWorkspace(school.id); }

  @Get("sets/:id/reports")
  @Roles("owner", "admin", "headteacher")
  getSetReports(@CurrentSchool() school: School, @Param("id") id: string) {
    return this.reports.getSetReports(school.id, id);
  }

  @Post("templates/initialize-defaults")
  @Roles("owner", "admin", "headteacher")
  initializeTemplates(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser) {
    return this.templatePresets.initializeDefaultTemplates(school.id, user.id);
  }

  @Patch("templates/:id/activate")
  @Roles("owner", "admin", "headteacher")
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
  @Roles("owner", "admin", "headteacher")
  createSet(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createReportSetSchema)) body: CreateReportSetInput) {
    return this.reports.createSet(school.id, user.id, body);
  }

  @Post("sets/:id/generate")
  @Roles("owner", "admin", "headteacher")
  generate(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reports.generate(school.id, user.id, id);
  }

  @Patch("sets/:id/review")
  @Roles("owner", "admin", "headteacher")
  markReviewed(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reports.markReviewed(school.id, user.id, id);
  }

  @Patch("sets/:id/publish")
  @Roles("owner", "admin", "headteacher")
  publish(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reports.publish(school.id, user.id, id);
  }
}
