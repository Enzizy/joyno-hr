-- 004_leave_paid_unpaid_split.sql
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS paid_days NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS unpaid_days NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE leave_requests
SET
  paid_days = CASE
    WHEN leave_pay_type = 'paid' THEN COALESCE(leave_days, 0)
    WHEN leave_pay_type = 'partial_paid' THEN COALESCE(credits_deducted, 0)
    ELSE 0
  END,
  unpaid_days = GREATEST(
    0,
    COALESCE(leave_days, 0) - CASE
      WHEN leave_pay_type = 'paid' THEN COALESCE(leave_days, 0)
      WHEN leave_pay_type = 'partial_paid' THEN COALESCE(credits_deducted, 0)
      ELSE 0
    END
  )
WHERE COALESCE(paid_days, 0) = 0 AND COALESCE(unpaid_days, 0) = 0;
