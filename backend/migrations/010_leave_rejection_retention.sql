ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ NULL;

UPDATE leave_requests
SET rejected_at = created_at
WHERE status = 'rejected'
  AND rejected_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_requests_rejected_retention
  ON leave_requests (rejected_at)
  WHERE status = 'rejected';
