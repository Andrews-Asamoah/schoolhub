-- Finance P1 foundations + P0 shared write limiter. Additive only (expand step).
-- Rollback: DROP the new tables and columns below; restore the old unique index
-- ("payroll_records_schoolId_month_year_key") only if no run has runNumber > 1.

CREATE TYPE "PayrollResidency" AS ENUM ('RESIDENT', 'NON_RESIDENT');
CREATE TYPE "DeductionKind" AS ENUM ('LOAN', 'ADVANCE', 'UNION', 'OTHER');
CREATE TYPE "PayslipLineKind" AS ENUM ('EARNING', 'DEDUCTION', 'CONTRIBUTION', 'TAX');

-- Correction / supplementary runs: month+year may now repeat with a higher runNumber.
ALTER TABLE "payroll_records" ADD COLUMN "runNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payroll_records" ADD COLUMN "correctsRunId" TEXT;
DROP INDEX "payroll_records_schoolId_month_year_key";
CREATE UNIQUE INDEX "payroll_records_schoolId_month_year_runNumber_key"
  ON "payroll_records"("schoolId", "month", "year", "runNumber");

ALTER TABLE "payslips" ADD COLUMN "calculationSnapshot" JSONB;
ALTER TABLE "payslips" ADD COLUMN "residency" "PayrollResidency" NOT NULL DEFAULT 'RESIDENT';

CREATE TABLE "payroll_earning_types" (
  "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "taxable" BOOLEAN NOT NULL DEFAULT true, "pensionable" BOOLEAN NOT NULL DEFAULT false,
  "isOvertime" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "payroll_earning_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_earning_types_schoolId_code_key" ON "payroll_earning_types"("schoolId", "code");

CREATE TABLE "payroll_deduction_types" (
  "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "kind" "DeductionKind" NOT NULL DEFAULT 'OTHER', "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "payroll_deduction_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_deduction_types_schoolId_code_key" ON "payroll_deduction_types"("schoolId", "code");

CREATE TABLE "staff_pay_profiles" (
  "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL, "staffId" TEXT, "teacherId" TEXT,
  "basicSalary" DECIMAL(15,2) NOT NULL, "residency" "PayrollResidency" NOT NULL DEFAULT 'RESIDENT',
  "tin" TEXT, "ssnitNumber" TEXT, "schemeKeys" TEXT[] NOT NULL DEFAULT ARRAY['SSNIT_TIER1']::TEXT[],
  "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_pay_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_pay_profiles_one_person" CHECK (("staffId" IS NULL) <> ("teacherId" IS NULL)),
  CONSTRAINT "staff_pay_profiles_dates" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "staff_pay_profiles_salary" CHECK ("basicSalary" >= 0)
);
CREATE INDEX "staff_pay_profiles_school_staff_from_idx" ON "staff_pay_profiles"("schoolId", "staffId", "effectiveFrom");
CREATE INDEX "staff_pay_profiles_school_teacher_from_idx" ON "staff_pay_profiles"("schoolId", "teacherId", "effectiveFrom");
-- Two profiles for the same person may never have overlapping dates.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "staff_pay_profiles" ADD CONSTRAINT "staff_pay_profiles_no_overlap" EXCLUDE USING gist (
  "schoolId" WITH =, (COALESCE("staffId", "teacherId")) WITH =,
  daterange("effectiveFrom", COALESCE("effectiveTo" + 1, 'infinity'::date), '[)') WITH &&
);

CREATE TABLE "staff_recurring_items" (
  "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "earningTypeId" TEXT, "deductionTypeId" TEXT,
  "amount" DECIMAL(15,2) NOT NULL, "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE,
  CONSTRAINT "staff_recurring_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_recurring_items_one_type" CHECK (("earningTypeId" IS NULL) <> ("deductionTypeId" IS NULL)),
  CONSTRAINT "staff_recurring_items_amount" CHECK ("amount" >= 0),
  CONSTRAINT "staff_recurring_items_profile_fkey" FOREIGN KEY ("profileId") REFERENCES "staff_pay_profiles"("id") ON DELETE CASCADE
);
CREATE INDEX "staff_recurring_items_profileId_idx" ON "staff_recurring_items"("profileId");

CREATE TABLE "staff_loans" (
  "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL, "profileId" TEXT NOT NULL,
  "principal" DECIMAL(15,2) NOT NULL, "instalment" DECIMAL(15,2) NOT NULL, "balance" DECIMAL(15,2) NOT NULL,
  "startDate" DATE NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "staff_loans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_loans_amounts" CHECK ("principal" > 0 AND "instalment" > 0 AND "balance" >= 0),
  CONSTRAINT "staff_loans_profile_fkey" FOREIGN KEY ("profileId") REFERENCES "staff_pay_profiles"("id") ON DELETE CASCADE
);
CREATE INDEX "staff_loans_school_status_idx" ON "staff_loans"("schoolId", "status");

CREATE TABLE "payslip_lines" (
  "id" TEXT NOT NULL, "payslipId" TEXT NOT NULL, "kind" "PayslipLineKind" NOT NULL,
  "code" TEXT NOT NULL, "label" TEXT NOT NULL, "amount" DECIMAL(15,2) NOT NULL, "taxable" BOOLEAN,
  CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payslip_lines_payslip_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE
);
CREATE INDEX "payslip_lines_payslipId_idx" ON "payslip_lines"("payslipId");

-- Shared fixed-window write limiter (replaces the per-process in-memory map).
CREATE TABLE "finance_rate_limits" (
  "key" TEXT NOT NULL, "windowStart" TIMESTAMP(3) NOT NULL, "hits" INTEGER NOT NULL,
  CONSTRAINT "finance_rate_limits_pkey" PRIMARY KEY ("key")
);

-- Two ACTIVE settings for the same scope may never overlap in time (the resolver also
-- fails closed, but the database now refuses to hold an ambiguous state at all).
-- The platform default scope uses the empty string for a NULL schoolId.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "payroll_tax_schedules" ADD CONSTRAINT "payroll_tax_schedules_active_no_overlap" EXCLUDE USING gist (
  (COALESCE("schoolId", '')) WITH =,
  daterange("effectiveFrom", COALESCE("effectiveTo" + 1, 'infinity'::date), '[)') WITH &&
) WHERE ("status" = 'ACTIVE');
ALTER TABLE "payroll_contribution_schemes" ADD CONSTRAINT "payroll_contribution_schemes_active_no_overlap" EXCLUDE USING gist (
  (COALESCE("schoolId", '')) WITH =, "key" WITH =,
  daterange("effectiveFrom", COALESCE("effectiveTo" + 1, 'infinity'::date), '[)') WITH &&
) WHERE ("status" = 'ACTIVE');

-- Default maker-checker policy for payroll runs on schools that already exist.
-- Policy data only; no statutory rates are seeded here.
INSERT INTO "finance_approval_policies" ("id", "schoolId", "subject", "minAmount", "requiredApprovals", "approverPermission")
SELECT 'fap_' || md5(random()::text || s."id"), s."id", 'PAYROLL_RUN', 0, 1, 'PAYROLL_APPROVE' FROM "schools" s
ON CONFLICT DO NOTHING;
