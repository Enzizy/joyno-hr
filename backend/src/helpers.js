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
    `SELECT start_date, end_date, leave_type_name FROM leave_requests
     WHERE employee_id = $1 AND status = 'approved'`,
    [employeeId]
  )
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const todayISO = `${yyyy}-${mm}-${dd}`

  let hasCurrentAwol = false
  let hasCurrentLeave = false
  for (const r of rows) {
    if (r.start_date <= todayISO && todayISO <= r.end_date) {
      const typeName = String(r.leave_type_name || '').toLowerCase()
      if (typeName === 'absent without official leave' || typeName === 'awol') {
        hasCurrentAwol = true
        break
      }
      hasCurrentLeave = true
    }
  }
  const status = hasCurrentAwol ? 'inactive' : hasCurrentLeave ? 'on_leave' : 'active'
  await db.query('UPDATE employees SET status = $1 WHERE id = $2 AND status IN ($3, $4, $5)', [
    status,
    employeeId,
    'active',
    'on_leave',
    'inactive',
  ])
}

async function syncAllEmployeeStatuses() {
  await db.query(
    `UPDATE employees e
     SET status = CASE
       WHEN e.status = 'resigned' THEN e.status
       WHEN EXISTS (
         SELECT 1
         FROM leave_requests lr
         WHERE lr.employee_id = e.id
           AND lr.status = 'approved'
           AND lr.start_date <= CURRENT_DATE
           AND CURRENT_DATE <= lr.end_date
           AND LOWER(COALESCE(lr.leave_type_name, '')) IN ('absent without official leave', 'awol')
       ) THEN 'inactive'
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
     WHERE e.status IN ('active', 'on_leave', 'inactive')`
  )
}

module.exports = { addAuditLog, updateEmployeeStatus, syncAllEmployeeStatuses }
