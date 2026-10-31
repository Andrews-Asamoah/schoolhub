CREATE TABLE finance_bank_statements (
 id TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL REFERENCES schools(id), "accountId" TEXT NOT NULL REFERENCES chart_accounts(id),
 "sourceBytes" BYTEA NOT NULL, "fileName" TEXT NOT NULL, "fileHash" TEXT NOT NULL, "startDate" DATE NOT NULL, "endDate" DATE NOT NULL,
 "openingBalance" NUMERIC(15,2) NOT NULL, "closingBalance" NUMERIC(15,2) NOT NULL, mapping JSONB NOT NULL,
 "duplicateReviewReason" TEXT, "createdById" TEXT NOT NULL REFERENCES users(id), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("schoolId","accountId","fileHash"), CHECK("startDate" <= "endDate")
);
CREATE INDEX ON finance_bank_statements("schoolId","accountId","startDate","endDate");
CREATE TABLE finance_bank_statement_lines (
 id TEXT PRIMARY KEY, "statementId" TEXT NOT NULL REFERENCES finance_bank_statements(id), "rowNumber" INTEGER NOT NULL,
 date DATE NOT NULL, amount NUMERIC(15,2) NOT NULL CHECK(amount <> 0), reference TEXT, description TEXT NOT NULL,
 UNIQUE("statementId","rowNumber")
);
CREATE TABLE finance_bank_reconciliations (
 id TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL REFERENCES schools(id), "accountId" TEXT NOT NULL REFERENCES chart_accounts(id),
 version INTEGER NOT NULL DEFAULT 1, "supersedesId" TEXT UNIQUE REFERENCES finance_bank_reconciliations(id),
 "statementId" TEXT NOT NULL REFERENCES finance_bank_statements(id), "periodEnd" DATE NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING','APPROVED','REJECTED')),
 "createdById" TEXT NOT NULL REFERENCES users(id), "submittedAt" TIMESTAMP(3), "decidedById" TEXT REFERENCES users(id),
 "decidedAt" TIMESTAMP(3), "decisionNote" TEXT, snapshot JSONB, "contentHash" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("statementId",version), CHECK("decidedById" IS NULL OR "decidedById" <> "createdById")
);
CREATE INDEX ON finance_bank_reconciliations("schoolId","accountId","periodEnd",status);
CREATE TABLE finance_bank_matches (
 id TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL REFERENCES schools(id), "accountId" TEXT NOT NULL REFERENCES chart_accounts(id),
 "reconciliationId" TEXT NOT NULL REFERENCES finance_bank_reconciliations(id), "statementLineId" TEXT NOT NULL REFERENCES finance_bank_statement_lines(id), "transactionId" TEXT NOT NULL REFERENCES transactions(id),
 amount NUMERIC(15,2) NOT NULL CHECK(amount > 0), "createdById" TEXT NOT NULL REFERENCES users(id),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("reconciliationId","statementLineId","transactionId")
);
CREATE INDEX ON finance_bank_matches("schoolId","accountId","transactionId");
-- Imported evidence is append-only; application code never changes source lines.
CREATE FUNCTION protect_bank_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Imported bank statement evidence is immutable'; END $$;
CREATE TRIGGER immutable_bank_statement BEFORE UPDATE OR DELETE ON finance_bank_statements FOR EACH ROW EXECUTE FUNCTION protect_bank_evidence();
CREATE TRIGGER immutable_bank_line BEFORE UPDATE OR DELETE ON finance_bank_statement_lines FOR EACH ROW EXECUTE FUNCTION protect_bank_evidence();
CREATE FUNCTION protect_bank_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status = 'APPROVED' THEN RAISE EXCEPTION 'Approved reconciliation is immutable'; END IF;
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Reconciliation history cannot be deleted'; END IF;
 IF NEW."schoolId" <> OLD."schoolId" OR NEW."accountId" <> OLD."accountId" OR NEW."statementId" <> OLD."statementId" OR NEW."createdById" <> OLD."createdById" OR NEW.version <> OLD.version OR NEW."supersedesId" IS DISTINCT FROM OLD."supersedesId" THEN RAISE EXCEPTION 'Reconciliation scope cannot change'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_bank_reconciliation BEFORE UPDATE OR DELETE ON finance_bank_reconciliations FOR EACH ROW EXECUTE FUNCTION protect_bank_reconciliation();
