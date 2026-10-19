-- AlterEnum
ALTER TYPE "TransactionCategory" ADD VALUE 'ADMISSION_FEE';

-- CreateEnum
CREATE TYPE "AdmissionFeeStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'EXEMPTED');

-- AlterTable
ALTER TABLE "admission_cycles" ADD COLUMN     "admissionFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "feeDue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "feeExemptedAt" TIMESTAMP(3),
ADD COLUMN     "feeExemptedById" TEXT,
ADD COLUMN     "feeExemptionReason" TEXT,
ADD COLUMN     "feeNotes" TEXT,
ADD COLUMN     "feePaidAmount" DECIMAL(10,2),
ADD COLUMN     "feePaidAt" DATE,
ADD COLUMN     "feeReceiptNumber" TEXT,
ADD COLUMN     "feeReceivedById" TEXT,
ADD COLUMN     "feeStatus" "AdmissionFeeStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "feeTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "applications_feeTransactionId_key" ON "applications"("feeTransactionId");

-- CreateIndex
CREATE INDEX "applications_cycleId_feeStatus_idx" ON "applications"("cycleId", "feeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "applications_schoolId_feeReceiptNumber_key" ON "applications"("schoolId", "feeReceiptNumber");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_feeTransactionId_fkey" FOREIGN KEY ("feeTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
