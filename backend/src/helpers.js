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

async function syncAllEmployeeStatuses() {
  await db.query(
    `UPDATE employees e
     SET status = CASE
       WHEN e.status IN ('inactive','resigned') THEN e.status
       WHEN EXISTS (
         SELECT 1
         FROM leave_requests lr
         WHERE lr.employee_id = e.id
           AND lr.status = 'approved'
           AND lr.start_date <= CURRENT_DATE
           AND CURRENT_DATE <= lr.end_date
       ) THEN 'on_leave'
       ELSE 'active'
     END
     WHERE e.status IN ('active', 'on_leave')`
  )
}

module.exports = { addAuditLog, updateEmployeeStatus, syncAllEmployeeStatuses }
