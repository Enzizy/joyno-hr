ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_review_status VARCHAR(30) NOT NULL DEFAULT 'not_required';

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_review_note TEXT;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_reviewed_at TIMESTAMPTZ;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_resubmit_due_at TIMESTAMPTZ;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_replacement_requested_at TIMESTAMPTZ;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_reminder_sent_at TIMESTAMPTZ;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attachment_uploaded_at TIMESTAMPTZ;

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_attachment_review_status_check;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_attachment_review_status_check
  CHECK (
    attachment_review_status IN (
      'not_required',
      'missing',
      'pending_review',
      'replacement_required',
      'valid',
      'deadline_missed'
    )
  );

CREATE TABLE IF NOT EXISTS leave_attachment_review_events (
  id SERIAL PRIMARY KEY,
  leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  attachment_version INTEGER NOT NULL DEFAULT 0,
  action VARCHAR(40) NOT NULL,
  note TEXT,
  response_days INTEGER,
  due_at TIMESTAMPTZ,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(30),
  actor_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_attachment_review_events_request
  ON leave_attachment_review_events (leave_request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_leave_attachment_review_deadline
  ON leave_requests (attachment_review_status, attachment_resubmit_due_at)
  WHERE status = 'pending';

UPDATE leave_requests request
SET
  attachment_review_status = CASE
    WHEN policy.requires_attachment_for_paid = FALSE THEN 'not_required'
    WHEN request.status = 'approved' AND request.attachment_data IS NOT NULL THEN 'valid'
    WHEN request.attachment_data IS NOT NULL THEN 'pending_review'
    ELSE 'missing'
  END,
  attachment_version = CASE WHEN request.attachment_data IS NULL THEN 0 ELSE 1 END,
  attachment_uploaded_at = CASE WHEN request.attachment_data IS NULL THEN NULL ELSE request.created_at END
FROM leave_policies policy
WHERE LOWER(policy.name) = LOWER(request.leave_type_name)
  AND request.attachment_version = 0;
