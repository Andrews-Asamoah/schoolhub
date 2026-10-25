-- Phase 2: source-referenced previous-balance snapshots and list indexes.
-- Existing balances are intentionally untouched by this additive migration.
CREATE TABLE "bill_carry_forwards" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "sourceBillId" TEXT NOT NULL,
  "sourceBillNumber" TEXT NOT NULL,
  "sourceAcademicYearName" TEXT,
  "sourceTermName" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bill_carry_forwards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bill_carry_forwards_billId_sourceBillId_key"
  ON "bill_carry_forwards"("billId", "sourceBillId");
CREATE INDEX "bill_carry_forwards_schoolId_billId_idx"
  ON "bill_carry_forwards"("schoolId", "billId");
CREATE INDEX "bill_carry_forwards_schoolId_sourceBillId_idx"
  ON "bill_carry_forwards"("schoolId", "sourceBillId");

ALTER TABLE "bill_carry_forwards"
  ADD CONSTRAINT "bill_carry_forwards_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bill_carry_forwards"
  ADD CONSTRAINT "bill_carry_forwards_billId_fkey"
  FOREIGN KEY ("billId") REFERENCES "bills"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bill_carry_forwards"
  ADD CONSTRAINT "bill_carry_forwards_sourceBillId_fkey"
  FOREIGN KEY ("sourceBillId") REFERENCES "bills"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "bills_schoolId_issuedAt_id_idx"
  ON "bills"("schoolId", "issuedAt", "id");
CREATE INDEX "bills_schoolId_dueDate_balanceAmount_idx"
  ON "bills"("schoolId", "dueDate", "balanceAmount");
CREATE INDEX "payments_schoolId_paymentDate_id_idx"
  ON "payments"("schoolId", "paymentDate", "id");

-- Bill-level allocation supports receipts that clear several invoices.
CREATE TABLE "payment_bill_allocations" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_bill_allocations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_bill_allocations_paymentId_billId_key"
  ON "payment_bill_allocations"("paymentId", "billId");
CREATE INDEX "payment_bill_allocations_schoolId_paymentId_idx"
  ON "payment_bill_allocations"("schoolId", "paymentId");
CREATE INDEX "payment_bill_allocations_schoolId_billId_idx"
  ON "payment_bill_allocations"("schoolId", "billId");
ALTER TABLE "payment_bill_allocations"
  ADD CONSTRAINT "payment_bill_allocations_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_bill_allocations"
  ADD CONSTRAINT "payment_bill_allocations_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_bill_allocations"
  ADD CONSTRAINT "payment_bill_allocations_billId_fkey"
  FOREIGN KEY ("billId") REFERENCES "bills"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill bill allocations from immutable historical item allocations.
-- Old receipts without item allocations fall back to their single recorded billId.
INSERT INTO "payment_bill_allocations" ("id", "schoolId", "paymentId", "billId", "amount", "createdAt")
SELECT
  'pba_' || md5(p."id" || ':' || grouped."billId"),
  p."schoolId",
  p."id",
  grouped."billId",
  grouped."amount",
  p."createdAt"
FROM (
  SELECT pi."paymentId", bi."billId", SUM(pi."amount")::numeric(10,2) AS "amount"
  FROM "payment_items" pi
  INNER JOIN "bill_items" bi ON bi."id" = pi."billItemId"
  GROUP BY pi."paymentId", bi."billId"
) grouped
INNER JOIN "payments" p ON p."id" = grouped."paymentId";

INSERT INTO "payment_bill_allocations" ("id", "schoolId", "paymentId", "billId", "amount", "createdAt")
SELECT
  'pba_' || md5(p."id" || ':' || p."billId"),
  p."schoolId",
  p."id",
  p."billId",
  p."amount",
  p."createdAt"
FROM "payments" p
WHERE p."billId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "payment_items" pi WHERE pi."paymentId" = p."id");

-- Rollback (manual, only if the feature is unused):
-- DROP INDEX "payment_bill_allocations_schoolId_billId_idx";
-- DROP INDEX "payment_bill_allocations_schoolId_paymentId_idx";
-- DROP INDEX "payment_bill_allocations_paymentId_billId_key";
-- DROP TABLE "payment_bill_allocations";
-- DROP INDEX "payments_schoolId_paymentDate_id_idx";
-- DROP INDEX "bills_schoolId_dueDate_balanceAmount_idx";
-- DROP INDEX "bills_schoolId_issuedAt_id_idx";
-- DROP TABLE "bill_carry_forwards";
