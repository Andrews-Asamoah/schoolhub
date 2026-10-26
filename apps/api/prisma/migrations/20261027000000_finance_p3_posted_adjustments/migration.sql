-- Source-specific P3 receivable adjustments. Additive and no historic balance rewrite.
ALTER TYPE "BillStatus" ADD VALUE IF NOT EXISTS 'ADJUSTED';
ALTER TYPE "BillItemStatus" ADD VALUE IF NOT EXISTS 'ADJUSTED';
ALTER TABLE "bill_items"
 ADD COLUMN "creditedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
 ADD COLUMN "writtenOffAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_item_posted_adjustments_nonnegative"
 CHECK ("creditedAmount" >= 0 AND "writtenOffAmount" >= 0);
-- Existing bills retain their exact original numbers, paid amounts and journal history.
