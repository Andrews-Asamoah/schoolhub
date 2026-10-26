-- Source-specific P3 receivable adjustments. Additive and no historic balance rewrite.
ALTER TYPE "BillStatus" ADD VALUE IF NOT EXISTS 'ADJUSTED';
ALTER TYPE "BillItemStatus" ADD VALUE IF NOT EXISTS 'ADJUSTED';
ALTER TABLE "bill_items"
 ADD COLUMN "creditedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
 ADD COLUMN "writtenOffAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_item_posted_adjustments_nonnegative"
 CHECK ("creditedAmount" >= 0 AND "writtenOffAmount" >= 0);
-- Existing bills retain their exact original numbers, paid amounts and journal history.

-- Submitted financial adjustments must be immutable except for audited status and
-- posting metadata. This also protects the approval payload against ORM bypass.
CREATE FUNCTION finance_bill_adjustment_header_guard() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.finance_archive_purge', true) = 'on' THEN RETURN OLD; END IF;
  IF NEW."schoolId" IS DISTINCT FROM OLD."schoolId"
    OR NEW."billId" IS DISTINCT FROM OLD."billId"
    OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
    OR NEW."adjustmentNumber" IS DISTINCT FROM OLD."adjustmentNumber"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."reasonCode" IS DISTINCT FROM OLD."reasonCode"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."effectiveDate" IS DISTINCT FROM OLD."effectiveDate"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById" THEN
      RAISE EXCEPTION 'Issued bill adjustment content is immutable';
  END IF;
  IF (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT','PENDING_APPROVAL'))
    OR (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED','REJECTED'))
    OR (OLD."status" = 'APPROVED' AND NEW."status" = 'POSTED')
    OR (OLD."status" = NEW."status" AND OLD."status" <> 'POSTED') THEN
      RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid financial adjustment state transition';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER finance_bill_adjustment_lock
 BEFORE UPDATE ON "finance_bill_adjustments"
 FOR EACH ROW EXECUTE FUNCTION finance_bill_adjustment_header_guard();

CREATE FUNCTION finance_bill_adjustment_line_guard() RETURNS trigger AS $$
DECLARE target_id TEXT;
DECLARE current_status "FinanceAdjustmentStatus";
BEGIN
  IF current_setting('app.finance_archive_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN target_id := OLD."adjustmentId";
  ELSE target_id := NEW."adjustmentId"; END IF;
  SELECT "status" INTO current_status FROM "finance_bill_adjustments"
    WHERE "id" = target_id FOR UPDATE;
  IF current_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Submitted bill adjustment lines cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER finance_bill_adjustment_line_lock
 BEFORE INSERT OR UPDATE OR DELETE ON "finance_bill_adjustment_lines"
 FOR EACH ROW EXECUTE FUNCTION finance_bill_adjustment_line_guard();
