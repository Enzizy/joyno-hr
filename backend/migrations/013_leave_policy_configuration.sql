CREATE TABLE IF NOT EXISTS leave_policies (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  paid_days_per_year NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_months_employed INTEGER NOT NULL DEFAULT 0,
  filing_notice_days INTEGER NOT NULL DEFAULT 0,
  requires_attachment_for_paid BOOLEAN NOT NULL DEFAULT FALSE,
  remarks TEXT NOT NULL DEFAULT '',
  is_employee_requestable BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INTEGER NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_leave_policies_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO leave_policies
  (id, name, paid_days_per_year, min_months_employed, filing_notice_days, requires_attachment_for_paid, remarks, is_employee_requestable)
VALUES
  ('vacation_leave', 'Vacation Leave', 3, 6, 7, FALSE, 'Annual grant and usage are subject to company approval.', TRUE),
  ('sick_leave', 'Sick Leave', 5, 12, 0, TRUE, 'Requires a valid medical certificate.', TRUE),
  ('bereavement_leave', 'Bereavement Leave', 2, 12, 0, TRUE, 'Supporting documents are required.', TRUE),
  ('service_incentive_leave', 'Service Incentive Leave', 5, 12, 7, FALSE, 'Convertible to cash if unused, based on company policy and labor laws.', TRUE),
  ('leave_of_absence', 'Leave of Absence', 0, 0, 0, FALSE, 'Unpaid by policy.', TRUE),
  ('awol', 'Absent Without Official Leave', 0, 0, 0, FALSE, 'Admin and HR use only.', FALSE),
  ('emergency_leave', 'Emergency Leave', 0, 0, 7, FALSE, 'Unpaid by policy.', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS leave_policy_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  probationary_months INTEGER NOT NULL DEFAULT 6,
  probationary_leave_type_id VARCHAR(80) NOT NULL DEFAULT 'leave_of_absence',
  availability_warning_threshold INTEGER NOT NULL DEFAULT 2,
  updated_by INTEGER NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_leave_policy_settings_type FOREIGN KEY (probationary_leave_type_id) REFERENCES leave_policies(id),
  CONSTRAINT fk_leave_policy_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO leave_policy_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ NULL;
UPDATE leave_requests
SET decided_at = COALESCE(rejected_at, created_at)
WHERE status IN ('approved', 'rejected') AND decided_at IS NULL;
