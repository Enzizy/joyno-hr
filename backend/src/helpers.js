const db = require('./db')

async function addAuditLog(userId, action, targetTable, targetId) {
  if (!userId) return
  await db.query(
    'INSERT INTO audit_logs (user_id, action, target_table, target_id) VALUES ($1,$2,$3,$4)',
    [userId, action, targetTable, targetId || null]
  )
}

async function updateEmployeeStatus(employeeId) {
  if (!employeeId) return
  const { rows } = await db.query(
    `SELECT start_date, end_date FROM leave_requests
     WHERE employee_id = $1 AND status = 'approved'`,
    [employeeId]
  )
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const todayISO = `${yyyy}-${mm}-${dd}`

  let onLeave = false
  for (const r of rows) {
    if (r.start_date <= todayISO && todayISO <= r.end_date) {
      onLeave = true
      break
    }
  }
  await db.query('UPDATE employees SET status = $1 WHERE id = $2', [onLeave ? 'on_leave' : 'active', employeeId])
}

module.exports = { addAuditLog, updateEmployeeStatus }
