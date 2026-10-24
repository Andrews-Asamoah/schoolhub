-- Student scholarships and sibling discounts are explicit, auditable bill concessions.
CREATE TYPE "ConcessionValueType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "ConcessionType" AS ENUM ('SIBLING_DISCOUNT', 'SCHOLARSHIP');

ALTER TABLE "bills"
  ADD COLUMN "grossAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "bill_items" ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE "sibling_discount_policies" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "minimumWardCount" INTEGER NOT NULL,
  "valueType" "ConcessionValueType" NOT NULL DEFAULT 'PERCENTAGE',
  "value" DECIMAL(12,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sibling_discount_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sibling_discount_policies_schoolId_name_key" ON "sibling_discount_policies"("schoolId", "name");
CREATE INDEX "sibling_discount_policies_schoolId_isActive_minimumWardCount_idx" ON "sibling_discount_policies"("schoolId", "isActive", "minimumWardCount");
ALTER TABLE "sibling_discount_policies" ADD CONSTRAINT "sibling_discount_policies_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "student_scholarships" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "valueType" "ConcessionValueType" NOT NULL DEFAULT 'PERCENTAGE',
  "value" DECIMAL(12,2) NOT NULL,
  "reason" TEXT,
  "academicYearId" TEXT,
  "termId" TEXT,
  "startDate" DATE,
  "endDate" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_scholarships_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "student_scholarships_schoolId_isActive_idx" ON "student_scholarships"("schoolId", "isActive");
CREATE INDEX "student_scholarships_studentId_isActive_idx" ON "student_scholarships"("studentId", "isActive");
CREATE INDEX "student_scholarships_academicYearId_termId_idx" ON "student_scholarships"("academicYearId", "termId");
ALTER TABLE "student_scholarships" ADD CONSTRAINT "student_scholarships_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_scholarships" ADD CONSTRAINT "student_scholarships_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "bill_concessions" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "type" "ConcessionType" NOT NULL,
  "label" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "siblingDiscountPolicyId" TEXT,
  "studentScholarshipId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bill_concessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bill_concessions_billId_idx" ON "bill_concessions"("billId");
CREATE INDEX "bill_concessions_siblingDiscountPolicyId_idx" ON "bill_concessions"("siblingDiscountPolicyId");
CREATE INDEX "bill_concessions_studentScholarshipId_idx" ON "bill_concessions"("studentScholarshipId");
ALTER TABLE "bill_concessions" ADD CONSTRAINT "bill_concessions_billId_fkey"
  FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bill_concessions" ADD CONSTRAINT "bill_concessions_siblingDiscountPolicyId_fkey"
  FOREIGN KEY ("siblingDiscountPolicyId") REFERENCES "sibling_discount_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bill_concessions" ADD CONSTRAINT "bill_concessions_studentScholarshipId_fkey"
  FOREIGN KEY ("studentScholarshipId") REFERENCES "student_scholarships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve historical totals for bills that predate the concession feature.
UPDATE "bills" SET "grossAmount" = "totalAmount" WHERE "grossAmount" = 0;
