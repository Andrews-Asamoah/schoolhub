import { FinanceCloseService } from "./finance-close.service.js";
import { FinanceBankReconciliationController } from "./finance-bank-reconciliation.controller.js";
import { FinanceBankReconciliationService } from "./finance-bank-reconciliation.service.js";
import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller.js";
import { FinanceAccountPurposeController } from "./finance-account-purpose.controller.js";
import { FinanceAccountPurposeService } from "./finance-account-purpose.service.js";
import { FinanceManualJournalsController } from "./finance-manual-journals.controller.js";
import { FinanceManualJournalsService } from "./finance-manual-journals.service.js";
import { FinanceRevenueController } from "./finance-revenue.controller.js";
import { FinancePeriodsController } from "./finance-periods.controller.js";
import { FinancePeriodPreparationService } from "./finance-period-preparation.service.js";
import { FinanceRevenueAdjustmentsService } from "./finance-revenue-adjustments.service.js";
import { FinanceReceivableAdjustmentsService } from "./finance-receivable-adjustments.service.js";
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
  controllers: [FinanceBankReconciliationController, FinanceAccountPurposeController, FinanceController, FinanceRevenueController, FinancePeriodsController, FinanceManualJournalsController],
  providers: [FinanceCloseService, FinanceBankReconciliationService, FinanceReceivableAdjustmentsService, FinanceAccountPurposeService, FinanceManualJournalsService, FinancePeriodPreparationService, FinanceRevenueAdjustmentsService, FinanceService, FinanceExportsService, FinanceApprovalService, FinancePostingService, FinanceLedgerIntegrityService, FinanceAuditInterceptor,
    PayrollSettingsService, FinanceIntegrityJob, DatabaseFinanceRateLimitStore, { provide: FINANCE_RATE_LIMIT_STORE, useExisting: DatabaseFinanceRateLimitStore }],
  exports: [FinanceService, FinanceApprovalService],
})
export class FinanceModule {}
