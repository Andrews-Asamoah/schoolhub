-- Link each school subscription to its selected catalogue plan.
ALTER TABLE "subscriptions"
  ADD COLUMN "planId" TEXT,
  ADD COLUMN "maxGuardians" INTEGER;
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
