-- P2: non-destructive mirror of the existing paired Transaction ledger.
-- Existing valid transactions are mirrored, not rewritten; invalid legacy rows
-- remain visible as reconciliation exceptions. No balances are altered.
CREATE TYPE "FinanceJournalSide" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "finance_journal_entries" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "postedDate" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "legacyBackfill" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_journal_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_journal_entries_transactionId_fkey" FOREIGN KEY ("transactionId")
    REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "finance_journal_entries_transactionId_key" ON "finance_journal_entries"("transactionId");
CREATE INDEX "finance_journal_entries_schoolId_postedDate_idx" ON "finance_journal_entries"("schoolId", "postedDate");

CREATE TABLE "finance_journal_lines" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "side" "FinanceJournalSide" NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  CONSTRAINT "finance_journal_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_journal_lines_positive" CHECK ("amount" > 0),
  CONSTRAINT "finance_journal_lines_entryId_fkey" FOREIGN KEY ("entryId")
    REFERENCES "finance_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "finance_journal_lines_entryId_side_key" ON "finance_journal_lines"("entryId", "side");
CREATE INDEX "finance_journal_lines_accountId_idx" ON "finance_journal_lines"("accountId");

-- Backfill only structurally valid historical postings. Never invent accounting
-- treatment for rows with invalid amounts, cross-school accounts or self-pairs.
INSERT INTO "finance_journal_entries"
  ("id", "schoolId", "transactionId", "postedDate", "description",
   "referenceType", "referenceId", "legacyBackfill")
SELECT 'je_' || md5(t."id"), t."schoolId", t."id",
       t."transactionDate", t."description", t."referenceType",
       t."referenceId", true
FROM "transactions" t
JOIN "chart_accounts" d ON d."id" = t."debitAccountId" AND d."schoolId" = t."schoolId"
JOIN "chart_accounts" c ON c."id" = t."creditAccountId" AND c."schoolId" = t."schoolId"
WHERE t."amount" > 0 AND t."debitAccountId" <> t."creditAccountId"
ON CONFLICT ("transactionId") DO NOTHING;

INSERT INTO "finance_journal_lines" ("id", "entryId", "accountId", "side", "amount")
SELECT 'jl_' || md5(t."id" || ':debit'), e."id",
       t."debitAccountId", 'DEBIT'::"FinanceJournalSide", t."amount"
FROM "finance_journal_entries" e
JOIN "transactions" t ON t."id" = e."transactionId"
ON CONFLICT ("entryId", "side") DO NOTHING;
INSERT INTO "finance_journal_lines" ("id", "entryId", "accountId", "side", "amount")
SELECT 'jl_' || md5(t."id" || ':credit'), e."id",
       t."creditAccountId", 'CREDIT'::"FinanceJournalSide", t."amount"
FROM "finance_journal_entries" e
JOIN "transactions" t ON t."id" = e."transactionId"
ON CONFLICT ("entryId", "side") DO NOTHING;

-- Future postings create journal headers and both lines in the same SQL statement
-- and outer business transaction. A trigger failure rolls the posting back.
CREATE FUNCTION finance_mirror_transaction_to_journal() RETURNS trigger AS $$
BEGIN
  IF NEW."amount" <= 0 OR NEW."debitAccountId" = NEW."creditAccountId" THEN
    RAISE EXCEPTION 'Invalid paired ledger posting: positive amount and different accounts required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "chart_accounts" a WHERE a."id" = NEW."debitAccountId"
      AND a."schoolId" = NEW."schoolId"
  ) OR NOT EXISTS (
    SELECT 1 FROM "chart_accounts" a WHERE a."id" = NEW."creditAccountId"
      AND a."schoolId" = NEW."schoolId"
  ) THEN
    RAISE EXCEPTION 'Both posting accounts must belong to the journal school';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "finance_period_locks" p
    WHERE p."schoolId" = NEW."schoolId" AND NEW."transactionDate" <= p."lockedThrough"
  ) OR EXISTS (
    SELECT 1 FROM "finance_accounting_periods" p
    WHERE p."schoolId" = NEW."schoolId" AND p."status" = 'CLOSED'
      AND NEW."transactionDate" BETWEEN p."startDate" AND p."endDate"
  ) THEN
    RAISE EXCEPTION 'Posting date is inside a closed financial period';
  END IF;

  INSERT INTO "finance_journal_entries"
   ("id", "schoolId", "transactionId", "postedDate", "description", "referenceType", "referenceId")
  VALUES ('je_' || md5(NEW."id"), NEW."schoolId", NEW."id",
          NEW."transactionDate", NEW."description", NEW."referenceType", NEW."referenceId");
  INSERT INTO "finance_journal_lines" ("id", "entryId", "accountId", "side", "amount")
  VALUES
    ('jl_' || md5(NEW."id" || ':debit'), 'je_' || md5(NEW."id"),
     NEW."debitAccountId", 'DEBIT', NEW."amount"),
    ('jl_' || md5(NEW."id" || ':credit'), 'je_' || md5(NEW."id"),
     NEW."creditAccountId", 'CREDIT', NEW."amount");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_transaction_journal_insert
  AFTER INSERT ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION finance_mirror_transaction_to_journal();

-- Never silently rewrite/delete posted transactions and journal history.
-- Explicit archive-purge context is reserved for controlled test-data cleanup
-- and verified legal-retention deletion, not ordinary application paths.
CREATE FUNCTION finance_reject_posted_journal_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.finance_archive_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Posted financial ledger records are immutable; create a new reversing entry';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_transaction_immutable
  BEFORE UPDATE OR DELETE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_posted_journal_mutation();
CREATE TRIGGER finance_journal_entry_immutable
  BEFORE UPDATE OR DELETE ON "finance_journal_entries"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_posted_journal_mutation();
CREATE TRIGGER finance_journal_line_immutable
  BEFORE UPDATE OR DELETE ON "finance_journal_lines"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_posted_journal_mutation();

-- Deployment preflight: count unmirrored rows by school. Any nonzero is an
-- explicit blocking exception for I3, not something to auto-correct.
-- SELECT t."schoolId", COUNT(*) FROM "transactions" t
-- LEFT JOIN "finance_journal_entries" e ON e."transactionId"=t."id"
-- WHERE e."id" IS NULL GROUP BY t."schoolId";
