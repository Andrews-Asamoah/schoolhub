-- DropForeignKey
ALTER TABLE "finance_account_mappings" DROP CONSTRAINT "finance_account_mappings_account_fk";

-- DropForeignKey
ALTER TABLE "finance_account_mappings" DROP CONSTRAINT "finance_account_mappings_school_fk";

-- DropForeignKey
ALTER TABLE "finance_accounting_periods" DROP CONSTRAINT "finance_accounting_periods_school_fkey";

-- DropForeignKey
ALTER TABLE "finance_bill_adjustment_lines" DROP CONSTRAINT "finance_bill_adjustment_lines_adjustment_fkey";

-- DropForeignKey
ALTER TABLE "finance_bill_adjustment_lines" DROP CONSTRAINT "finance_bill_adjustment_lines_item_fkey";

-- DropForeignKey
ALTER TABLE "finance_bill_adjustments" DROP CONSTRAINT "finance_bill_adjustments_bill_fkey";

-- DropForeignKey
ALTER TABLE "finance_bill_adjustments" DROP CONSTRAINT "finance_bill_adjustments_school_fkey";

-- DropForeignKey
ALTER TABLE "finance_bill_adjustments" DROP CONSTRAINT "finance_bill_adjustments_student_fkey";

-- DropForeignKey
ALTER TABLE "finance_manual_journal_lines" DROP CONSTRAINT "finance_manual_journal_lines_account_fk";

-- DropForeignKey
ALTER TABLE "finance_manual_journal_lines" DROP CONSTRAINT "finance_manual_journal_lines_journal_fk";

-- DropForeignKey
ALTER TABLE "finance_manual_journal_postings" DROP CONSTRAINT "finance_manual_journal_postings_journal_fk";

-- DropForeignKey
ALTER TABLE "finance_manual_journal_postings" DROP CONSTRAINT "finance_manual_journal_postings_transaction_fk";

-- DropForeignKey
ALTER TABLE "finance_manual_journals" DROP CONSTRAINT "finance_manual_journals_reversal_fk";

-- DropForeignKey
ALTER TABLE "finance_manual_journals" DROP CONSTRAINT "finance_manual_journals_school_fk";

-- DropForeignKey
ALTER TABLE "finance_period_closing_checks" DROP CONSTRAINT "finance_period_closing_checks_run_fkey";

-- DropForeignKey
ALTER TABLE "finance_period_closing_runs" DROP CONSTRAINT "finance_period_closing_runs_period_fkey";

-- DropForeignKey
ALTER TABLE "finance_period_events" DROP CONSTRAINT "finance_period_events_period_fkey";

-- DropForeignKey
ALTER TABLE "finance_period_snapshot_lines" DROP CONSTRAINT "finance_period_snapshot_lines_snapshot_fkey";

-- DropForeignKey
ALTER TABLE "finance_period_snapshots" DROP CONSTRAINT "finance_period_snapshots_period_fkey";

-- DropForeignKey
ALTER TABLE "finance_period_snapshots" DROP CONSTRAINT "finance_period_snapshots_school_fkey";

-- DropForeignKey
ALTER TABLE "finance_revenue_schedule_lines" DROP CONSTRAINT "finance_revenue_schedule_lines_schedule_fkey";

-- DropForeignKey
ALTER TABLE "finance_revenue_schedules" DROP CONSTRAINT "finance_revenue_schedules_bill_fkey";

-- DropForeignKey
ALTER TABLE "finance_revenue_schedules" DROP CONSTRAINT "finance_revenue_schedules_item_fkey";

-- DropForeignKey
ALTER TABLE "finance_revenue_schedules" DROP CONSTRAINT "finance_revenue_schedules_school_fkey";

-- DropForeignKey
ALTER TABLE "finance_student_credit_entries" DROP CONSTRAINT "finance_student_credit_entries_bill_fkey";

-- DropForeignKey
ALTER TABLE "finance_student_credit_entries" DROP CONSTRAINT "finance_student_credit_entries_payment_fkey";

-- DropForeignKey
ALTER TABLE "finance_student_credit_entries" DROP CONSTRAINT "finance_student_credit_entries_school_fkey";

-- DropForeignKey
ALTER TABLE "finance_student_credit_entries" DROP CONSTRAINT "finance_student_credit_entries_student_fkey";

-- AddForeignKey
ALTER TABLE "finance_account_mappings" ADD CONSTRAINT "finance_account_mappings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_manual_journals" ADD CONSTRAINT "finance_manual_journals_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "finance_manual_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_manual_journal_lines" ADD CONSTRAINT "finance_manual_journal_lines_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "finance_manual_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_manual_journal_postings" ADD CONSTRAINT "finance_manual_journal_postings_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "finance_manual_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_manual_journal_postings" ADD CONSTRAINT "finance_manual_journal_postings_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_bill_adjustment_lines" ADD CONSTRAINT "finance_bill_adjustment_lines_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "finance_bill_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_revenue_schedule_lines" ADD CONSTRAINT "finance_revenue_schedule_lines_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "finance_revenue_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_period_closing_runs" ADD CONSTRAINT "finance_period_closing_runs_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "finance_accounting_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_period_closing_checks" ADD CONSTRAINT "finance_period_closing_checks_runId_fkey" FOREIGN KEY ("runId") REFERENCES "finance_period_closing_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_period_snapshots" ADD CONSTRAINT "finance_period_snapshots_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "finance_accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_period_snapshot_lines" ADD CONSTRAINT "finance_period_snapshot_lines_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "finance_period_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_period_events" ADD CONSTRAINT "finance_period_events_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "finance_accounting_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "finance_account_mappings_school_purpose_date" RENAME TO "finance_account_mappings_schoolId_purpose_effectiveFrom_key";

-- RenameIndex
ALTER INDEX "finance_account_mappings_school_purpose_status" RENAME TO "finance_account_mappings_schoolId_purpose_status_idx";

-- RenameIndex
ALTER INDEX "finance_bill_adjustments_school_bill_status_idx" RENAME TO "finance_bill_adjustments_schoolId_billId_status_idx";

-- RenameIndex
ALTER INDEX "finance_bill_adjustments_school_student_created_idx" RENAME TO "finance_bill_adjustments_schoolId_studentId_createdAt_idx";

-- RenameIndex
ALTER INDEX "finance_manual_journal_lines_journal_position" RENAME TO "finance_manual_journal_lines_journalId_position_key";

-- RenameIndex
ALTER INDEX "finance_manual_journals_school_key" RENAME TO "finance_manual_journals_schoolId_idempotencyKey_key";

-- RenameIndex
ALTER INDEX "finance_manual_journals_school_number" RENAME TO "finance_manual_journals_schoolId_journalNumber_key";

-- RenameIndex
ALTER INDEX "finance_manual_journals_school_status_date" RENAME TO "finance_manual_journals_schoolId_status_postingDate_idx";

-- RenameIndex
ALTER INDEX "finance_revenue_schedules_school_status_idx" RENAME TO "finance_revenue_schedules_schoolId_status_idx";

-- RenameIndex
ALTER INDEX "finance_student_credit_entries_kind_idx" RENAME TO "finance_student_credit_entries_schoolId_kind_createdAt_idx";

-- RenameIndex
ALTER INDEX "finance_student_credit_entries_student_idx" RENAME TO "finance_student_credit_entries_schoolId_studentId_createdAt_idx";
