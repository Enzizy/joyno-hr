const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config()
const { Client } = require('pg')
const { refreshEmployeeLeaveCredits } = require('./services/employeeLeaveBalanceService')

// Optional integration check: session-local tables only, always rolled back.
test('policy migration and credit reconciliation preserve history and independent balances', {
  skip: process.env.LEAVE_POLICY_DB_TEST !== 'true',
}, async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE !== 'disable' && process.env.DATABASE_URL?.includes('sslmode=require')
      ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  try {
    await client.query('BEGIN')
    // Unqualified SQL cannot resolve any permanent application tables.
    await client.query('SET LOCAL search_path = pg_temp')
    await client.query(`
      CREATE TEMP TABLE leave_policies (id text PRIMARY KEY, name text, paid_days_per_year numeric,
        min_months_employed int, remarks text, is_employee_requestable boolean, updated_at timestamptz);
      CREATE TEMP TABLE leave_policy_settings (id int, probationary_months int DEFAULT 6, updated_at timestamptz);
      CREATE TEMP TABLE employees (id int PRIMARY KEY, date_hired date, leave_credits numeric DEFAULT 15,
        leave_credits_entitlement numeric DEFAULT 15, leave_credits_reset_year int, updated_at timestamptz);
      CREATE TEMP TABLE leave_requests (id int, employee_id int, leave_type_name text, start_date date,
        status text, leave_pay_type text, credits_deducted numeric);
      INSERT INTO leave_policies VALUES
        ('sick_leave', 'Sick Leave', 5, 12, '', true, NOW()),
        ('vacation_leave', 'Vacation Leave', 3, 6, '', true, NOW()),
        ('service_incentive_leave', 'Service Incentive Leave', 5, 12, '', true, NOW()),
        ('bereavement_leave', 'Bereavement Leave', 2, 12, '', true, NOW());
      INSERT INTO leave_policy_settings (id) VALUES (1);
      INSERT INTO employees (id, date_hired, leave_credits_reset_year) VALUES
        (1, '2024-01-01', 2026), (2, '2026-07-02', 2026), (3, '2026-07-03', 2026),
        (4, '2025-10-02', 2025), (5, '2025-10-03', 2026), (6, NULL, 2026);
      INSERT INTO leave_requests VALUES
        (1, 1, 'Sick Leave', '2026-04-01', 'approved', 'paid', 9),
        (2, 1, 'Bereavement Leave', '2026-05-01', 'approved', 'paid', 2),
        (3, 2, 'Vacation Leave', '2026-08-01', 'approved', 'paid', 1),
        (4, 2, 'Sick Leave', '2026-08-02', 'pending', 'paid', 2),
        (5, 4, 'Sick Leave', '2026-09-01', 'approved', 'paid', 2),
        (6, 4, 'Vacation Leave', '2025-09-01', 'approved', 'paid', 3);
    `)
    const tables = await client.query(`SELECT relpersistence FROM pg_class WHERE oid IN
      ('employees'::regclass, 'leave_policies'::regclass, 'leave_policy_settings'::regclass, 'leave_requests'::regclass)`)
    assert.equal(tables.rows.length, 4)
    assert.ok(tables.rows.every((row) => row.relpersistence === 't'))

    const migration = fs.readFileSync(path.join(__dirname, '../migrations/023_leave_credit_policy_update.sql'), 'utf8')
    await client.query(migration)
    await refreshEmployeeLeaveCredits(client, null, '2026-10-02')
    const employees = await client.query('SELECT id, leave_credits, leave_credits_entitlement FROM employees ORDER BY id')
    assert.deepEqual(employees.rows.map((row) => [row.id, Number(row.leave_credits), Number(row.leave_credits_entitlement)]),
      [[1, 8, 13], [2, 7, 8], [3, 0, 0], [4, 11, 13], [5, 8, 8], [6, 0, 0]])
    assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM leave_requests')).rows[0].count, 6)
    const policies = await client.query('SELECT id, is_active, cash_convertible FROM leave_policies')
    assert.equal(policies.rows.find((row) => row.id === 'bereavement_leave').is_active, false)
    assert.equal(policies.rows.find((row) => row.id === 'service_incentive_leave').cash_convertible, true)
    assert.equal((await client.query('SELECT probationary_months FROM leave_policy_settings')).rows[0].probationary_months, 3)
    // Idempotency, year reset, and a single-employee refresh.
    await client.query(migration)
    assert.equal((await refreshEmployeeLeaveCredits(client, null, '2026-10-02')).length, 0)
    await refreshEmployeeLeaveCredits(client, 1, '2027-01-01')
    assert.equal(Number((await client.query('SELECT leave_credits FROM employees WHERE id = 1')).rows[0].leave_credits), 13)
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
})
