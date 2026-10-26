-- P4 expand-only: period-closing records exist independently of legacy FinancePeriodLock.
-- Nothing is closed by this migration.
CREATE TYPE "FinancePeriodType" AS ENUM ('MONTH', 'TERM', 'YEAR');
CREATE TYPE "FinancePeriodStatus" AS ENUM ('OPEN', 'SOFT_CLOSED', 'CLOSED');
CREATE TYPE "FinanceClosingCheckSeverity" AS ENUM ('BLOCKING', 'WARNING');
CREATE TYPE "FinanceClosingCheckResult" AS ENUM ('PASS', 'FAIL', 'WAIVED');

CREATE TABLE "finance_accounting_periods" (
 "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL, "type" "FinancePeriodType" NOT NULL,
 "name" TEXT NOT NULL, "startDate" DATE NOT NULL, "endDate" DATE NOT NULL,
 "academicYearId" TEXT, "termId" TEXT, "status" "FinancePeriodStatus" NOT NULL DEFAULT 'OPEN',
 "closedAt" TIMESTAMP(3), "closedById" TEXT, "reopenCount" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "finance_accounting_periods_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_accounting_periods_dates" CHECK ("startDate" <= "endDate"),
 CONSTRAINT "finance_accounting_periods_reopen" CHECK ("reopenCount" >= 0),
 CONSTRAINT "finance_accounting_periods_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "finance_accounting_periods_schoolId_type_startDate_key"
 ON "finance_accounting_periods"("schoolId","type","startDate");
CREATE INDEX "finance_accounting_periods_schoolId_status_idx" ON "finance_accounting_periods"("schoolId","status");
CREATE INDEX "finance_accounting_periods_schoolId_type_endDate_idx" ON "finance_accounting_periods"("schoolId","type","endDate");
-- Prevent overlapping periods even if created by distinct API instances.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "finance_accounting_periods" ADD CONSTRAINT "finance_accounting_periods_no_overlap"
 EXCLUDE USING gist ("schoolId" WITH =, "type" WITH =,
 daterange("startDate", "endDate" + 1, '[)') WITH &&);

CREATE TABLE "finance_period_closing_runs" (
 "id" TEXT NOT NULL, "periodId" TEXT NOT NULL, "startedById" TEXT NOT NULL,
 "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "passed" BOOLEAN NOT NULL DEFAULT false, "approvalRequestId" TEXT,
 CONSTRAINT "finance_period_closing_runs_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_period_closing_runs_period_fkey" FOREIGN KEY ("periodId") REFERENCES "finance_accounting_periods"("id") ON DELETE CASCADE
);
CREATE INDEX "finance_period_closing_runs_periodId_startedAt_idx" ON "finance_period_closing_runs"("periodId","startedAt");

CREATE TABLE "finance_period_closing_checks" (
 "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "key" TEXT NOT NULL,
 "label" TEXT NOT NULL, "severity" "FinanceClosingCheckSeverity" NOT NULL,
 "result" "FinanceClosingCheckResult" NOT NULL, "detail" JSONB,
 "waivedById" TEXT, "waiverReason" TEXT,
 CONSTRAINT "finance_period_closing_checks_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_period_closing_checks_run_fkey" FOREIGN KEY ("runId") REFERENCES "finance_period_closing_runs"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "finance_period_closing_checks_runId_key_key" ON "finance_period_closing_checks"("runId","key");

CREATE TABLE "finance_period_snapshots" (
 "id" TEXT NOT NULL, "periodId" TEXT NOT NULL, "schoolId" TEXT NOT NULL,
 "version" INTEGER NOT NULL, "contentHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "finance_period_snapshots_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_period_snapshots_version" CHECK ("version" > 0),
 CONSTRAINT "finance_period_snapshots_period_fkey" FOREIGN KEY ("periodId") REFERENCES "finance_accounting_periods"("id") ON DELETE RESTRICT,
 CONSTRAINT "finance_period_snapshots_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "finance_period_snapshots_periodId_version_key" ON "finance_period_snapshots"("periodId","version");
CREATE INDEX "finance_period_snapshots_schoolId_periodId_idx" ON "finance_period_snapshots"("schoolId","periodId");

CREATE TABLE "finance_period_snapshot_lines" (
 "id" TEXT NOT NULL, "snapshotId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
 "code" TEXT NOT NULL, "name" TEXT NOT NULL, "accountType" "AccountType" NOT NULL,
 "opening" DECIMAL(15,2) NOT NULL, "debit" DECIMAL(15,2) NOT NULL,
 "credit" DECIMAL(15,2) NOT NULL, "closing" DECIMAL(15,2) NOT NULL,
 CONSTRAINT "finance_period_snapshot_lines_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_period_snapshot_lines_snapshot_fkey" FOREIGN KEY ("snapshotId") REFERENCES "finance_period_snapshots"("id") ON DELETE RESTRICT
);
CREATE INDEX "finance_period_snapshot_lines_snapshotId_code_idx" ON "finance_period_snapshot_lines"("snapshotId","code");

CREATE TABLE "finance_period_events" (
 "id" TEXT NOT NULL, "periodId" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "actorId" TEXT NOT NULL, "reason" TEXT,
 "approvalRequestId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "finance_period_events_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_period_events_period_fkey" FOREIGN KEY ("periodId") REFERENCES "finance_accounting_periods"("id") ON DELETE CASCADE
);
CREATE INDEX "finance_period_events_periodId_createdAt_idx" ON "finance_period_events"("periodId","createdAt");

-- A future approved-close workflow can only append immutable snapshots and events.
-- Ordinary UPDATE/DELETE fails at the DB even for a buggy later API deployment.
CREATE FUNCTION finance_forbid_archive_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.finance_archive_purge', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'finance snapshot/event records are append-only';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER finance_snapshot_immutable BEFORE UPDATE OR DELETE ON "finance_period_snapshots"
 FOR EACH ROW EXECUTE FUNCTION finance_forbid_archive_mutation();
CREATE TRIGGER finance_snapshot_line_immutable BEFORE UPDATE OR DELETE ON "finance_period_snapshot_lines"
 FOR EACH ROW EXECUTE FUNCTION finance_forbid_archive_mutation();
CREATE TRIGGER finance_period_event_immutable BEFORE UPDATE OR DELETE ON "finance_period_events"
 FOR EACH ROW EXECUTE FUNCTION finance_forbid_archive_mutation();

-- Rollback only before close activation: drop triggers/function, then new tables/enums.
-- A school data-purge job must explicitly set LOCAL app.finance_archive_purge='on'.
