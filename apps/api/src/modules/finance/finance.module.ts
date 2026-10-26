import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller.js";
import { FinanceService } from "./finance.service.js";
import { FinanceAuditInterceptor } from "./finance-audit.interceptor.js";
import { FinanceExportsService } from "./finance-exports.service.js";
import { FinanceApprovalService } from "./finance-approval.service.js";
import { FinanceLedgerIntegrityService } from "./finance-ledger-integrity.service.js";

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceExportsService, FinanceApprovalService, FinanceLedgerIntegrityService, FinanceAuditInterceptor],
  exports: [FinanceService, FinanceApprovalService],
})
export class FinanceModule {}
