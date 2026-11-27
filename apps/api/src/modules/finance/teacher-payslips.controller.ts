import { Controller, ForbiddenException, Get, Header, Param, Req, StreamableFile, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import type { Request } from "express";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { FinanceExportsService } from "./finance-exports.service.js";
import { FinanceService } from "./finance.service.js";

@Controller("finance/me/payslips")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class TeacherPayslipsController {
  constructor(
    private readonly finance: FinanceService,
    private readonly exports: FinanceExportsService,
  ) {}

  @Get()
  @Roles("teacher")
  @Header("Cache-Control", "private, no-store")
  list(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
  ) {
    this.assertTeacher(user, role);
    return this.finance.listOwnTeacherPayslips(school.id, user.id);
  }

  @Get(":payslipId/pdf")
  @Roles("teacher")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async pdf(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @Param("payslipId") payslipId: string,
    @Req() request: Request,
  ) {
    this.assertTeacher(user, role);
    const file = await this.exports.payslipPdf({
      schoolId: school.id, actorId: user.id, actorName: user.name,
      ipAddress: request.ip, userAgent: request.get("user-agent") ?? undefined,
    }, payslipId, { ownTeacherPayslip: true });
    const filename = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new StreamableFile(file.buffer, { type: file.contentType, disposition: `attachment; filename="${filename}"` });
  }

  private assertTeacher(user: AuthenticatedUser, role: string | undefined) {
    if (user.role === "superAdmin" || role !== "teacher") {
      throw new ForbiddenException("Only a teacher may access their own payslips here.");
    }
  }
}
