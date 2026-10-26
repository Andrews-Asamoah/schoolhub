CREATE TABLE "finance_accrual_states" (
    "schoolId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "activatedById" TEXT NOT NULL,
    "approvalReference" TEXT NOT NULL,
    "openingReceivables" DECIMAL(15,2) NOT NULL,
    "openingTransactionId" TEXT,
    CONSTRAINT "finance_accrual_states_pkey" PRIMARY KEY ("schoolId")
);
ALTER TABLE "finance_accrual_states" ADD CONSTRAINT "finance_accrual_states_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
