-- Retire a policy without deleting historical requests or their paid treatment.
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS cash_convertible BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE leave_policies
SET paid_days_per_year = 5, min_months_employed = 3,
    remarks = '5 paid sick days per calendar year after 3 months of service. A valid medical certificate is required.',
    updated_at = NOW()
WHERE id = 'sick_leave';

UPDATE leave_policies
SET paid_days_per_year = 3, min_months_employed = 3,
    remarks = '3 paid vacation days per calendar year after 3 months of service, subject to approval.',
    updated_at = NOW()
WHERE id = 'vacation_leave';

UPDATE leave_policies
SET paid_days_per_year = 5, min_months_employed = 12, cash_convertible = TRUE,
    remarks = '5 paid days after 1 year of service, separate from sick and vacation leave. Unused SIL is convertible to cash.',
    updated_at = NOW()
WHERE id = 'service_incentive_leave';

UPDATE leave_policies SET is_active = FALSE, is_employee_requestable = FALSE, updated_at = NOW()
WHERE id = 'bereavement_leave';

ALTER TABLE leave_policy_settings ALTER COLUMN probationary_months SET DEFAULT 3;
UPDATE leave_policy_settings SET probationary_months = 3, updated_at = NOW() WHERE id = 1;

-- Totals are summaries of the independent policy balances, reconciled by the API.
-- Existing approved leave, payroll records, and historical deductions are preserved.
ALTER TABLE employees ALTER COLUMN leave_credits SET DEFAULT 0;
ALTER TABLE employees ALTER COLUMN leave_credits_entitlement SET DEFAULT 0;
