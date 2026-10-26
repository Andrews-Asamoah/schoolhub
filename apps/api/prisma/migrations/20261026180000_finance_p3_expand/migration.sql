-- P3 expand-only. No existing receipt, bill or ledger rows are rewritten.
-- Posting/credit/refund flows remain disabled until P2, policy sign-off and reconciliation.
CREATE TYPE "FinanceAdjustmentKind" AS ENUM ('CREDIT_NOTE', 'DEBIT_NOTE', 'WRITE_OFF', 'WAIVER', 'FEE_CORRECTION');
CREATE TYPE "FinanceAdjustmentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'VOIDED');
CREATE TYPE "FinanceCreditEntryKind" AS ENUM ('OVERPAYMENT', 'ADVANCE_PAYMENT', 'APPLIED_TO_BILL', 'REFUND_PAID', 'TRANSFER', 'ADJUSTMENT');
CREATE TYPE "FinanceRecognitionMethod" AS ENUM ('AT_INVOICE', 'STRAIGHT_LINE_TERM', 'STRAIGHT_LINE_DAYS');
CREATE TYPE "FinanceRecognitionLineStatus" AS ENUM ('PLANNED', 'POSTED', 'CANCELLED');

ALTER TABLE "bills" ADD COLUMN "creditedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
 ADD COLUMN "writtenOffAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD CONSTRAINT "bills_adjustments_nonnegative"
 CHECK ("creditedAmount" >= 0 AND "writtenOffAmount" >= 0);
ALTER TABLE "fee_items" ADD COLUMN "recognitionMethod" "FinanceRecognitionMethod" NOT NULL DEFAULT 'AT_INVOICE',
 ADD COLUMN "revenueAccountId" TEXT;
ALTER TABLE "finance_settings" ADD COLUMN "p3AdjustmentsEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "p3CreditsEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "p3DeferredRevenueEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "finance_bill_adjustments" (
 "id" TEXT NOT NULL,
 "schoolId" TEXT NOT NULL,
 "billId" TEXT NOT NULL,
 "studentId" TEXT NOT NULL,
 "adjustmentNumber" TEXT NOT NULL,
 "kind" "FinanceAdjustmentKind" NOT NULL,
 "status" "FinanceAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
 "amount" DECIMAL(15,2) NOT NULL,
 "reasonCode" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "effectiveDate" DATE NOT NULL,
 "createdById" TEXT NOT NULL,
 "approvalRequestId" TEXT,
 "postedTransactionId" TEXT,
 "postedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "finance_bill_adjustments_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_bill_adjustments_positive" CHECK ("amount" > 0),
 CONSTRAINT "finance_bill_adjustments_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE,
 CONSTRAINT "finance_bill_adjustments_bill_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT,
 CONSTRAINT "finance_bill_adjustments_student_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "finance_bill_adjustments_schoolId_adjustmentNumber_key" ON "finance_bill_adjustments"("schoolId","adjustmentNumber");
CREATE INDEX "finance_bill_adjustments_school_bill_status_idx" ON "finance_bill_adjustments"("schoolId","billId","status");
CREATE INDEX "finance_bill_adjustments_school_student_created_idx" ON "finance_bill_adjustments"("schoolId","studentId","createdAt");

