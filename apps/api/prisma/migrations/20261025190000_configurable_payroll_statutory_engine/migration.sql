CREATE TYPE "PayrollSettingsStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "PayrollContributionCode" AS ENUM ('SSNIT_TIER1', 'TIER2', 'TIER3', 'CUSTOM');
CREATE TYPE "PayrollContributionBase" AS ENUM ('BASIC', 'GROSS', 'PENSIONABLE_ITEMS');
CREATE TYPE "PayrollContributionPayer" AS ENUM ('EMPLOYEE', 'EMPLOYER', 'SHARED');
CREATE TYPE "PayrollContributionCarveType" AS ENUM ('CARVED_FROM_SCHEME', 'ADDITIONAL');
CREATE TYPE "PayrollPayItemKind" AS ENUM ('EARNING', 'DEDUCTION');
CREATE TYPE "PayslipLineKind" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION', 'MEMO');

CREATE TABLE "payroll_tax_schedules" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" "PayrollSettingsStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceNote" TEXT,
  "nonResidentFlatRate" DECIMAL(7,4),
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "needsVerification" BOOLEAN NOT NULL DEFAULT TRUE,
  "verificationNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_tax_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_tax_schedules_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_tax_schedules_schoolId_name_effectiveFrom_key" ON "payroll_tax_schedules"("schoolId", "name", "effectiveFrom");
CREATE INDEX "payroll_tax_schedules_schoolId_status_effectiveFrom_effectiveTo_idx" ON "payroll_tax_schedules"("schoolId", "status", "effectiveFrom", "effectiveTo");

CREATE TABLE "payroll_tax_bands" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "width" DECIMAL(15,2),
  "rate" DECIMAL(7,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_tax_bands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_tax_bands_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "payroll_tax_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_tax_bands_width_positive_check" CHECK ("width" IS NULL OR "width" > 0),
  CONSTRAINT "payroll_tax_bands_rate_range_check" CHECK ("rate" >= 0 AND "rate" <= 100),
  CONSTRAINT "payroll_tax_bands_order_positive_check" CHECK ("order" > 0)
);
CREATE UNIQUE INDEX "payroll_tax_bands_scheduleId_order_key" ON "payroll_tax_bands"("scheduleId", "order");
CREATE INDEX "payroll_tax_bands_scheduleId_idx" ON "payroll_tax_bands"("scheduleId");

CREATE TABLE "payroll_contribution_schemes" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "code" "PayrollContributionCode" NOT NULL,
  "label" TEXT NOT NULL,
  "trusteeName" TEXT,
  "employeeRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "employerRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "base" "PayrollContributionBase" NOT NULL DEFAULT 'BASIC',
  "insurableMinimum" DECIMAL(15,2),
  "insurableMaximum" DECIMAL(15,2),
  "whoPays" "PayrollContributionPayer" NOT NULL DEFAULT 'SHARED',
  "employeeShareTaxDeductible" BOOLEAN NOT NULL DEFAULT TRUE,
  "tier3ReliefCap" DECIMAL(15,2),
  "carvedFromSchemeId" TEXT,
  "carveType" "PayrollContributionCarveType" NOT NULL DEFAULT 'ADDITIONAL',
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" "PayrollSettingsStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceNote" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "needsVerification" BOOLEAN NOT NULL DEFAULT TRUE,
  "verificationNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_contribution_schemes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_contribution_schemes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_contribution_schemes_carvedFromSchemeId_fkey" FOREIGN KEY ("carvedFromSchemeId") REFERENCES "payroll_contribution_schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_contribution_schemes_employee_rate_check" CHECK ("employeeRate" >= 0 AND "employeeRate" <= 100),
  CONSTRAINT "payroll_contribution_schemes_employer_rate_check" CHECK ("employerRate" >= 0 AND "employerRate" <= 100),
  CONSTRAINT "payroll_contribution_schemes_insurable_range_check" CHECK ("insurableMinimum" IS NULL OR "insurableMaximum" IS NULL OR "insurableMinimum" <= "insurableMaximum")
);
CREATE INDEX "payroll_contribution_schemes_schoolId_code_status_effectiveFrom_effectiveTo_idx" ON "payroll_contribution_schemes"("schoolId", "code", "status", "effectiveFrom", "effectiveTo");
CREATE INDEX "payroll_contribution_schemes_carvedFromSchemeId_idx" ON "payroll_contribution_schemes"("carvedFromSchemeId");