CREATE FUNCTION validate_bank_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stmt finance_bank_statements; recon finance_bank_reconciliations; posting transactions; line finance_bank_statement_lines; allocated NUMERIC;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW."schoolId"), hashtext('finance-bank-reconciliation'));
 IF NOT EXISTS(SELECT 1 FROM chart_accounts WHERE id = NEW."accountId" AND "schoolId" = NEW."schoolId" AND "accountType" = 'ASSET' AND category IN ('BANK','CASH')) THEN RAISE EXCEPTION 'Invalid reconciliation account scope'; END IF;
 IF TG_TABLE_NAME = 'finance_bank_statements' THEN
   IF EXISTS(SELECT 1 FROM finance_bank_statements WHERE "schoolId"=NEW."schoolId" AND "accountId"=NEW."accountId" AND "startDate"<=NEW."endDate" AND "endDate">=NEW."startDate") THEN RAISE EXCEPTION 'Overlapping statement'; END IF;
 ELSIF TG_TABLE_NAME = 'finance_bank_reconciliations' THEN
   SELECT * INTO STRICT stmt FROM finance_bank_statements WHERE id=NEW."statementId";
   IF stmt."schoolId"<>NEW."schoolId" OR stmt."accountId"<>NEW."accountId" OR stmt."endDate"<>NEW."periodEnd" THEN RAISE EXCEPTION 'Invalid statement scope'; END IF;
   IF NEW."supersedesId" IS NULL THEN
     IF NEW.version<>1 THEN RAISE EXCEPTION 'Initial reconciliation version must be one'; END IF;
   ELSE
     SELECT * INTO STRICT recon FROM finance_bank_reconciliations WHERE id=NEW."supersedesId";
     IF recon.status<>'APPROVED' OR recon."schoolId"<>NEW."schoolId" OR recon."accountId"<>NEW."accountId" OR recon."statementId"<>NEW."statementId" OR recon.version+1<>NEW.version THEN RAISE EXCEPTION 'Invalid reconciliation amendment scope'; END IF;
   END IF;
   IF stmt."openingBalance"+(SELECT COALESCE(SUM(amount),0) FROM finance_bank_statement_lines WHERE "statementId"=stmt.id)<>stmt."closingBalance" THEN RAISE EXCEPTION 'Statement movements do not reconcile to closing balance'; END IF;

 ELSE
   SELECT * INTO STRICT line FROM finance_bank_statement_lines WHERE id=NEW."statementLineId";
   SELECT * INTO STRICT stmt FROM finance_bank_statements WHERE id=line."statementId";
   SELECT * INTO STRICT recon FROM finance_bank_reconciliations WHERE id=NEW."reconciliationId";
   SELECT * INTO STRICT posting FROM transactions WHERE id=NEW."transactionId";
   IF recon."statementId"<>stmt.id OR EXISTS(SELECT 1 FROM finance_bank_reconciliations WHERE "supersedesId"=recon.id) OR recon.status<>'DRAFT' OR stmt."schoolId"<>NEW."schoolId" OR stmt."accountId"<>NEW."accountId" OR posting."schoolId"<>NEW."schoolId" OR posting."transactionDate">stmt."endDate" THEN RAISE EXCEPTION 'Invalid match scope or status'; END IF;
   IF NOT ((line.amount>0 AND posting."debitAccountId"=NEW."accountId") OR (line.amount<0 AND posting."creditAccountId"=NEW."accountId")) THEN RAISE EXCEPTION 'Invalid match direction'; END IF;
   SELECT COALESCE(SUM(m.amount),0) INTO allocated FROM finance_bank_matches m JOIN finance_bank_reconciliations r ON r.id=m."reconciliationId" WHERE m."statementLineId"=NEW."statementLineId" AND NOT EXISTS(SELECT 1 FROM finance_bank_reconciliations n WHERE n."supersedesId"=r.id);
   IF allocated+NEW.amount>ABS(line.amount) THEN RAISE EXCEPTION 'Statement line overallocated'; END IF;
   SELECT COALESCE(SUM(m.amount),0) INTO allocated FROM finance_bank_matches m JOIN finance_bank_reconciliations r ON r.id=m."reconciliationId" WHERE m."schoolId"=NEW."schoolId" AND m."accountId"=NEW."accountId" AND m."transactionId"=NEW."transactionId" AND NOT EXISTS(SELECT 1 FROM finance_bank_reconciliations n WHERE n."supersedesId"=r.id);
   IF allocated+NEW.amount>posting.amount THEN RAISE EXCEPTION 'Ledger posting overallocated'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_bank_statement_scope BEFORE INSERT ON finance_bank_statements FOR EACH ROW EXECUTE FUNCTION validate_bank_scope();
