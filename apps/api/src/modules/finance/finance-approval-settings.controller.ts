import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { z } from "zod";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { AuditActorParam } from "../../common/audit/audit-actor.decorator.js";
import type { AuditActor } from "../../common/audit/audit.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { FINANCE_APPROVAL_SETTINGS_READ_ROLES, FINANCE_APPROVAL_SETTINGS_WRITE_ROLES } from "./finance.permissions.js";
import { FINANCE_APPROVAL_CONTROLS, approvalSettingInputSchema, type ApprovalSettingInput } from "./finance-approval-settings.js";
import { FinanceApprovalSettingsService } from "./finance-approval-settings.service.js";

const controlSchema = z.enum(FINANCE_APPROVAL_CONTROLS);

@Controller("finance/approval-settings")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class FinanceApprovalSettingsController {
  constructor(private readonly settings: FinanceApprovalSettingsService) {}

  @Get() @Roles(...FINANCE_APPROVAL_SETTINGS_READ_ROLES)
  list(@CurrentSchool() school: School) {
    return this.settings.list(school.id);
  }

  @Put(":control") @Roles(...FINANCE_APPROVAL_SETTINGS_WRITE_ROLES)
  update(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSchoolRole() role: string | undefined,
    @AuditActorParam() actor: AuditActor,
    @Param("control", new ZodValidationPipe(controlSchema)) control: z.infer<typeof controlSchema>,
    @Body(new ZodValidationPipe(approvalSettingInputSchema)) body: ApprovalSettingInput,
  ) {
    return this.settings.update(school.id, actor, role, user.role === "superAdmin", control, body);
  }
}
