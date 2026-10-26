import { Body, Controller, Get, Post, Query, UseGuards, UseInterceptors } from "@nestjs/common";
import type { School } from "@prisma/client";
import { z } from "zod";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { FINANCE_READ_ROLES, FINANCE_WRITE_ROLES } from "./finance.permissions.js";
import { FinanceAuditInterceptor } from "./finance-audit.interceptor.js";
import { FinanceWriteRateLimitGuard, SuperAdminReasonGuard } from "./finance-safeguards.js";
import { FinancePeriodPreparationService } from "./finance-period-preparation.service.js";

const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

@Controller("finance")
@UseGuards(SchoolTenantGuard, RolesGuard, SuperAdminReasonGuard, FinanceWriteRateLimitGuard)
@UseInterceptors(FinanceAuditInterceptor)
export class FinancePeriodsController {
  constructor(private readonly periods: FinancePeriodPreparationService) {}

  @Get("periods")
  @Roles(...FINANCE_READ_ROLES)
  list(@CurrentSchool() school: School) {
    return this.periods.list(school.id);
  }

  @Get("periods/readiness")
  @Roles(...FINANCE_READ_ROLES)
  readiness(
    @CurrentSchool() school: School,
    @Query(new ZodValidationPipe(periodSchema)) query: z.infer<typeof periodSchema>,
  ) {
    return this.periods.readiness(school.id, query.year, query.month);
  }

  @Get("periods/snapshot-preview")
  @Roles(...FINANCE_READ_ROLES)
  snapshotPreview(
    @CurrentSchool() school: School,
    @Query(new ZodValidationPipe(periodSchema)) query: z.infer<typeof periodSchema>,
  ) {
    return this.periods.snapshotPreview(school.id, query.year, query.month);
  }

  @Post("periods/prepare")
  @Roles(...FINANCE_WRITE_ROLES)
  prepare(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(periodSchema)) body: z.infer<typeof periodSchema>,
  ) {
    return this.periods.prepare(school.id, user.id, body.year, body.month);
  }
}
