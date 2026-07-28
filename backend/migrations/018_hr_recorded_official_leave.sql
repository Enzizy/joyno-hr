ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS submission_source VARCHAR(30) NOT NULL DEFAULT 'employee';

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS entered_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS offline_document_received BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_submission_source_check;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_submission_source_check
  CHECK (submission_source IN ('employee', 'hr_recorded', 'admin_recorded'));

CREATE INDEX IF NOT EXISTS idx_leave_requests_submission_source
  ON leave_requests (submission_source, start_date);
