import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, UseInterceptors } from "@nestjs/common";
import type { School } from "@prisma/client";
import { z } from "zod";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { FINANCE_READ_ROLES, FINANCE_WRITE_ROLES } from "./finance.permissions.js";
import { FinanceAuditInterceptor, FinanceSelfAudited } from "./finance-audit.interceptor.js";
import { FinanceWriteRateLimitGuard, SuperAdminReasonGuard } from "./finance-safeguards.js";
import { FinanceRevenueAdjustmentsService } from "./finance-revenue-adjustments.service.js";
import { FinanceReceivableAdjustmentsService } from "./finance-receivable-adjustments.service.js";

const adjustmentDraftSchema = z.object({
  billId: z.string().min(1),
  kind: z.enum(["CREDIT_NOTE", "WRITE_OFF", "WAIVER"]),
  reasonCode: z.string().trim().min(2).max(80),
  reason: z.string().trim().min(10).max(1000),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(z.object({
    billItemId: z.string().min(1),
    amount: z.string().regex(/^\d{1,13}(?:\.\d{1,2})?$/),
  })).min(1).max(100),
});
const limitSchema = z.coerce.number().int().min(1).max(100).default(50);
const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().min(10).max(1000),
});

/** P3 draft-only controller: no endpoint can post a financial adjustment. */
@Controller("finance")
@UseGuards(SchoolTenantGuard, RolesGuard, SuperAdminReasonGuard, FinanceWriteRateLimitGuard)
@UseInterceptors(FinanceAuditInterceptor)
export class FinanceRevenueController {
  constructor(
    private readonly adjustments: FinanceRevenueAdjustmentsService,
    private readonly approved: FinanceReceivableAdjustmentsService,
  ) {}

  @Get("revenue/preflight")
  @Roles(...FINANCE_READ_ROLES)
  preflight(@CurrentSchool() school: School) {
    return this.adjustments.preflight(school.id);
  }

  @Get("adjustments")
  @Roles(...FINANCE_READ_ROLES)
  list(@CurrentSchool() school: School, @Query("limit", new ZodValidationPipe(limitSchema)) limit: number) {
    return this.adjustments.list(school.id, limit);
  }

  @Post("adjustments/drafts")
  @Roles(...FINANCE_WRITE_ROLES)
  create(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(adjustmentDraftSchema)) input: z.infer<typeof adjustmentDraftSchema>,
  ) {
    return this.adjustments.createDraft(school.id, user.id, input);
  }

  @Post("adjustments/:id/submit")
  @Roles(...FINANCE_WRITE_ROLES)
  submit(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.approved.submit(school.id, actor.id, id);
  }

  @Post("adjustments/:id/decide")
  @Roles(...FINANCE_READ_ROLES)
  decide(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>,
  ) {
    return this.approved.decide(
      school.id, actor.id, schoolRole, actor.role === "superAdmin",
      id, body.decision, body.note,
    );
  }

  @Post("adjustments/:id/post")
  @Roles(...FINANCE_WRITE_ROLES)
  @FinanceSelfAudited()
  post(
    @CurrentSchool() school: School,
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.approved.post(school.id, actor.id, id);
  }

  @Delete("adjustments/drafts/:id")
  @Roles(...FINANCE_WRITE_ROLES)
  discard(@CurrentSchool() school: School, @Param("id") id: string) {
    return this.adjustments.discardDraft(school.id, id);
  }
}
