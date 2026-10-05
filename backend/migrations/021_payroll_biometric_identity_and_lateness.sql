-- Biometric Person IDs are not the application's employee codes. HR must map them
-- explicitly before imported scans can affect an employee's salary.
CREATE TABLE IF NOT EXISTS payroll_biometric_identities (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  person_id VARCHAR(80) NOT NULL UNIQUE CHECK (LENGTH(TRIM(person_id)) > 0),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only the backend's privileged Postgres connection may read or update this map.
ALTER TABLE payroll_biometric_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE payroll_biometric_identities FROM anon, authenticated;

-- An incomplete scan day must retain only the scan side that actually exists.
ALTER TABLE payroll_daily_attendance DROP CONSTRAINT IF EXISTS payroll_daily_attendance_check;
ALTER TABLE payroll_daily_attendance ADD CONSTRAINT payroll_daily_attendance_scan_pair_check CHECK (
  (status IN ('absent', 'paid_leave', 'unpaid_leave', 'partial_leave')
    AND first_scan_at IS NULL AND last_scan_at IS NULL)
  OR (status = 'present' AND first_scan_at IS NOT NULL AND last_scan_at IS NOT NULL
    AND last_scan_at > first_scan_at)
  OR status = 'exception'
);

ALTER TABLE payroll_run_lines
  ADD COLUMN IF NOT EXISTS late_minutes NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  ADD COLUMN IF NOT EXISTS late_deduction NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (late_deduction >= 0);
