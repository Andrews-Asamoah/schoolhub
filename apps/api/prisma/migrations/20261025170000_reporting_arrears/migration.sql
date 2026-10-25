-- Phase 2: additive arrears policy and bill snapshots.
-- Existing bill and payment monetary values are not changed. Snapshot amounts are
-- informational only; the source bills remain open and remain the sole receivables.
CREATE TYPE "ArrearsPolicy" AS ENUM ('SHOW_ONLY', 'BLOCK_CLEARANCE_UNTIL_PAID');

ALTER TABLE "schools"
  ADD COLUMN "arrearsPolicy" "ArrearsPolicy" NOT NULL DEFAULT 'SHOW_ONLY';

CREATE TABLE "bill_arrears_snapshots" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "sourceBillId" TEXT NOT NULL,
  "sourceBillNumber" TEXT NOT NULL,
  "sourceAcademicYear" TEXT NOT NULL,
  "sourceTerm" TEXT,
  "amountAtGeneration" DECIMAL(10,2) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bill_arrears_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bill_arrears_snapshots_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bill_arrears_snapshots_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bill_arrears_snapshots_sourceBillId_fkey"
    FOREIGN KEY ("sourceBillId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bill_arrears_snapshots_billId_sourceBillId_key"
  ON "bill_arrears_snapshots"("billId", "sourceBillId");
CREATE INDEX "bill_arrears_snapshots_schoolId_sourceBillId_idx"
  ON "bill_arrears_snapshots"("schoolId", "sourceBillId");
CREATE INDEX "bill_arrears_snapshots_billId_idx"
  ON "bill_arrears_snapshots"("billId");

CREATE INDEX "bills_schoolId_issuedAt_id_idx"
  ON "bills"("schoolId", "issuedAt", "id");
CREATE INDEX "bills_schoolId_dueDate_balanceAmount_idx"
  ON "bills"("schoolId", "dueDate", "balanceAmount");
CREATE INDEX "bills_schoolId_classId_issuedAt_idx"
  ON "bills"("schoolId", "classId", "issuedAt");
CREATE INDEX "payments_schoolId_paymentDate_id_idx"
  ON "payments"("schoolId", "paymentDate", "id");
CREATE INDEX "payments_schoolId_paymentMethod_paymentDate_idx"
  ON "payments"("schoolId", "paymentMethod", "paymentDate");

-- Rollback notes (execute only if the phase is being rolled back):
-- DROP INDEX IF EXISTS "payments_schoolId_paymentMethod_paymentDate_idx";
-- DROP INDEX IF EXISTS "payments_schoolId_paymentDate_id_idx";
-- DROP INDEX IF EXISTS "bills_schoolId_classId_issuedAt_idx";
-- DROP INDEX IF EXISTS "bills_schoolId_dueDate_balanceAmount_idx";
-- DROP INDEX IF EXISTS "bills_schoolId_issuedAt_id_idx";
-- DROP TABLE IF EXISTS "bill_arrears_snapshots";
-- ALTER TABLE "schools" DROP COLUMN IF EXISTS "arrearsPolicy";
-- DROP TYPE IF EXISTS "ArrearsPolicy";
