-- 012_task_creation_attachments.sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS attachment_data TEXT;
