CREATE TABLE IF NOT EXISTS leave_comment_email_deliveries (
  leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_emailed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (leave_request_id, recipient_user_id)
);
