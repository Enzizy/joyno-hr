-- COLA is a separate, non-taxable payroll earning. Keep the profile value
-- effective-dated and snapshot the amount actually paid on each run line.
ALTER TABLE payroll_employee_profiles
  ADD COLUMN IF NOT EXISTS monthly_cola NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_cola >= 0);

ALTER TABLE payroll_run_lines
  ADD COLUMN IF NOT EXISTS cola_pay NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cola_pay >= 0);

-- Employee compensation and draft charge details are served only by the
-- authenticated backend, never directly through Supabase's Data API.
ALTER TABLE payroll_employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_run_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE payroll_employee_profiles, payroll_run_lines FROM anon, authenticated;