CREATE TABLE "finance_bill_adjustment_lines" (
 "id" TEXT NOT NULL,
 "adjustmentId" TEXT NOT NULL,
 "billItemId" TEXT NOT NULL,
 "amount" DECIMAL(15,2) NOT NULL,
 CONSTRAINT "finance_bill_adjustment_lines_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_bill_adjustment_lines_positive" CHECK ("amount" > 0),
 CONSTRAINT "finance_bill_adjustment_lines_adjustment_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "finance_bill_adjustments"("id") ON DELETE CASCADE,
 CONSTRAINT "finance_bill_adjustment_lines_item_fkey" FOREIGN KEY ("billItemId") REFERENCES "bill_items"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "finance_bill_adjustment_lines_adjustmentId_billItemId_key" ON "finance_bill_adjustment_lines"("adjustmentId","billItemId");
CREATE INDEX "finance_bill_adjustment_lines_billItemId_idx" ON "finance_bill_adjustment_lines"("billItemId");

CREATE TABLE "finance_student_credit_entries" (
 "id" TEXT NOT NULL,
 "schoolId" TEXT NOT NULL,
 "studentId" TEXT NOT NULL,
 "kind" "FinanceCreditEntryKind" NOT NULL,
 "amount" DECIMAL(15,2) NOT NULL,
 "paymentId" TEXT,
 "billId" TEXT,
 "postedTransactionId" TEXT,
 "note" TEXT,
 "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "finance_student_credit_entries_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_student_credit_entries_nonzero" CHECK ("amount" <> 0),
 CONSTRAINT "finance_student_credit_entries_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE,
 CONSTRAINT "finance_student_credit_entries_student_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT,
 CONSTRAINT "finance_student_credit_entries_payment_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT,
 CONSTRAINT "finance_student_credit_entries_bill_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT
);
CREATE INDEX "finance_student_credit_entries_student_idx" ON "finance_student_credit_entries"("schoolId","studentId","createdAt");
CREATE INDEX "finance_student_credit_entries_kind_idx" ON "finance_student_credit_entries"("schoolId","kind","createdAt");

CREATE TABLE "finance_revenue_schedules" (
 "id" TEXT NOT NULL,
 "schoolId" TEXT NOT NULL,
 "billId" TEXT NOT NULL,
 "billItemId" TEXT NOT NULL,
 "termId" TEXT,
 "method" "FinanceRecognitionMethod" NOT NULL,
 "totalAmount" DECIMAL(15,2) NOT NULL,
 "startDate" DATE NOT NULL,
 "endDate" DATE NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "finance_revenue_schedules_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_revenue_schedules_valid" CHECK ("totalAmount" >= 0 AND "startDate" <= "endDate" AND "method" <> 'AT_INVOICE'),
 CONSTRAINT "finance_revenue_schedules_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE,
 CONSTRAINT "finance_revenue_schedules_bill_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT,
 CONSTRAINT "finance_revenue_schedules_item_fkey" FOREIGN KEY ("billItemId") REFERENCES "bill_items"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "finance_revenue_schedules_billItemId_key" ON "finance_revenue_schedules"("billItemId");
CREATE INDEX "finance_revenue_schedules_school_status_idx" ON "finance_revenue_schedules"("schoolId","status");

CREATE TABLE "finance_revenue_schedule_lines" (
 "id" TEXT NOT NULL,
 "scheduleId" TEXT NOT NULL,
 "periodStart" DATE NOT NULL,
 "periodEnd" DATE NOT NULL,
 "amount" DECIMAL(15,2) NOT NULL,
 "status" "FinanceRecognitionLineStatus" NOT NULL DEFAULT 'PLANNED',
 "postedTransactionId" TEXT,
 "postedAt" TIMESTAMP(3),
 CONSTRAINT "finance_revenue_schedule_lines_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "finance_revenue_schedule_lines_valid" CHECK ("amount" >= 0 AND "periodStart" <= "periodEnd"),
 CONSTRAINT "finance_revenue_schedule_lines_schedule_fkey" FOREIGN KEY ("scheduleId") REFERENCES "finance_revenue_schedules"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "finance_revenue_schedule_lines_scheduleId_periodStart_key" ON "finance_revenue_schedule_lines"("scheduleId","periodStart");
CREATE INDEX "finance_revenue_schedule_lines_status_periodEnd_idx" ON "finance_revenue_schedule_lines"("status","periodEnd");

-- Rollback before activation only: DROP the four new tables, three altered bill/fee fields,
-- three finance_settings flags and the five newly defined enums.
