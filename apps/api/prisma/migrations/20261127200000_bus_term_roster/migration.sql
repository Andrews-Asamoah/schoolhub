CREATE TYPE "BusTermStatus" AS ENUM ('RIDING', 'PAUSED', 'STOPPED');
CREATE TABLE "bus_term_decisions" (
    "studentId" TEXT NOT NULL REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "termId" TEXT NOT NULL REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "status" "BusTermStatus" NOT NULL,
    PRIMARY KEY ("studentId", "termId")
);
CREATE INDEX "bus_term_decisions_termId_idx" ON "bus_term_decisions"("termId");
ALTER TABLE "fee_items" ADD COLUMN "followsBusRoster" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "fee_items" ADD CONSTRAINT "bus_fee_must_be_optional" CHECK (NOT "followsBusRoster" OR "isOptional");
