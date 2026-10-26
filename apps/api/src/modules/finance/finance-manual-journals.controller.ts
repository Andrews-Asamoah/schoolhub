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
import { FinanceManualJournalsService } from "./finance-manual-journals.service.js";

const postingDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string().regex(/^\d{1,13}(?:\.\d{1,2})?$/);
const journalSchema = z.object({
  postingDate, description: z.string().trim().min(10).max(500),
  idempotencyKey: z.string().trim().min(12).max(120),
  lines: z.array(z.object({
    accountId: z.string().min(1),
    side: z.enum(["DEBIT", "CREDIT"]), amount: money,
  })).min(2).max(50),
});
const reversalSchema = z.object({
  postingDate, reason: z.string().trim().min(10).max(1000),
  idempotencyKey: z.string().trim().min(12).max(120),
});
const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().min(10).max(1000),
});

@Controller("finance")
@UseGuards(SchoolTenantGuard, RolesGuard, SuperAdminReasonGuard, FinanceWriteRateLimitGuard)
@UseInterceptors(FinanceAuditInterceptor)
export class FinanceManualJournalsController {
  constructor(private readonly journals: FinanceManualJournalsService) {}

  @Get("manual-journals")
  @Roles(...FINANCE_READ_ROLES)
  list(@CurrentSchool() school: School) {
    return this.journals.list(school.id);
  }

  @Get("manual-journals/:journalId")
  @Roles(...FINANCE_READ_ROLES)
  get(@CurrentSchool() school: School, @Param("journalId") journalId: string) {
    return this.journals.get(school.id, journalId);
  }

  @Post("manual-journals")
  @Roles(...FINANCE_WRITE_ROLES)
  create(
    @CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(journalSchema)) body: z.infer<typeof journalSchema>,
  ) {
    return this.journals.create(school.id, actor.id, body);
  }

  @Post("manual-journals/:journalId/submit")
  @Roles(...FINANCE_WRITE_ROLES)
  submit(
    @CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @Param("journalId") journalId: string,
  ) {
    return this.journals.submit(school.id, actor.id, journalId);
  }

  @Post("manual-journals/:journalId/decide")
  @Roles(...FINANCE_READ_ROLES)
  decide(
    @CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @Param("journalId") journalId: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>,
  ) {
    return this.journals.decide(
      school.id, actor.id, journalId, schoolRole, actor.role === "superAdmin",
      body.decision, body.note,
    );
  }

  @Post("manual-journals/:journalId/post")
  @Roles(...FINANCE_WRITE_ROLES)
  post(
    @CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @Param("journalId") journalId: string,
  ) {
    return this.journals.post(school.id, actor.id, journalId);
  }

  @Post("manual-journals/:journalId/reversal")
  @Roles(...FINANCE_WRITE_ROLES)
  reverse(
    @CurrentSchool() school: School, @CurrentUser() actor: AuthenticatedUser,
    @Param("journalId") journalId: string,
    @Body(new ZodValidationPipe(reversalSchema)) body: z.infer<typeof reversalSchema>,
  ) {
    return this.journals.requestReversal(school.id, actor.id, journalId, body);
  }
}
