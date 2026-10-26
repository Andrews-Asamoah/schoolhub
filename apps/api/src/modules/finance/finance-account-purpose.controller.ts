import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import type { School } from "@prisma/client";
import { z } from "zod";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { FINANCE_READ_ROLES, FINANCE_WRITE_ROLES } from "./finance.permissions.js";
import { FinanceAuditInterceptor } from "./finance-audit.interceptor.js";
import { FinanceWriteRateLimitGuard, SuperAdminReasonGuard } from "./finance-safeguards.js";
import { FinanceAccountPurposeService } from "./finance-account-purpose.service.js";

const accountPurposeSchema = z.object({
  purpose: z.enum([
    "STUDENT_RECEIVABLE", "FEE_REVENUE", "BAD_DEBT_EXPENSE",
    "CONCESSION_EXPENSE", "DEFERRED_REVENUE", "STUDENT_CREDIT_LIABILITY",
  ]),
  accountId: z.string().min(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sourceNote: z.string().trim().min(10).max(1000),
});

@Controller("finance")
@UseGuards(SchoolTenantGuard, RolesGuard, SuperAdminReasonGuard, FinanceWriteRateLimitGuard)
@UseInterceptors(FinanceAuditInterceptor)
export class FinanceAccountPurposeController {
  constructor(private readonly purposes: FinanceAccountPurposeService) {}

  @Get("account-purposes")
  @Roles(...FINANCE_READ_ROLES)
  list(@CurrentSchool() school: School) {
    return this.purposes.list(school.id);
  }

  @Post("account-purposes")
  @Roles(...FINANCE_WRITE_ROLES)
  propose(
    @CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(accountPurposeSchema)) input: z.infer<typeof accountPurposeSchema>,
  ) {
    return this.purposes.propose(school.id, actor.id, input);
  }

  @Post("account-purposes/:mappingId/approve")
  @Roles(...FINANCE_READ_ROLES)
  approve(
    @CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @Param("mappingId") mappingId: string,
  ) {
    return this.purposes.approve(school.id, actor.id, mappingId, schoolRole, actor.role === "superAdmin");
  }
}
