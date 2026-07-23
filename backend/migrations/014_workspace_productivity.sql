CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_delivery VARCHAR(20) NOT NULL DEFAULT 'immediate'
    CHECK (email_delivery IN ('immediate', 'daily', 'off')),
  leave_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  task_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  system_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_email_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  category VARCHAR(20) NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_email_queue_user_created
  ON notification_email_queue (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_leave_requests_pending_created
  ON leave_requests (status, created_at)
  WHERE status = 'pending';
