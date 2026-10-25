import { Body, Controller, Get, Patch, Param, UseGuards } from "@nestjs/common";
import { updateMyProfileSchema, type UpdateMyProfileInput } from "@schoolhub/shared";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import type { School } from "@prisma/client";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { MeService } from "./me.service.js";

/** The signed-in user's own profile. No role restriction: everyone may edit themselves, only themselves. */
@Controller("schools/current/me")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get("profile")
  getProfile(@CurrentUser() user: { id: string }, @CurrentSchoolRole() role: string | undefined) {
    return this.me.getProfile(user.id, role);
  }

  @Patch("profile")
  updateProfile(
    @CurrentUser() user: { id: string },
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(updateMyProfileSchema)) body: UpdateMyProfileInput,
  ) {
    return this.me.updateProfile(user.id, role, body);
  }

  @Get("payslips")
  getMyPayslips(@CurrentUser() user: { id: string }, @CurrentSchool() school: School) {
    return this.me.getMyPayslips(user.id, school.id);
  }

  @Get("payslips/:payslipId")
  getMyPayslip(
    @CurrentUser() user: { id: string },
    @CurrentSchool() school: School,
    @Param("payslipId") payslipId: string,
  ) {
    return this.me.getMyPayslip(user.id, school.id, payslipId);
  }

}
