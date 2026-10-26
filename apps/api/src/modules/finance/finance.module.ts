import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller.js";
import { FinanceService } from "./finance.service.js";
import { FinanceAuditInterceptor } from "./finance-audit.interceptor.js";
import { FinanceExportsService } from "./finance-exports.service.js";
import { FinanceApprovalService } from "./finance-approval.service.js";
import { FinancePostingService } from "./finance-posting.service.js";
import { FINANCE_RATE_LIMIT_STORE } from "./finance-safeguards.js";
import { DatabaseFinanceRateLimitStore } from "./finance-rate-limit.store.js";
import { FinanceIntegrityJob } from "./finance-integrity.job.js";
import { PayrollSettingsService } from "./payroll-settings.service.js";
import { FinanceLedgerIntegrityService } from "./finance-ledger-integrity.service.js";

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceExportsService, FinanceApprovalService, FinancePostingService, FinanceLedgerIntegrityService, FinanceAuditInterceptor,
    PayrollSettingsService, FinanceIntegrityJob, DatabaseFinanceRateLimitStore, { provide: FINANCE_RATE_LIMIT_STORE, useExisting: DatabaseFinanceRateLimitStore }],
  exports: [FinanceService, FinanceApprovalService],
})
export class FinanceModule {}
