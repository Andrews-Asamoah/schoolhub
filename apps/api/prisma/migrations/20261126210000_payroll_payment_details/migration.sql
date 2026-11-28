CREATE TABLE "payroll_payment_details" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "teacherId" TEXT REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "staffId" TEXT REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "encryptedData" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_payment_details_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_payment_details_one_employee" CHECK (num_nonnulls("teacherId", "staffId") = 1)
);

CREATE UNIQUE INDEX "payroll_payment_details_teacherId_key" ON "payroll_payment_details"("teacherId");
CREATE UNIQUE INDEX "payroll_payment_details_staffId_key" ON "payroll_payment_details"("staffId");
CREATE INDEX "payroll_payment_details_schoolId_idx" ON "payroll_payment_details"("schoolId");

ALTER TABLE "payslips" ADD COLUMN "tier2Contribution" DECIMAL(15,2);
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tier2_allocation_check"
    CHECK ("tier2Contribution" BETWEEN 0 AND "ssnitEmployee" + "ssnitEmployer");
