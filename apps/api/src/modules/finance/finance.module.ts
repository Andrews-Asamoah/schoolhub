import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller.js";
import { FinanceService } from "./finance.service.js";
import { FinanceAuditInterceptor } from "./finance-audit.interceptor.js";

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceAuditInterceptor],
  exports: [FinanceService],
})
export class FinanceModule {}
