-- Payment idempotency, payment reversal tracking and payroll approver.
ALTER TABLE "payments"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedById" TEXT,
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "reversalTransactionId" TEXT;

-- NULL keys are allowed many times; a given key can only be used once per school.
CREATE UNIQUE INDEX "payments_schoolId_idempotencyKey_key" ON "payments"("schoolId", "idempotencyKey");

ALTER TABLE "payroll_records" ADD COLUMN "approvedById" TEXT;
