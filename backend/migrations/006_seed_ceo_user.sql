-- 006_seed_ceo_user.sql
-- Creates/updates the CEO employee and account.
WITH upsert_employee AS (
  INSERT INTO employees (
    employee_code,
    first_name,
    last_name,
    department,
    position,
    shift,
    leave_credits,
    leave_credits_reset_year,
    date_hired,
    status
  )
  VALUES (
    '1',
    'GINO',
    'CABANAS',
    NULL,
    'CEO',
    'day',
    15,
    EXTRACT(YEAR FROM CURRENT_DATE)::int,
    CURRENT_DATE,
    'active'
  )
  ON CONFLICT (employee_code) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    department = EXCLUDED.department,
    position = EXCLUDED.position,
    shift = EXCLUDED.shift,
    status = EXCLUDED.status,
    updated_at = NOW()
  RETURNING id
)
INSERT INTO users (email, password_hash, role, employee_id)
SELECT
  'ginothevine@gmail.com',
  '$2a$10$HKTkKbEFmC6mR/nZhqwzqeD.5F6eRDSjrptlCG7xvQl9SMiy2IGn.',
  'ceo',
  id
FROM upsert_employee
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  employee_id = EXCLUDED.employee_id;
