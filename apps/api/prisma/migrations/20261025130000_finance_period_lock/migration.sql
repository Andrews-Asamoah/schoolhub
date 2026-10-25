-- Closed-books marker: nothing may be posted dated on or before lockedThrough.
CREATE TABLE "finance_period_locks" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "lockedThrough" DATE NOT NULL,
    "updatedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_period_locks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_period_locks_schoolId_key" ON "finance_period_locks"("schoolId");

ALTER TABLE "finance_period_locks" ADD CONSTRAINT "finance_period_locks_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
