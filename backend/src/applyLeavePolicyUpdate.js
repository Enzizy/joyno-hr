const fs = require('node:fs')
const path = require('node:path')
const { refreshEmployeeLeaveCredits } = require('./services/employeeLeaveBalanceService')

const migration = '023_leave_credit_policy_update.sql'

async function applyLeavePolicyUpdate(db, backupDirectory) {
  if (!path.isAbsolute(backupDirectory)) throw new Error('Provide an absolute backup directory')
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('joyno-hr:leave-policy-023'))")
    const applied = await tx.query('SELECT filename FROM schema_migrations WHERE filename = $1', [migration])
    if (applied.rows.length) return { alreadyApplied: true, migration }

    const policyRows = (await tx.query('SELECT * FROM leave_policies ORDER BY id')).rows
    for (const id of ['sick_leave', 'vacation_leave', 'service_incentive_leave', 'bereavement_leave']) {
      if (!policyRows.some((policy) => policy.id === id)) throw new Error(`Required leave policy is missing: ${id}`)
    }
    const snapshot = {
      created_at: new Date().toISOString(), migration,
      leave_policies: policyRows,
      leave_policy_settings: (await tx.query('SELECT * FROM leave_policy_settings WHERE id = 1')).rows,
      employee_credit_summaries: (await tx.query('SELECT id, leave_credits, leave_credits_entitlement, leave_credits_reset_year FROM employees ORDER BY id')).rows,
      column_defaults: (await tx.query(`SELECT a.attrelid::regclass::text AS table_name, a.attname AS column_name,
          pg_get_expr(d.adbin, d.adrelid) AS column_default
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE (a.attrelid = 'employees'::regclass AND a.attname IN ('leave_credits', 'leave_credits_entitlement'))
           OR (a.attrelid = 'leave_policy_settings'::regclass AND a.attname = 'probationary_months')`)).rows,
    }
    if (!snapshot.leave_policy_settings.length) throw new Error('Leave policy settings are missing')
    fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 })
    const backupPath = path.join(backupDirectory, `leave-policy-before-023-${snapshot.created_at.replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(backupPath, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 })

    await tx.query(fs.readFileSync(path.join(__dirname, '../migrations', migration), 'utf8'))
    await refreshEmployeeLeaveCredits(tx)
    await tx.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [migration])
    return { alreadyApplied: false, migration, backupPath }
  })
}

if (require.main === module) {
  require('dotenv').config()
  const db = require('./db')
  applyLeavePolicyUpdate(db, process.argv[2] || '')
    .then((result) => { console.log(JSON.stringify(result)); process.exit(0) })
    .catch((error) => { console.error(`Leave update failed; database transaction rolled back: ${error.message}`); process.exit(1) })
}

module.exports = { applyLeavePolicyUpdate }
