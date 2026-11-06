import { FinanceCloseService } from "./finance-close.service.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { Body, Controller, Get, Post, Query, Param, UseGuards, UseInterceptors } from "@nestjs/common";
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
  constructor(private readonly periods: FinancePeriodPreparationService, private readonly close: FinanceCloseService) {}

  @Get("period-controls/readiness") @Roles(...FINANCE_READ_ROLES)
  controlsReadiness(@CurrentSchool() school: School, @Query(new ZodValidationPipe(periodSchema)) query: z.infer<typeof periodSchema>) { return this.close.readiness(school.id, query.year, query.month); }
  @Get("period-controls/:id/history") @Roles(...FINANCE_READ_ROLES)
  history(@CurrentSchool() school: School, @Param("id") id:string) { return this.close.history(school.id,id); }
  @Get("period-controls/requests") @Roles(...FINANCE_READ_ROLES)
  requests(@CurrentSchool() school: School) { return this.close.requests(school.id); }
  @Post("period-controls/request-close") @Roles(...FINANCE_WRITE_ROLES)
  requestClose(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @Body(new ZodValidationPipe(periodSchema.extend({reason:z.string().trim().min(10).max(1000)}))) input: {year:number;month:number;reason:string}) { return this.close.request(school.id,actor.id,input.year,input.month,input.reason); }
  @Post("period-controls/:id/request-reopen") @Roles(...FINANCE_WRITE_ROLES)
  requestReopen(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @Param("id") id:string, @Body(new ZodValidationPipe(z.object({reason:z.string().trim().min(10).max(1000)}))) input:{reason:string}) { return this.close.reopen(school.id,actor.id,id,input.reason); }
  @Post("period-controls/:id/decide") @Roles("owner","headteacher")
  decideControl(@CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser, @CurrentSchoolRole() role:string|undefined, @Param("id") id:string, @Body(new ZodValidationPipe(z.object({approve:z.boolean(),note:z.string().trim().min(10).max(1000)}))) input:{approve:boolean;note:string}) { return this.close.decide(school.id,actor.id,role,id,input.approve,input.note); }

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
