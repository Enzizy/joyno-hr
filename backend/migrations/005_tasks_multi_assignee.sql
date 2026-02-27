-- 005_tasks_multi_assignee.sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assigned_to_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE tasks
SET assigned_to_ids = jsonb_build_array(assigned_to)
WHERE assigned_to IS NOT NULL
  AND (
    assigned_to_ids IS NULL
    OR assigned_to_ids = '[]'::jsonb
  );

