-- 002_performance_indexes.sql
-- Indexes for common list/filter/sort endpoints.
CREATE INDEX IF NOT EXISTS idx_tasks_status_due_assigned_created
  ON tasks (status, due_date, assigned_to, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status_created
  ON tasks (assigned_to, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_status_start_created
  ON leave_requests (employee_id, status, start_date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_requests_status_created
  ON leave_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_status_source_followup_created
  ON leads (status, source, next_follow_up, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clients_status_created
  ON clients (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_services_client_type_status_created
  ON services (client_id, service_type, status, created_at DESC);
