-- P0/P1 additive finance configuration. No data backfill or activation.
CREATE TYPE "FinanceApprovalSubject" AS ENUM ('MANUAL_JOURNAL','EXPENSE','SUPPLIER_PAYMENT','CREDIT_NOTE','WRITE_OFF','WAIVER','REFUND','PERIOD_CLOSE','PERIOD_REOPEN','ACCRUAL_CUTOVER','PAYROLL_RUN','BANK_RECONCILIATION','BUDGET_REVISION');
CREATE TYPE "FinanceApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE "FinanceBudgetControlMode" AS ENUM ('OFF','WARN','BLOCK');
CREATE TYPE "PayrollSettingStatus" AS ENUM ('DRAFT','ACTIVE','RETIRED');
CREATE TYPE "PayrollContributionBase" AS ENUM ('BASIC','GROSS','PENSIONABLE_ITEMS');

CREATE TABLE "finance_settings" (
  "schoolId" TEXT PRIMARY KEY REFERENCES "schools"("id") ON DELETE CASCADE,
  "baseCurrency" TEXT NOT NULL DEFAULT 'GHS',
  "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1 CHECK ("fiscalYearStartMonth" BETWEEN 1 AND 12),
  "allowSelfApproval" BOOLEAN NOT NULL DEFAULT false,
  "budgetControlMode" "FinanceBudgetControlMode" NOT NULL DEFAULT 'OFF',
  "revenuePolicyApprovedAt" TIMESTAMP(3),
  "revenuePolicyApprovedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "finance_approval_policies" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL,
  "subject" "FinanceApprovalSubject" NOT NULL,
  "minAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "requiredApprovals" INTEGER NOT NULL DEFAULT 1 CHECK ("requiredApprovals" >= 1),
  "approverPermission" TEXT NOT NULL
);
CREATE UNIQUE INDEX "finance_approval_policies_school_subject_min_key" ON "finance_approval_policies" ("schoolId","subject","minAmount");

CREATE TABLE "finance_approval_requests" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL,
  "subject" "FinanceApprovalSubject" NOT NULL,
  "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
  "amount" DECIMAL(15,2), "payloadHash" TEXT NOT NULL,
  "status" "FinanceApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "decisionNote" TEXT
);
CREATE INDEX "finance_approval_requests_school_status_subject_idx" ON "finance_approval_requests" ("schoolId","status","subject");
CREATE INDEX "finance_approval_requests_entity_idx" ON "finance_approval_requests" ("entityType","entityId");

CREATE TABLE "payroll_tax_schedules" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT, "name" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE,
  "nonResidentRate" DECIMAL(6,3) NOT NULL,
  "status" "PayrollSettingStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedById" TEXT, "sourceNote" TEXT,
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);
CREATE INDEX "payroll_tax_schedules_school_from_idx" ON "payroll_tax_schedules" ("schoolId","effectiveFrom");
CREATE TABLE "payroll_tax_bands" (
  "id" TEXT PRIMARY KEY, "scheduleId" TEXT NOT NULL REFERENCES "payroll_tax_schedules"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL, "width" DECIMAL(15,2), "rate" DECIMAL(6,3) NOT NULL,
  CONSTRAINT "payroll_tax_bands_schedule_position_key" UNIQUE ("scheduleId","position"),
  CHECK ("width" IS NULL OR "width" > 0),
  CHECK ("rate" BETWEEN 0 AND 100)
);
CREATE TABLE "payroll_contribution_schemes" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT, "key" TEXT NOT NULL, "label" TEXT NOT NULL,
  "trustee" TEXT, "base" "PayrollContributionBase" NOT NULL,
  "employeeRate" DECIMAL(6,3) NOT NULL, "employerRate" DECIMAL(6,3) NOT NULL,
  "memoRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
  "insurableMin" DECIMAL(15,2), "insurableMax" DECIMAL(15,2),
  "employeeShareTaxDeductible" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE,
  "status" "PayrollSettingStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceNote" TEXT, "approvedById" TEXT,
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CHECK ("employeeRate" BETWEEN 0 AND 100 AND "employerRate" BETWEEN 0 AND 100 AND "memoRate" BETWEEN 0 AND 100)
);
CREATE INDEX "payroll_contribution_schemes_school_key_from_idx" ON "payroll_contribution_schemes" ("schoolId","key","effectiveFrom");

ALTER TABLE "payroll_records" ADD COLUMN "taxScheduleId" TEXT;
ALTER TABLE "payroll_records" ADD COLUMN "settingsSnapshot" JSONB;
ALTER TABLE "payroll_records" ADD COLUMN "calculatedAt" TIMESTAMP(3);
