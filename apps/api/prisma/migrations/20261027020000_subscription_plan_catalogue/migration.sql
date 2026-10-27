-- Create configurable platform subscription plans.
-- Null limits mean unlimited; zero is an explicit zero allowance.
CREATE TABLE "subscription_plans" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "monthlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "yearlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "maxStudents" INTEGER,
  "maxTeachers" INTEGER,
  "maxGuardians" INTEGER,
  "maxStaff" INTEGER,
  "maxStorageMb" INTEGER,
  "features" JSONB NOT NULL DEFAULT '{}',
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");
CREATE INDEX "subscription_plans_isActive_sortOrder_idx" ON "subscription_plans"("isActive", "sortOrder");
CREATE INDEX "subscription_plans_currency_idx" ON "subscription_plans"("currency");
