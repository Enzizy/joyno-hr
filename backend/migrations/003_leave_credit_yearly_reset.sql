-- 003_leave_credit_yearly_reset.sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS leave_credits_reset_year INTEGER;

UPDATE employees
SET leave_credits_reset_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
WHERE leave_credits_reset_year IS NULL;

ALTER TABLE employees
  ALTER COLUMN leave_credits_reset_year SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int;