CREATE TRIGGER validate_bank_reconciliation_scope BEFORE INSERT ON finance_bank_reconciliations FOR EACH ROW EXECUTE FUNCTION validate_bank_scope();
CREATE TRIGGER validate_bank_match_scope BEFORE INSERT ON finance_bank_matches FOR EACH ROW EXECUTE FUNCTION validate_bank_scope();
CREATE FUNCTION protect_bank_matches() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(OLD."schoolId"), hashtext('finance-bank-reconciliation'));
 IF TG_OP='UPDATE' OR EXISTS(SELECT 1 FROM finance_bank_reconciliations r WHERE r.id=OLD."reconciliationId" AND r.status<>'DRAFT') THEN RAISE EXCEPTION 'Only draft matches may be removed; updates are prohibited'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER protect_bank_matches BEFORE UPDATE OR DELETE ON finance_bank_matches FOR EACH ROW EXECUTE FUNCTION protect_bank_matches();
-- Serialize finance source changes against close evidence collection and approval.
CREATE FUNCTION finance_close_boundary_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE school TEXT;
BEGIN
 school := CASE WHEN TG_OP='DELETE' THEN OLD."schoolId" ELSE NEW."schoolId" END;
 PERFORM pg_advisory_xact_lock(hashtext(school), hashtext('finance-posting-boundary'));
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['transactions','chart_accounts','bills','payments','payroll_records','finance_bill_adjustments','finance_revenue_schedules','finance_account_mappings','finance_bank_statements'] LOOP
   EXECUTE format('CREATE TRIGGER close_boundary_lock BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_close_boundary_lock()',tab);
 END LOOP;
END $$;
CREATE FUNCTION immutable_close_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Period snapshot history is immutable'; END $$;
CREATE TRIGGER immutable_period_snapshot BEFORE UPDATE OR DELETE ON finance_period_snapshots FOR EACH ROW EXECUTE FUNCTION immutable_close_snapshot();
CREATE TRIGGER immutable_period_snapshot_line BEFORE UPDATE OR DELETE ON finance_period_snapshot_lines FOR EACH ROW EXECUTE FUNCTION immutable_close_snapshot();
CREATE TRIGGER immutable_period_event BEFORE UPDATE OR DELETE ON finance_period_events FOR EACH ROW EXECUTE FUNCTION immutable_close_snapshot();

CREATE FUNCTION validate_bank_line_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stmt finance_bank_statements;
BEGIN
 SELECT * INTO STRICT stmt FROM finance_bank_statements WHERE id=NEW."statementId";
 IF EXISTS(SELECT 1 FROM finance_bank_reconciliations WHERE "statementId"=stmt.id) OR NEW.date<stmt."startDate" OR NEW.date>stmt."endDate" THEN RAISE EXCEPTION 'Statement evidence cannot be extended after import or outside its period'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_bank_line_insert BEFORE INSERT ON finance_bank_statement_lines FOR EACH ROW EXECUTE FUNCTION validate_bank_line_insert();
ALTER TABLE finance_bank_reconciliations ADD CONSTRAINT approved_bank_evidence_required CHECK(status<>'APPROVED' OR (snapshot IS NOT NULL AND "contentHash" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL));
