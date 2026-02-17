-- 001_runtime_schema_backfill.sql
-- Mirrors former runtime ALTERs so schema changes happen in a controlled migration.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS leave_credits NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_pay_type VARCHAR(20) NOT NULL DEFAULT 'unpaid';
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_days NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS credits_deducted NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS fk_leave_requests_type;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_requests'
      AND column_name = 'leave_type_id'
  ) THEN
    ALTER TABLE leave_requests ALTER COLUMN leave_type_id DROP NOT NULL;
  END IF;
END$$;

DROP TABLE IF EXISTS leave_types;
