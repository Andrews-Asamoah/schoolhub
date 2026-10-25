import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller.js";
import { FinanceService } from "./finance.service.js";
import { FinanceAuditInterceptor } from "./finance-audit.interceptor.js";
import { FinanceExportsService } from "./finance-exports.service.js";
import { PayrollSettingsController } from "./payroll/payroll-settings.controller.js";
import { PayrollSettingsService } from "./payroll/payroll-settings.service.js";

@Module({
  controllers: [FinanceController, PayrollSettingsController],
  providers: [FinanceService, FinanceExportsService, FinanceAuditInterceptor, PayrollSettingsService],
  exports: [FinanceService],
})
export class FinanceModule {}
