import {
  Controller,
  Get,
  Post,
  Patch,
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
import { z } from "zod";

const feeStructureSchema = z.object({
  name: z.string().trim().min(2, "Enter a fee structure name").max(120),
  description: z.string().trim().max(500).optional(),
  classLevel: z.string().trim().max(120).optional(),
  termBased: z.boolean().default(true),
  targetClassIds: z.array(z.string().min(1)).max(100).default([]),
  items: z.array(z.object({
    registryItemId: z.string().optional().nullable(),
    name: z.string().trim().min(1, "Every fee item needs a name").max(120),
    amount: z.number().finite().min(0).max(100000000),
    isOptional: z.boolean().default(false),
    description: z.string().trim().max(500).optional(),
  })).min(1, "Add at least one fee item").max(100),
});
const feeItemRegistrySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name").max(120),
  description: z.string().trim().max(500).optional(),
});
const feeStructureStatusSchema = z.object({ isActive: z.boolean() });

@Controller("finance")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get("fee-structures")
  @Roles("owner", "admin", "accountant")
  listFeeStructures(@CurrentSchool() school: School) {
    return this.financeService.listFeeStructures(school.id);
  }

  @Post("fee-structures")
  @Roles("owner", "admin", "accountant")
  createFeeStructure(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(feeStructureSchema)) body: z.infer<typeof feeStructureSchema>,
  ) {
    return this.financeService.createFeeStructure(school.id, body);
  }

  @Patch("fee-structures/:feeStructureId")
  @Roles("owner", "admin", "accountant")
  setFeeStructureActive(
    @CurrentSchool() school: School,
    @Param("feeStructureId") feeStructureId: string,
    @Body(new ZodValidationPipe(feeStructureStatusSchema)) body: z.infer<typeof feeStructureStatusSchema>,
  ) {
    return this.financeService.setFeeStructureActive(school.id, feeStructureId, body.isActive);
  }

  @Get("fee-item-registry")
  @Roles("owner", "admin", "accountant")
  listFeeItemRegistry(@CurrentSchool() school: School) {
    return this.financeService.listFeeItemRegistry(school.id);
  }

  @Post("fee-item-registry")
  @Roles("owner", "admin", "accountant")
  createFeeItemRegistry(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(feeItemRegistrySchema)) body: z.infer<typeof feeItemRegistrySchema>,
  ) {
    return this.financeService.createFeeItemRegistry(school.id, body);
  }

  @Patch("fee-item-registry/:itemId")
  @Roles("owner", "admin", "accountant")
  updateFeeItemRegistry(
    @CurrentSchool() school: School,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(feeItemRegistrySchema)) body: z.infer<typeof feeItemRegistrySchema>,
  ) {
    return this.financeService.updateFeeItemRegistry(school.id, itemId, body);
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
