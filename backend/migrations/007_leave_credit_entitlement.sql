-- 007_leave_credit_entitlement.sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS leave_credits_entitlement NUMERIC(10,2) NOT NULL DEFAULT 15;

UPDATE employees
SET
  leave_credits_entitlement = CASE
    WHEN date_hired IS NULL THEN 0
    WHEN (
      DATE_PART('year', AGE(CURRENT_DATE, date_hired)) * 12 +
      DATE_PART('month', AGE(CURRENT_DATE, date_hired))
    ) >= 12 THEN 15
    WHEN (
      DATE_PART('year', AGE(CURRENT_DATE, date_hired)) * 12 +
      DATE_PART('month', AGE(CURRENT_DATE, date_hired))
    ) >= 6 THEN 3
    ELSE 0
  END
WHERE leave_credits_entitlement IS NULL
   OR leave_credits_entitlement = 15;
