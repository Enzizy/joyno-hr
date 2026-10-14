-- The audit log records what changed (for example "Monthly basic: 15,000 → 16,000"), and keeps a
-- person's history when their account is deleted: the entry stays, its user becomes empty.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;

ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS fk_audit_logs_user;
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- The log is read newest first, filtered by person, kind of record and date.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_table, target_id);

COMMENT ON COLUMN audit_logs.details IS 'Optional { changes: [{ field, from, to }] } for edits; shown on the Audit log page.';
