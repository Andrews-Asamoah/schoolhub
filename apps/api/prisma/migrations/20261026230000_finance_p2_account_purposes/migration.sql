-- P2 trusted chart-of-account assignments: no default mappings and no balance changes.
-- All finance automation must resolve an ACTIVE mapping effective on its posting date.
CREATE TYPE "FinanceAccountPurpose" AS ENUM (
 'STUDENT_RECEIVABLE', 'FEE_REVENUE', 'BAD_DEBT_EXPENSE',
 'CONCESSION_EXPENSE', 'DEFERRED_REVENUE', 'STUDENT_CREDIT_LIABILITY'
);
CREATE TYPE "FinanceAccountMappingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

CREATE TABLE "finance_account_mappings" (
 "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL,
 "purpose" "FinanceAccountPurpose" NOT NULL,
 "accountId" TEXT NOT NULL,
 "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE,
 "status" "FinanceAccountMappingStatus" NOT NULL DEFAULT 'DRAFT',
 "sourceNote" TEXT NOT NULL, "createdById" TEXT NOT NULL,
 "approvedById" TEXT, "approvedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "finance_account_mappings_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_account_mappings_dates" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo"),
 CONSTRAINT "finance_account_mappings_school_fk" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT,
 CONSTRAINT "finance_account_mappings_account_fk" FOREIGN KEY ("accountId") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "finance_account_mappings_school_purpose_date"
 ON "finance_account_mappings"("schoolId","purpose","effectiveFrom");
CREATE INDEX "finance_account_mappings_school_purpose_status"
 ON "finance_account_mappings"("schoolId","purpose","status");

-- DB-level protection against cross-school, wrong-type and overlapping mappings,
-- even if a future batch importer bypasses the Nest service.
CREATE FUNCTION finance_validate_account_mapping() RETURNS trigger AS $$
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
    IF NEW."approvedById" IS NULL OR NEW."approvedAt" IS NULL
       OR NEW."approvedById" = NEW."createdById" THEN
      RAISE EXCEPTION 'System mappings require independent verification';
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
$$ LANGUAGE plpgsql;
CREATE TRIGGER finance_account_mapping_validate
 BEFORE INSERT OR UPDATE ON "finance_account_mappings"
 FOR EACH ROW EXECUTE FUNCTION finance_validate_account_mapping();
