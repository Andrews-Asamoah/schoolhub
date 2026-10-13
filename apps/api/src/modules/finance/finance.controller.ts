import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { FinanceService } from "./finance.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  generateBillSchema,
  recordPaymentSchema,
  type GenerateBillInput,
  type RecordPaymentInput,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";

@Controller("finance")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get("fee-structures")
  listFeeStructures(@CurrentSchool() school: School) {
    return this.financeService.listFeeStructures(school.id);
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
  getStudentLedger(
    @CurrentSchool() school: School,
    @Param("studentId") studentId: string,
  ) {
    return this.financeService.getStudentLedger(school.id, studentId);
  }
}
