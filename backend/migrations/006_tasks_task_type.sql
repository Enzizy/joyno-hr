-- 006_tasks_task_type.sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) NOT NULL DEFAULT 'task';

UPDATE tasks
SET task_type = CASE
  WHEN client_id IS NULL AND service_id IS NULL THEN 'meeting'
  ELSE 'task'
END
WHERE COALESCE(task_type, '') NOT IN ('task', 'meeting');

