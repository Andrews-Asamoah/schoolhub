import {
  Controller,
  Get,
  Post,
  Param,
  Headers,
  Body,
  UseGuards,
} from "@nestjs/common";
import { FinanceService } from "./finance.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createExpenseSchema,
  generateBillSchema,
  recordPaymentSchema,
  type CreateExpenseInput,
  type GenerateBillInput,
  type RecordPaymentInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";

@Controller("finance")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get("fee-structures")
  @Roles("owner", "admin", "accountant")
  listFeeStructures(@CurrentSchool() school: School) {
    return this.financeService.listFeeStructures(school.id);
  }

  @Get("bills")
  @Roles("owner", "admin", "accountant")
  listBills(@CurrentSchool() school: School) {
    return this.financeService.listBills(school.id);
  }

  @Get("payments")
  @Roles("owner", "admin", "accountant")
  listPayments(@CurrentSchool() school: School) {
    return this.financeService.listPayments(school.id);
  }

  @Get("expenses")
  @Roles("owner", "admin", "accountant")
  listExpenses(@CurrentSchool() school: School) {
    return this.financeService.listExpenses(school.id);
  }

  @Post("expenses")
  @Roles("owner", "admin", "accountant")
  createExpense(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
  ) {
    return this.financeService.createExpense(school.id, user.id, body);
  }

  @Get("payroll")
  @Roles("owner", "admin", "accountant")
  listPayrollRecords(@CurrentSchool() school: School) {
    return this.financeService.listPayrollRecords(school.id);
  }

  @Post("bills/generate")
  @Roles("owner", "admin", "accountant")
  generateBills(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(generateBillSchema)) body: GenerateBillInput,
  ) {
    return this.financeService.generateBills(school.id, body);
  }

  @Post("payments")
  @Roles("owner", "admin", "accountant")
  recordPayment(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentInput,
  ) {
    return this.financeService.recordPayment(school.id, user.id, body);
  }

  @Get("students/:studentId/ledger")
  @Roles("owner", "admin", "accountant")
  getStudentLedger(
    @CurrentSchool() school: School,
    @Param("studentId") studentId: string,
    @CurrentSchoolRole() role: string | undefined,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
  ) {
    return this.financeService.getStudentLedger(
      school.id,
      studentId,
      role,
      academicYearId,
      termId,
    );
  }
}
