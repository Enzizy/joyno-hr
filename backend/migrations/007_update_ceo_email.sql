-- 007_update_ceo_email.sql
-- Ensure CEO account uses the requested real email.
WITH ceo_employee AS (
  SELECT id
  FROM employees
  WHERE employee_code = '1'
  LIMIT 1
)
UPDATE users
SET email = 'ginothevine@gmail.com'
WHERE id IN (
  SELECT u.id
  FROM users u
  INNER JOIN ceo_employee e ON e.id = u.employee_id
)
OR email = 'ginothevine@email.com';
