const express = require('express')

const MANAGEMENT_ROLES = ['admin', 'hr', 'ceo']
const EMAIL_DELIVERY_OPTIONS = ['immediate', 'daily', 'off']
const NOTIFICATION_CATEGORIES = ['leave', 'task', 'system']

function isManagement(user) {
  return MANAGEMENT_ROLES.includes(user?.role)
}

function parseLimit(value, fallback = 6, maximum = 12) {
  return Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), maximum)
}

function notificationCategorySql(alias = 'n') {
  return `CASE
    WHEN ${alias}.type LIKE 'leave_%' THEN 'leave'
    WHEN ${alias}.type LIKE 'task_%' THEN 'task'
    ELSE 'system'
  END`
}

function createWorkspaceRouter({ db, authRequired, requireRole }) {
  const router = express.Router()

  router.get('/api/workspace-search', authRequired, async (req, res) => {
    const query = String(req.query.q || '').trim()
    if (query.length < 2) return res.json({ employees: [], leaves: [], tasks: [], notifications: [] })

    const limit = parseLimit(req.query.limit)
    const search = `%${query}%`
    const management = isManagement(req.user)
    const employeePromise = management
      ? db.query(
        `SELECT id, employee_code, first_name, last_name, department, position, status
         FROM employees
         WHERE CONCAT_WS(' ', first_name, last_name, employee_code, department, position) ILIKE $1
         ORDER BY first_name, last_name LIMIT $2`,
        [search, limit]
      )
      : Promise.resolve({ rows: [] })

    const leaveParams = [search, limit]
    let leaveAccess = ''
    if (!management) {
      leaveParams.push(Number(req.user.employee_id || 0))
      leaveAccess = 'AND employee_id = $3'
    }
    const leavePromise = db.query(
      `SELECT id, employee_id, employee_name, leave_type_name, start_date, end_date, status, reason, created_at
       FROM leave_requests
       WHERE CONCAT_WS(' ', employee_name, leave_type_name, reason, status) ILIKE $1 ${leaveAccess}
       ORDER BY created_at DESC LIMIT $2`,
      leaveParams
    )

    const taskParams = [search, limit]
    let taskAccess = ''
    if (!management) {
      taskParams.push(Number(req.user.id))
      taskAccess = `AND (
        assigned_to = $3 OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(assigned_to_ids, '[]'::jsonb)) AS assignee(user_id)
          WHERE assignee.user_id::int = $3
        )
      )`
    }
    const taskPromise = db.query(
      `SELECT id, title, description, task_type, status, priority, due_date
       FROM tasks
       WHERE CONCAT_WS(' ', title, description, status, priority, task_type) ILIKE $1 ${taskAccess}
       ORDER BY due_date DESC NULLS LAST LIMIT $2`,
      taskParams
    )

    const notificationPromise = db.query(
      `SELECT id, type, title, message, target_table, target_id, is_read, created_at,
              ${notificationCategorySql()} AS category
       FROM notifications n
       WHERE user_id = $1 AND CONCAT_WS(' ', title, message, type) ILIKE $2
       ORDER BY created_at DESC LIMIT $3`,
      [req.user.id, search, limit]
    )

    const [employees, leaves, tasks, notifications] = await Promise.all([
      employeePromise,
      leavePromise,
      taskPromise,
      notificationPromise,
    ])
    res.json({ employees: employees.rows, leaves: leaves.rows, tasks: tasks.rows, notifications: notifications.rows })
  })

  router.get('/api/notification-feed', authRequired, async (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 100)
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0)
    const category = NOTIFICATION_CATEGORIES.includes(req.query.category) ? req.query.category : ''
    const unreadOnly = String(req.query.unread || '').toLowerCase() === 'true'
    const search = String(req.query.search || '').trim()
    const params = [req.user.id]
    const filters = ['n.user_id = $1']
    if (category) {
      params.push(category)
      filters.push(`${notificationCategorySql()} = $${params.length}`)
    }
    if (unreadOnly) filters.push('n.is_read = FALSE')
    if (search) {
      params.push(`%${search}%`)
      filters.push(`CONCAT_WS(' ', n.title, n.message, n.type) ILIKE $${params.length}`)
    }
    const where = `WHERE ${filters.join(' AND ')}`
    const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM notifications n ${where}`, params)
    const listParams = [...params, limit, offset]
    const { rows } = await db.query(
      `SELECT n.*, ${notificationCategorySql()} AS category,
        CASE
          WHEN n.target_table = 'leave_requests' THEN (
            SELECT jsonb_build_object('employee_name', lr.employee_name, 'leave_type', lr.leave_type_name,
              'status', lr.status, 'start_date', lr.start_date, 'end_date', lr.end_date)
            FROM leave_requests lr WHERE lr.id = n.target_id
          )
          WHEN n.target_table = 'tasks' THEN (
            SELECT jsonb_build_object('title', t.title, 'status', t.status, 'priority', t.priority,
              'due_date', t.due_date, 'task_type', t.task_type)
            FROM tasks t WHERE t.id = n.target_id
          )
          ELSE NULL
        END AS preview
       FROM notifications n ${where}
       ORDER BY n.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    )
    const unreadResult = await db.query(
      'SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    )
    res.json({
      items: rows,
      total: Number(countResult.rows[0]?.total || 0),
      unread_count: Number(unreadResult.rows[0]?.unread_count || 0),
      limit,
      offset,
    })
  })

  router.get('/api/notification-preferences', authRequired, async (req, res) => {
    const { rows } = await db.query(
      `SELECT user_id, email_delivery, leave_enabled, task_enabled, system_enabled, updated_at
       FROM notification_preferences WHERE user_id = $1`,
      [req.user.id]
    )
    res.json(rows[0] || {
      user_id: req.user.id,
      email_delivery: 'immediate',
      leave_enabled: true,
      task_enabled: true,
      system_enabled: true,
    })
  })

  router.put('/api/notification-preferences', authRequired, async (req, res) => {
    const emailDelivery = EMAIL_DELIVERY_OPTIONS.includes(req.body?.email_delivery)
      ? req.body.email_delivery
      : 'immediate'
    const values = [
      req.user.id,
      emailDelivery,
      req.body?.leave_enabled !== false,
      req.body?.task_enabled !== false,
      req.body?.system_enabled !== false,
    ]
    const { rows } = await db.query(
      `INSERT INTO notification_preferences
         (user_id, email_delivery, leave_enabled, task_enabled, system_enabled, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         email_delivery = EXCLUDED.email_delivery,
         leave_enabled = EXCLUDED.leave_enabled,
         task_enabled = EXCLUDED.task_enabled,
         system_enabled = EXCLUDED.system_enabled,
         updated_at = NOW()
       RETURNING *`,
      values
    )
    res.json(rows[0])
  })

  router.get(
    '/api/leave-approval-inbox',
    authRequired,
    requireRole(MANAGEMENT_ROLES),
    async (req, res) => {
      const { rows } = await db.query(
        `SELECT lr.id, lr.employee_id, lr.employee_name, lr.leave_type_name, lr.start_date, lr.end_date,
                lr.reason, lr.leave_pay_type, lr.leave_days, lr.paid_days, lr.unpaid_days,
                lr.attachment_name, lr.created_at, e.department, e.leave_credits,
                GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - lr.created_at)) / 3600))::int AS filing_age_hours,
                (lr.start_date - CURRENT_DATE)::int AS days_until_start,
                COALESCE((
                  SELECT COUNT(*)::int FROM leave_requests overlap_lr
                  JOIN employees overlap_e ON overlap_e.id = overlap_lr.employee_id
                  WHERE overlap_lr.id <> lr.id AND overlap_lr.employee_id <> lr.employee_id
                    AND overlap_lr.status IN ('pending', 'approved')
                    AND COALESCE(overlap_e.department, 'Unassigned') = COALESCE(e.department, 'Unassigned')
                    AND overlap_lr.start_date <= lr.end_date AND overlap_lr.end_date >= lr.start_date
                ), 0) AS overlapping_count
         FROM leave_requests lr
         JOIN employees e ON e.id = lr.employee_id
         WHERE lr.status = 'pending'
         ORDER BY
           CASE WHEN lr.start_date <= CURRENT_DATE THEN 0 WHEN lr.created_at < NOW() - INTERVAL '48 hours' THEN 1 ELSE 2 END,
           lr.created_at ASC`
      )
      res.json(rows.map((row) => {
        const overdue = Number(row.days_until_start) <= 0
        const age = Number(row.filing_age_hours || 0)
        const urgency = overdue || age >= 48 ? 'critical' : age >= 24 || Number(row.days_until_start) <= 2 ? 'high' : 'normal'
        const enoughCredits = String(row.leave_pay_type || '').toLowerCase() === 'unpaid'
          || Number(row.leave_credits || 0) >= Number(row.paid_days || row.leave_days || 0)
        return {
          ...row,
          urgency,
          low_risk: urgency === 'normal' && Number(row.overlapping_count || 0) === 0 && enoughCredits,
        }
      }))
    }
  )

  return router
}

module.exports = { createWorkspaceRouter }
