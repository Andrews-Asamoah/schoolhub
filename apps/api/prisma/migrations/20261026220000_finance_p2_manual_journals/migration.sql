-- P2: add approval-controlled multi-line journals; does not change existing
-- posting rows, account balances or accounting policy.
CREATE TYPE "FinanceManualJournalStatus" AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'REVERSED', 'CANCELLED'
);

CREATE TABLE "finance_manual_journals" (
 "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL,
 "journalNumber" TEXT NOT NULL, "idempotencyKey" TEXT,
 "description" TEXT NOT NULL, "postingDate" DATE NOT NULL,
 "status" "FinanceManualJournalStatus" NOT NULL DEFAULT 'DRAFT',
 "totalAmount" DECIMAL(15,2) NOT NULL, "createdById" TEXT NOT NULL,
 "submittedAt" TIMESTAMP(3), "approvalHash" TEXT,
 "approvedById" TEXT, "approvalNote" TEXT,
 "approvedAt" TIMESTAMP(3), "postedById" TEXT, "postedAt" TIMESTAMP(3),
 "reversalOfId" TEXT, "reason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "finance_manual_journals_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_manual_journals_positive" CHECK ("totalAmount" > 0),
 CONSTRAINT "finance_manual_journals_school_fk" FOREIGN KEY ("schoolId")
   REFERENCES "schools"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "finance_manual_journals_school_number" ON "finance_manual_journals"("schoolId","journalNumber");
CREATE UNIQUE INDEX "finance_manual_journals_school_key" ON "finance_manual_journals"("schoolId","idempotencyKey");
CREATE UNIQUE INDEX "finance_manual_journals_reversalOfId_key" ON "finance_manual_journals"("reversalOfId");
CREATE INDEX "finance_manual_journals_school_status_date" ON "finance_manual_journals"("schoolId","status","postingDate");
ALTER TABLE "finance_manual_journals"
 ADD CONSTRAINT "finance_manual_journals_reversal_fk" FOREIGN KEY ("reversalOfId")
 REFERENCES "finance_manual_journals"("id") ON DELETE RESTRICT;

CREATE TABLE "finance_manual_journal_lines" (
 "id" TEXT NOT NULL, "journalId" TEXT NOT NULL, "position" INTEGER NOT NULL,
 "accountId" TEXT NOT NULL, "side" "FinanceJournalSide" NOT NULL,
 "amount" DECIMAL(15,2) NOT NULL,
 CONSTRAINT "finance_manual_journal_lines_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_manual_journal_lines_positive" CHECK ("amount" > 0),
 CONSTRAINT "finance_manual_journal_lines_position" CHECK ("position" >= 0),
 CONSTRAINT "finance_manual_journal_lines_journal_fk" FOREIGN KEY ("journalId")
  REFERENCES "finance_manual_journals"("id") ON DELETE RESTRICT,
 CONSTRAINT "finance_manual_journal_lines_account_fk" FOREIGN KEY ("accountId")
  REFERENCES "chart_accounts"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "finance_manual_journal_lines_journal_position"
 ON "finance_manual_journal_lines"("journalId","position");

CREATE TABLE "finance_manual_journal_postings" (
 "journalId" TEXT NOT NULL, "transactionId" TEXT NOT NULL,
 CONSTRAINT "finance_manual_journal_postings_pkey" PRIMARY KEY ("journalId","transactionId"),
 CONSTRAINT "finance_manual_journal_postings_journal_fk" FOREIGN KEY ("journalId")
  REFERENCES "finance_manual_journals"("id") ON DELETE RESTRICT,
 CONSTRAINT "finance_manual_journal_postings_transaction_fk" FOREIGN KEY ("transactionId")
  REFERENCES "transactions"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "finance_manual_journal_postings_transactionId_key"
 ON "finance_manual_journal_postings"("transactionId");

-- Make journal lines immutable once submitted. The approved hash is computed from
-- this immutable payload; line mutations are only permitted for DRAFT rows.
CREATE FUNCTION finance_manual_journal_line_guard() RETURNS trigger AS $$
DECLARE target_status "FinanceManualJournalStatus";
DECLARE target_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN target_id := OLD."journalId";
  ELSE target_id := NEW."journalId"; END IF;
  SELECT "status" INTO target_status FROM "finance_manual_journals"
   WHERE "id" = target_id FOR UPDATE;
  IF target_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Submitted journal lines cannot be changed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER finance_manual_journal_line_lock
 BEFORE INSERT OR UPDATE OR DELETE ON "finance_manual_journal_lines"
 FOR EACH ROW EXECUTE FUNCTION finance_manual_journal_line_guard();

-- Posted journal metadata is never deleted; status=REVERSED is allowed only by
-- the separately authorised reversal posting workflow. The financial source
-- Transaction rows remain protected by their existing immutable trigger.