CREATE TABLE "staff_contribution_enrolments" (
  "id" TEXT NOT NULL,
  "staffId" TEXT,
  "teacherId" TEXT,
  "schemeId" TEXT NOT NULL,
  "memberNumber" TEXT,
  "rateOverride" DECIMAL(7,4),
  "fixedAmountOverride" DECIMAL(15,2),
  "employerBearsEmployeeShare" BOOLEAN NOT NULL DEFAULT FALSE,
  "employerShareTaxable" BOOLEAN NOT NULL DEFAULT FALSE,
  "startsAt" DATE NOT NULL,
  "endsAt" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_contribution_enrolments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_contribution_enrolments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_contribution_enrolments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_contribution_enrolments_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "payroll_contribution_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_contribution_enrolments_exactly_one_person_check" CHECK (("staffId" IS NOT NULL)::integer + ("teacherId" IS NOT NULL)::integer = 1),
  CONSTRAINT "staff_contribution_enrolments_date_check" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE INDEX "staff_contribution_enrolments_staffId_startsAt_endsAt_idx" ON "staff_contribution_enrolments"("staffId", "startsAt", "endsAt");
CREATE INDEX "staff_contribution_enrolments_teacherId_startsAt_endsAt_idx" ON "staff_contribution_enrolments"("teacherId", "startsAt", "endsAt");
CREATE INDEX "staff_contribution_enrolments_schemeId_startsAt_endsAt_idx" ON "staff_contribution_enrolments"("schemeId", "startsAt", "endsAt");

CREATE TABLE "staff_pay_profiles" (
  "id" TEXT NOT NULL,
  "staffId" TEXT,
  "teacherId" TEXT,
  "ssnitNumber" TEXT,
  "tin" TEXT,
  "gradeOrPosition" TEXT,
  "department" TEXT,
  "taxResidency" TEXT NOT NULL DEFAULT 'RESIDENT',
  "paymentMode" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "bankName" TEXT,
  "bankBranch" TEXT,
  "bankAccountEncrypted" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_pay_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_pay_profiles_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_pay_profiles_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_pay_profiles_exactly_one_person_check" CHECK (("staffId" IS NOT NULL)::integer + ("teacherId" IS NOT NULL)::integer = 1)
);
CREATE UNIQUE INDEX "staff_pay_profiles_staffId_key" ON "staff_pay_profiles"("staffId");
CREATE UNIQUE INDEX "staff_pay_profiles_teacherId_key" ON "staff_pay_profiles"("teacherId");

CREATE TABLE "payroll_pay_items" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "kind" "PayrollPayItemKind" NOT NULL,
  "taxable" BOOLEAN NOT NULL DEFAULT FALSE,
  "pensionable" BOOLEAN NOT NULL DEFAULT FALSE,
  "recurring" BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_pay_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_pay_items_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_pay_items_schoolId_code_key" ON "payroll_pay_items"("schoolId", "code");
CREATE INDEX "payroll_pay_items_schoolId_isActive_kind_idx" ON "payroll_pay_items"("schoolId", "isActive", "kind");

CREATE TABLE "staff_pay_item_assignments" (
  "id" TEXT NOT NULL,
  "staffId" TEXT,
  "teacherId" TEXT,
  "payItemId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "startsAt" DATE NOT NULL,
  "endsAt" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_pay_item_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_pay_item_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_pay_item_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_pay_item_assignments_payItemId_fkey" FOREIGN KEY ("payItemId") REFERENCES "payroll_pay_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_pay_item_assignments_exactly_one_person_check" CHECK (("staffId" IS NOT NULL)::integer + ("teacherId" IS NOT NULL)::integer = 1),
  CONSTRAINT "staff_pay_item_assignments_amount_positive_check" CHECK ("amount" >= 0),
  CONSTRAINT "staff_pay_item_assignments_date_check" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE INDEX "staff_pay_item_assignments_staffId_startsAt_endsAt_idx" ON "staff_pay_item_assignments"("staffId", "startsAt", "endsAt");
CREATE INDEX "staff_pay_item_assignments_teacherId_startsAt_endsAt_idx" ON "staff_pay_item_assignments"("teacherId", "startsAt", "endsAt");
CREATE INDEX "staff_pay_item_assignments_payItemId_idx" ON "staff_pay_item_assignments"("payItemId");

CREATE TABLE "payroll_loans" (
  "id" TEXT NOT NULL,
  "staffId" TEXT,
  "teacherId" TEXT,
  "reference" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "originalAmount" DECIMAL(15,2) NOT NULL,
  "balance" DECIMAL(15,2) NOT NULL,
  "instalment" DECIMAL(15,2) NOT NULL,
  "startsAt" DATE NOT NULL,
  "endsAt" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_loans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_loans_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loans_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payroll_loans_exactly_one_person_check" CHECK (("staffId" IS NOT NULL)::integer + ("teacherId" IS NOT NULL)::integer = 1),
  CONSTRAINT "payroll_loans_amounts_check" CHECK ("originalAmount" >= 0 AND "balance" >= 0 AND "balance" <= "originalAmount" AND "instalment" >= 0),
  CONSTRAINT "payroll_loans_date_check" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt")
);
CREATE INDEX "payroll_loans_staffId_isActive_idx" ON "payroll_loans"("staffId", "isActive");
CREATE INDEX "payroll_loans_teacherId_isActive_idx" ON "payroll_loans"("teacherId", "isActive");

CREATE TABLE "payslip_lines" (
  "id" TEXT NOT NULL,
  "payslipId" TEXT NOT NULL,
  "kind" "PayslipLineKind" NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "originalAmount" DECIMAL(15,2),
  "balance" DECIMAL(15,2),
  "memo" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payslip_lines_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "payslip_lines_payslipId_kind_idx" ON "payslip_lines"("payslipId", "kind");
CREATE INDEX "payslip_lines_payslipId_code_idx" ON "payslip_lines"("payslipId", "code");

CREATE TABLE "salary_history" (
  "id" TEXT NOT NULL,
  "staffId" TEXT,
  "teacherId" TEXT,
  "monthlySalary" DECIMAL(15,2) NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "changedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salary_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "salary_history_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "salary_history_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "salary_history_exactly_one_person_check" CHECK (("staffId" IS NOT NULL)::integer + ("teacherId" IS NOT NULL)::integer = 1),
  CONSTRAINT "salary_history_salary_nonnegative_check" CHECK ("monthlySalary" >= 0)
);
CREATE INDEX "salary_history_staffId_effectiveDate_idx" ON "salary_history"("staffId", "effectiveDate");
CREATE INDEX "salary_history_teacherId_effectiveDate_idx" ON "salary_history"("teacherId", "effectiveDate");

ALTER TABLE "payroll_records"
  ADD COLUMN "totalEmployeeSSNIT" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalEmployerSSNIT" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalTier2" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalTier3" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxScheduleId" TEXT,
  ADD COLUMN "settingsSnapshot" JSONB,
  ADD CONSTRAINT "payroll_records_taxScheduleId_fkey" FOREIGN KEY ("taxScheduleId") REFERENCES "payroll_tax_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_totals_nonnegative_check"
  CHECK ("totalGross" >= 0 AND "totalNet" >= 0 AND "totalTax" >= 0 AND "totalSSNIT" >= 0 AND "totalEmployeeSSNIT" >= 0 AND "totalEmployerSSNIT" >= 0 AND "totalTier2" >= 0 AND "totalTier3" >= 0);

-- Seed a legacy-equivalent, deliberately unverified PAYE schedule for every
-- school. DRAFT status plus needsVerification prevents use until reviewed.
INSERT INTO "payroll_tax_schedules"
  ("id", "schoolId", "name", "effectiveFrom", "status", "sourceNote", "nonResidentFlatRate", "createdById", "needsVerification", "verificationNotes", "updatedAt")
SELECT
  'legacy-paye-' || s."id",
  s."id",
  'Legacy PAYE schedule (unverified)',
  DATE '2026-09-01',
  'DRAFT',
  'Legacy-equivalent seed from the existing application constants. Not legal advice; verify against current official GRA guidance before approval.',
  NULL,
  'system-migration',
  TRUE,
  'GHS 30,332 final finite monthly band retained per product decision. Tier 3 relief and employer-borne share tax treatment require official verification.',
  CURRENT_TIMESTAMP
FROM "schools" s
ON CONFLICT ("schoolId", "name", "effectiveFrom") DO NOTHING;

INSERT INTO "payroll_tax_bands" ("id", "scheduleId", "order", "width", "rate")
SELECT 'legacy-band-' || s."id" || '-' || b."ord", 'legacy-paye-' || s."id", b."ord", b."width", b."rate"
FROM "schools" s
CROSS JOIN (VALUES
  (1, 588.00::DECIMAL, 0.0000::DECIMAL),
  (2, 80.00::DECIMAL, 5.0000::DECIMAL),
  (3, 100.00::DECIMAL, 10.0000::DECIMAL),
  (4, 2900.00::DECIMAL, 17.5000::DECIMAL),
  (5, 16000.00::DECIMAL, 25.0000::DECIMAL),
  (6, 30332.00::DECIMAL, 30.0000::DECIMAL),
  (7, NULL::DECIMAL, 35.0000::DECIMAL)
) AS b(ord, width, rate)
WHERE EXISTS (SELECT 1 FROM "payroll_tax_schedules" p WHERE p."id" = 'legacy-paye-' || s."id")
ON CONFLICT ("scheduleId", "order") DO NOTHING;

-- Tier 1 seed mirrors current constants. It remains unverified and DRAFT;
-- no statutory scheme is made active by this migration.
INSERT INTO "payroll_contribution_schemes"
  ("id", "schoolId", "code", "label", "employeeRate", "employerRate", "base", "insurableMinimum", "insurableMaximum", "whoPays", "employeeShareTaxDeductible", "carveType", "effectiveFrom", "status", "sourceNote", "createdById", "needsVerification", "verificationNotes", "updatedAt")
SELECT
  'legacy-ssnit-tier1-' || s."id",
  s."id",
  'SSNIT_TIER1',
  'Legacy SSNIT Tier 1 (unverified)',
  5.5000,
  13.0000,
  'BASIC',
  587.80,
  69000.00,
  'SHARED',
  TRUE,
  'ADDITIONAL',
  DATE '2026-09-01',
  'DRAFT',
  'Legacy-equivalent application constants; verify with current official SSNIT guidance.',
  'system-migration',
  TRUE,
  'Unverified legacy contribution rates and insurable range. Must be reviewed before approval.',
  CURRENT_TIMESTAMP
FROM "schools" s
ON CONFLICT DO NOTHING;


-- Backfill immutable line snapshots for historical payslips without changing
-- any existing payslip or payroll-record totals. Existing values are copied
-- verbatim; these lines are a display/audit snapshot, not a recomputation.
INSERT INTO "payslip_lines" ("id", "payslipId", "kind", "code", "description", "amount", "originalAmount", "balance", "memo")
SELECT 'legacy-line-' || p."id" || '-BASIC', p."id", 'EARNING', 'BASIC', 'Basic salary', p."basicSalary", p."basicSalary", NULL, FALSE
FROM "payslips" p
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "payslip_lines" ("id", "payslipId", "kind", "code", "description", "amount", "originalAmount", "balance", "memo")
SELECT 'legacy-line-' || p."id" || '-ALLOWANCES', p."id", 'EARNING', 'ALLOWANCES', 'Allowances (historical aggregate)', p."allowances", p."allowances", NULL, FALSE
FROM "payslips" p
WHERE p."allowances" > 0
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "payslip_lines" ("id", "payslipId", "kind", "code", "description", "amount", "originalAmount", "balance", "memo")
SELECT 'legacy-line-' || p."id" || '-SSNIT_EMPLOYEE', p."id", 'DEDUCTION', 'SSNIT_EMPLOYEE', 'Employee SSNIT (historical aggregate)', p."ssnitEmployee", p."ssnitEmployee", NULL, FALSE
FROM "payslips" p
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "payslip_lines" ("id", "payslipId", "kind", "code", "description", "amount", "originalAmount", "balance", "memo")
SELECT 'legacy-line-' || p."id" || '-PAYE', p."id", 'DEDUCTION', 'PAYE', 'PAYE (historical aggregate)', p."incomeTax", p."incomeTax", NULL, FALSE
FROM "payslips" p
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "payslip_lines" ("id", "payslipId", "kind", "code", "description", "amount", "originalAmount", "balance", "memo")
SELECT 'legacy-line-' || p."id" || '-OTHER_DEDUCTIONS', p."id", 'DEDUCTION', 'OTHER_DEDUCTIONS', 'Other deductions (historical aggregate)', p."otherDeductions", p."otherDeductions", NULL, FALSE
FROM "payslips" p
WHERE p."otherDeductions" > 0
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "payslip_lines" ("id", "payslipId", "kind", "code", "description", "amount", "originalAmount", "balance", "memo")
SELECT 'legacy-line-' || p."id" || '-SSNIT_EMPLOYER', p."id", 'EMPLOYER_CONTRIBUTION', 'SSNIT_EMPLOYER', 'Employer SSNIT (memo)', p."ssnitEmployer", p."ssnitEmployer", NULL, TRUE
FROM "payslips" p
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "payslips"
  ADD COLUMN "tier2Employee" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tier2Employer" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tier3Employee" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Record existing salaries as opening history rows; no salary value is changed.
INSERT INTO "salary_history" ("id", "staffId", "monthlySalary", "effectiveDate", "reason", "changedById")
SELECT 'legacy-salary-staff-' || s."id", s."id", s."monthlySalary", s."hireDate",
       'Initial salary history backfill; copied from the existing staff salary field.',
       'system-migration'
FROM "staff" s
WHERE s."monthlySalary" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "salary_history" ("id", "teacherId", "monthlySalary", "effectiveDate", "reason", "changedById")
SELECT 'legacy-salary-teacher-' || t."id", t."id", t."monthlySalary", t."hireDate",
       'Initial salary history backfill; copied from the existing teacher salary field.',
       'system-migration'
FROM "teachers" t
WHERE t."monthlySalary" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "payslips"
  ADD COLUMN "tier3Employer" DECIMAL(15,2) NOT NULL DEFAULT 0;
