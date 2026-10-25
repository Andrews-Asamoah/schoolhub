import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { FinanceWriteRateLimitGuard, SuperAdminReasonGuard } from "../finance-safeguards.js";
import { FINANCE_READ_ROLES, FINANCE_WRITE_ROLES } from "../finance.permissions.js";
import { PayrollSettingsService } from "./payroll-settings.service.js";

const decimalText = z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/, "Enter a non-negative decimal value.");
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const verifySchema = z.object({ verificationNotes: z.string().trim().min(10).max(1000) });
const taxScheduleSchema = z.object({
  name: z.string().trim().min(3).max(120),
  effectiveFrom: dateText,
  effectiveTo: dateText.nullable().optional(),
  sourceNote: z.string().trim().min(10).max(1000),
  nonResidentFlatRate: decimalText.nullable().optional(),
  bands: z.array(z.object({ width: decimalText.nullable(), rate: decimalText })).min(2).max(20),
});
const contributionSchemeSchema = z.object({
  code: z.enum(["SSNIT_TIER1", "TIER2", "TIER3", "CUSTOM"]),
  label: z.string().trim().min(2).max(120),
  trusteeName: z.string().trim().max(120).nullable().optional(),
  employeeRate: decimalText,
  employerRate: decimalText,
  base: z.enum(["BASIC", "GROSS", "PENSIONABLE_ITEMS"]),
  insurableMinimum: decimalText.nullable().optional(),
  insurableMaximum: decimalText.nullable().optional(),
  whoPays: z.enum(["EMPLOYEE", "EMPLOYER", "SHARED"]),
  employeeShareTaxDeductible: z.boolean(),
  tier3ReliefCap: decimalText.nullable().optional(),
  carvedFromSchemeId: z.string().min(1).nullable().optional(),
  carveType: z.enum(["CARVED_FROM_SCHEME", "ADDITIONAL"]),
  effectiveFrom: dateText,
  effectiveTo: dateText.nullable().optional(),
  sourceNote: z.string().trim().min(10).max(1000),
});

@Controller("finance/payroll-settings")
@UseGuards(SchoolTenantGuard, RolesGuard, SuperAdminReasonGuard, FinanceWriteRateLimitGuard)
export class PayrollSettingsController {
  constructor(private readonly settings: PayrollSettingsService) {}

  @Get("tax-schedules")
  @Roles(...FINANCE_READ_ROLES)
  listSchedules(@CurrentSchool() school: School) {
    return this.settings.listSchedules(school.id);
  }

  @Post("tax-schedules")
  @Roles(...FINANCE_WRITE_ROLES)
  createSchedule(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(taxScheduleSchema)) body: z.infer<typeof taxScheduleSchema>,
  ) {
    return this.settings.createSchedule(school.id, user.id, body);
  }

  @Post("tax-schedules/:id/submit")
  @Roles(...FINANCE_WRITE_ROLES)
  submitSchedule(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.settings.submitSchedule(school.id, user.id, id);
  }

  @Post("tax-schedules/:id/verify")
  @Roles("owner", "headteacher")
  verifySchedule(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(verifySchema)) body: z.infer<typeof verifySchema>,
  ) {
    return this.settings.verifySchedule(school.id, user.id, id, body.verificationNotes);
  }

  @Post("tax-schedules/:id/approve")
  @Roles("owner", "headteacher")
  approveSchedule(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.settings.approveSchedule(school.id, user.id, id);
  }

  @Get("contribution-schemes")
  @Roles(...FINANCE_READ_ROLES)
  listSchemes(@CurrentSchool() school: School) {
    return this.settings.listSchemes(school.id);
  }

  @Post("contribution-schemes")
  @Roles(...FINANCE_WRITE_ROLES)
  createScheme(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(contributionSchemeSchema)) body: z.infer<typeof contributionSchemeSchema>,
  ) {
    return this.settings.createScheme(school.id, user.id, body);
  }

  @Post("contribution-schemes/:id/submit")
  @Roles(...FINANCE_WRITE_ROLES)
  submitScheme(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.settings.submitScheme(school.id, user.id, id);
  }

  @Post("contribution-schemes/:id/verify")
  @Roles("owner", "headteacher")
  verifyScheme(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(verifySchema)) body: z.infer<typeof verifySchema>,
  ) {
    return this.settings.verifyScheme(school.id, user.id, id, body.verificationNotes);
  }

  @Post("contribution-schemes/:id/approve")
  @Roles("owner", "headteacher")
  approveScheme(@CurrentSchool() school: School, @CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.settings.approveScheme(school.id, user.id, id);
  }
}
