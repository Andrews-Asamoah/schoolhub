-- DropForeignKey
ALTER TABLE "finance_settings" DROP CONSTRAINT "finance_settings_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "payroll_tax_bands" DROP CONSTRAINT "payroll_tax_bands_scheduleId_fkey";

-- DropForeignKey
ALTER TABLE "payslip_lines" DROP CONSTRAINT "payslip_lines_payslip_fkey";

-- DropForeignKey
ALTER TABLE "staff_loans" DROP CONSTRAINT "staff_loans_profile_fkey";

-- DropForeignKey
ALTER TABLE "staff_recurring_items" DROP CONSTRAINT "staff_recurring_items_profile_fkey";

-- AlterTable
ALTER TABLE "finance_settings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_tax_bands" ADD CONSTRAINT "payroll_tax_bands_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "payroll_tax_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_recurring_items" ADD CONSTRAINT "staff_recurring_items_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "staff_pay_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_loans" ADD CONSTRAINT "staff_loans_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "staff_pay_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "finance_approval_policies_school_subject_min_key" RENAME TO "finance_approval_policies_schoolId_subject_minAmount_key";

-- RenameIndex
ALTER INDEX "finance_approval_requests_entity_idx" RENAME TO "finance_approval_requests_entityType_entityId_idx";

-- RenameIndex
ALTER INDEX "finance_approval_requests_school_status_subject_idx" RENAME TO "finance_approval_requests_schoolId_status_subject_idx";

-- RenameIndex
ALTER INDEX "payroll_contribution_schemes_school_key_from_idx" RENAME TO "payroll_contribution_schemes_schoolId_key_effectiveFrom_idx";

-- RenameIndex
ALTER INDEX "payroll_tax_bands_schedule_position_key" RENAME TO "payroll_tax_bands_scheduleId_position_key";

-- RenameIndex
ALTER INDEX "payroll_tax_schedules_school_from_idx" RENAME TO "payroll_tax_schedules_schoolId_effectiveFrom_idx";

-- RenameIndex
ALTER INDEX "staff_loans_school_status_idx" RENAME TO "staff_loans_schoolId_status_idx";

-- RenameIndex
ALTER INDEX "staff_pay_profiles_school_staff_from_idx" RENAME TO "staff_pay_profiles_schoolId_staffId_effectiveFrom_idx";

-- RenameIndex
ALTER INDEX "staff_pay_profiles_school_teacher_from_idx" RENAME TO "staff_pay_profiles_schoolId_teacherId_effectiveFrom_idx";
