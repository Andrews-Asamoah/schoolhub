-- Per-school configuration of second-person finance approvals.
-- New schools start with approval switched OFF (the accountant alone completes the step).
-- Every school that exists when this migration runs is seeded with approval REQUIRED and the
-- owner/headteacher as approvers, which is exactly how the system behaved before, so no
-- existing school's controls are weakened silently. A school can change this in the admin portal.

CREATE TYPE "FinanceApprovalControl" AS ENUM (
  'PAYROLL_SETTINGS',
  'BANK_RECONCILIATION',
  'PERIOD_CONTROL',
  'MANUAL_JOURNAL',
  'INVOICE_ADJUSTMENT',
  'ACCOUNT_MAPPING'
);

ALTER TABLE "finance_approval_requests"
  ADD COLUMN "waivedByPolicy" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "finance_approval_settings" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "control" "FinanceApprovalControl" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "approverRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_approval_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_approval_settings_schoolId_control_key"
  ON "finance_approval_settings" ("schoolId", "control");

INSERT INTO "finance_approval_settings" ("id", "schoolId", "control", "required", "approverRoles", "updatedAt")
SELECT gen_random_uuid()::text, s."id", c."control", true, ARRAY['owner', 'headteacher']::TEXT[], CURRENT_TIMESTAMP
FROM "schools" s
CROSS JOIN (SELECT unnest(enum_range(NULL::"FinanceApprovalControl")) AS "control") c;


-- Some finance controls are also enforced by the database. When a school switches second
-- approval off, the preparer's own approval step must be allowed there too, and recorded.

-- Account mappings: the preparer may verify their own mapping only while the school's
-- ACCOUNT_MAPPING setting does not require a second approver.
ALTER TABLE "finance_account_mappings"
  ADD COLUMN "waivedByPolicy" BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.finance_validate_account_mapping()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE acct RECORD;
DECLARE expected_type "AccountType";
BEGIN
  SELECT "schoolId", "accountType", "isActive", "category"
    INTO acct FROM "chart_accounts" WHERE "id" = NEW."accountId";
  IF NOT FOUND OR acct."schoolId" <> NEW."schoolId" OR NOT acct."isActive" THEN
    RAISE EXCEPTION 'System account must be active and belong to the same school';
  END IF;
  expected_type := CASE NEW."purpose"
    WHEN 'STUDENT_RECEIVABLE' THEN 'ASSET'::"AccountType"
    WHEN 'FEE_REVENUE' THEN 'REVENUE'::"AccountType"
    WHEN 'BAD_DEBT_EXPENSE' THEN 'EXPENSE'::"AccountType"
    WHEN 'CONCESSION_EXPENSE' THEN 'EXPENSE'::"AccountType"
    ELSE 'LIABILITY'::"AccountType" END;
  IF acct."accountType" <> expected_type THEN
    RAISE EXCEPTION 'Mapped chart account has incorrect accounting type';
  END IF;
  IF NEW."purpose" = 'STUDENT_RECEIVABLE' AND acct."category" <> 'ACCOUNTS_RECEIVABLE'::"AccountCategory" THEN
    RAISE EXCEPTION 'Receivables purpose requires an accounts receivable control account';
  END IF;
  IF NEW."status" = 'ACTIVE' THEN
    IF NEW."approvedById" IS NULL OR NEW."approvedAt" IS NULL THEN
      RAISE EXCEPTION 'System mappings require independent verification';
    END IF;
    -- The preparer may verify their own mapping only when the school has switched second
    -- approval off for account mappings (the row is then marked waivedByPolicy).
    IF NEW."approvedById" = NEW."createdById" THEN
      IF NOT NEW."waivedByPolicy" OR EXISTS (
        SELECT 1 FROM "finance_approval_settings" s
        WHERE s."schoolId" = NEW."schoolId" AND s."control" = 'ACCOUNT_MAPPING' AND s."required"
      ) THEN
        RAISE EXCEPTION 'System mappings require independent verification';
      END IF;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(NEW."schoolId"), hashtext('finance-account-purpose'));
    IF EXISTS (
      SELECT 1 FROM "finance_account_mappings" m
      WHERE m."schoolId" = NEW."schoolId"
        AND m."purpose" = NEW."purpose"
        AND m."status" = 'ACTIVE'
        AND m."id" <> NEW."id"
        AND daterange(m."effectiveFrom", COALESCE(m."effectiveTo" + 1, 'infinity'::date), '[)')
          && daterange(NEW."effectiveFrom", COALESCE(NEW."effectiveTo" + 1, 'infinity'::date), '[)')
    ) THEN
      RAISE EXCEPTION 'Another active system mapping already covers these dates';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Bank reconciliations: the decider may equal the preparer only when the step was waived by policy.
ALTER TABLE "finance_bank_reconciliations"
  ADD COLUMN "waivedByPolicy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "finance_bank_reconciliations"
  DROP CONSTRAINT "finance_bank_reconciliations_check";
ALTER TABLE "finance_bank_reconciliations"
  ADD CONSTRAINT "finance_bank_reconciliations_decider_check"
  CHECK ("waivedByPolicy" OR "decidedById" IS NULL OR "decidedById" <> "createdById");
