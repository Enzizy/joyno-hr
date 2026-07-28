const express = require('express')
const { getLeavePolicySettings } = require('../services/leavePolicyService')
const { getPhilippineHolidays, validDate } = require('../services/philippineHolidayService')
const { validateHrCalendarEntry } = require('../services/hrCalendarEntryService')

const MANAGEMENT_ROLES = ['admin', 'hr', 'ceo']

function isManagement(user) {
  return MANAGEMENT_ROLES.includes(user?.role)
}

function createLeaveInsightsRouter({ db, authRequired, requireRole, addAuditLog }) {
  const router = express.Router()

  async function loadHrCalendarEntry(id) {
    const { rows } = await db.query(
      `SELECT
         entry.id AS record_id,
         'hr-' || entry.id AS id,
         'hr_entry' AS source,
         entry.entry_type,
         entry.employee_id,
         CASE
           WHEN entry.entry_type = 'leave'
             THEN TRIM(CONCAT(employee.first_name, ' ', employee.last_name))
           ELSE entry.title
         END AS employee_name,
         entry.title,
         entry.leave_type_name,
         entry.start_date,
         entry.end_date,
         CASE WHEN entry.entry_type = 'leave' THEN 'recorded' ELSE 'note' END AS status,
         'not_applicable' AS leave_pay_type,
         entry.description,
         entry.is_employee_visible,
         COALESCE(employee.department, 'Unassigned') AS department,
         entry.created_at,
         entry.updated_at
       FROM hr_calendar_entries entry
       LEFT JOIN employees employee ON employee.id = entry.employee_id
       WHERE entry.id = $1`,
      [id]
    )
    return rows[0] || null
  }

  router.get('/api/philippine-holidays', authRequired, async (req, res) => {
    if (!validDate(req.query.from) || !validDate(req.query.to) || req.query.from > req.query.to) {
      return res.status(400).json({ message: 'Valid holiday date range is required' })
    }
    res.json(await getPhilippineHolidays(db, req.query.from, req.query.to))
  })

  router.get('/api/hr-calendar-entries', authRequired, async (req, res) => {
    if (!validDate(req.query.from) || !validDate(req.query.to) || req.query.from > req.query.to) {
      return res.status(400).json({ message: 'Valid calendar date range is required' })
    }

    const params = [req.query.from, req.query.to]
    const filters = ['entry.start_date <= $2', 'entry.end_date >= $1']
    if (!isManagement(req.user)) {
      params.push(req.user.employee_id || 0)
      filters.push(`entry.employee_id = $${params.length}`)
      filters.push('entry.is_employee_visible = TRUE')
    } else if (req.query.department) {
      params.push(String(req.query.department))
      filters.push(`COALESCE(employee.department, 'Unassigned') = $${params.length}`)
    }

    const { rows } = await db.query(
      `SELECT
         entry.id AS record_id,
         'hr-' || entry.id AS id,
         'hr_entry' AS source,
         entry.entry_type,
         entry.employee_id,
         CASE
           WHEN entry.entry_type = 'leave'
             THEN TRIM(CONCAT(employee.first_name, ' ', employee.last_name))
           ELSE entry.title
         END AS employee_name,
         entry.title,
         entry.leave_type_name,
         entry.start_date,
         entry.end_date,
         CASE WHEN entry.entry_type = 'leave' THEN 'recorded' ELSE 'note' END AS status,
         'not_applicable' AS leave_pay_type,
         entry.description,
         entry.is_employee_visible,
         COALESCE(employee.department, 'Unassigned') AS department,
         entry.created_at,
         entry.updated_at
       FROM hr_calendar_entries entry
       LEFT JOIN employees employee ON employee.id = entry.employee_id
       WHERE ${filters.join(' AND ')}
       ORDER BY entry.start_date ASC, entry.created_at ASC`,
      params
    )
    res.json(rows)
  })

  router.post(
    '/api/hr-calendar-entries',
    authRequired,
    requireRole(MANAGEMENT_ROLES),
    async (req, res) => {
      const validated = validateHrCalendarEntry(req.body)
      if (validated.error) return res.status(400).json({ message: validated.error })
      const entry = validated.value

      if (entry.employee_id) {
        const employeeResult = await db.query('SELECT id FROM employees WHERE id = $1', [entry.employee_id])
        if (!employeeResult.rows.length) return res.status(404).json({ message: 'Employee not found' })
      }

      const { rows } = await db.query(
        `INSERT INTO hr_calendar_entries
           (entry_type, employee_id, title, leave_type_name, start_date, end_date,
            description, is_employee_visible, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
         RETURNING id`,
        [
          entry.entry_type,
          entry.employee_id,
          entry.title,
          entry.leave_type_name,
          entry.start_date,
          entry.end_date,
          entry.description,
          entry.is_employee_visible,
          req.user.id,
        ]
      )
      const id = rows[0]?.id
      await addAuditLog(req.user.id, 'create_hr_calendar_entry', 'hr_calendar_entries', id)
      res.status(201).json(await loadHrCalendarEntry(id))
    }
  )

  router.put(
    '/api/hr-calendar-entries/:id',
    authRequired,
    requireRole(MANAGEMENT_ROLES),
    async (req, res) => {
      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ message: 'Invalid calendar entry id' })
      const validated = validateHrCalendarEntry(req.body)
      if (validated.error) return res.status(400).json({ message: validated.error })
      const entry = validated.value

      if (entry.employee_id) {
        const employeeResult = await db.query('SELECT id FROM employees WHERE id = $1', [entry.employee_id])
        if (!employeeResult.rows.length) return res.status(404).json({ message: 'Employee not found' })
      }

      const { rowCount } = await db.query(
        `UPDATE hr_calendar_entries
         SET entry_type = $1, employee_id = $2, title = $3, leave_type_name = $4,
             start_date = $5, end_date = $6, description = $7,
             is_employee_visible = $8, updated_by = $9, updated_at = NOW()
         WHERE id = $10`,
        [
          entry.entry_type,
          entry.employee_id,
          entry.title,
          entry.leave_type_name,
          entry.start_date,
          entry.end_date,
          entry.description,
          entry.is_employee_visible,
          req.user.id,
          id,
        ]
      )
      if (!rowCount) return res.status(404).json({ message: 'Calendar entry not found' })
      await addAuditLog(req.user.id, 'update_hr_calendar_entry', 'hr_calendar_entries', id)
      res.json(await loadHrCalendarEntry(id))
    }
  )

  router.delete(
    '/api/hr-calendar-entries/:id',
    authRequired,
    requireRole(MANAGEMENT_ROLES),
    async (req, res) => {
      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ message: 'Invalid calendar entry id' })
      const { rowCount } = await db.query('DELETE FROM hr_calendar_entries WHERE id = $1', [id])
      if (!rowCount) return res.status(404).json({ message: 'Calendar entry not found' })
      await addAuditLog(req.user.id, 'delete_hr_calendar_entry', 'hr_calendar_entries', id)
      res.json({ ok: true })
    }
  )

  router.get('/api/leave-calendar', authRequired, async (req, res) => {
    const now = new Date()
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const defaultTo = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`
    const from = validDate(req.query.from) ? req.query.from : defaultFrom
    const to = validDate(req.query.to) ? req.query.to : defaultTo
    const params = [from, to]
    const filters = ["lr.status IN ('pending', 'approved')", 'lr.start_date <= $2', 'lr.end_date >= $1']

    if (!isManagement(req.user)) {
      params.push(req.user.employee_id || 0)
      filters.push(`lr.employee_id = $${params.length}`)
    } else if (req.query.department) {
      params.push(String(req.query.department))
      filters.push(`COALESCE(e.department, 'Unassigned') = $${params.length}`)
    }

    const { rows } = await db.query(
      `SELECT lr.id, lr.employee_id, lr.employee_name, lr.leave_type_name, lr.start_date,
              lr.end_date, lr.status, lr.leave_pay_type, COALESCE(e.department, 'Unassigned') AS department
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       WHERE ${filters.join(' AND ')}
       ORDER BY lr.start_date ASC, lr.employee_name ASC`,
      params
    )
    res.json(rows)
  })

  router.get(
    '/api/leave-availability',
    authRequired,
    requireRole(MANAGEMENT_ROLES),
    async (req, res) => {
      const employeeId = Number(req.query.employee_id)
      const excludeId = Number(req.query.exclude_id) || 0
      const from = req.query.from
      const to = req.query.to
      if (!employeeId || !validDate(from) || !validDate(to)) {
        return res.status(400).json({ message: 'Employee and valid date range are required' })
      }

      const employeeResult = await db.query(
        `SELECT id, department FROM employees WHERE id = $1`,
        [employeeId]
      )
      const employee = employeeResult.rows[0]
      if (!employee) return res.status(404).json({ message: 'Employee not found' })

      const department = employee.department || 'Unassigned'
      const [headcountResult, conflictResult, policySettings] = await Promise.all([
        db.query(
          `SELECT COUNT(*)::int AS count FROM employees
           WHERE COALESCE(department, 'Unassigned') = $1 AND status IN ('active', 'on_leave')`,
          [department]
        ),
        db.query(
          `SELECT lr.id, lr.employee_id, lr.employee_name, lr.start_date, lr.end_date,
                  lr.leave_type_name, lr.status
           FROM leave_requests lr
           JOIN employees e ON e.id = lr.employee_id
           WHERE COALESCE(e.department, 'Unassigned') = $1
             AND lr.employee_id <> $2 AND lr.id <> $3
             AND lr.status IN ('pending', 'approved')
             AND lr.start_date <= $5 AND lr.end_date >= $4
           ORDER BY lr.start_date ASC`,
          [department, employeeId, excludeId, from, to]
        ),
        getLeavePolicySettings(),
      ])

      const departmentHeadcount = Number(headcountResult.rows[0]?.count || 0)
      const unavailableCount = conflictResult.rows.length
      const remainingAvailable = Math.max(0, departmentHeadcount - unavailableCount - 1)
      const threshold = Number(policySettings.availability_warning_threshold || 2)
      res.json({
        department,
        department_headcount: departmentHeadcount,
        unavailable_count: unavailableCount,
        remaining_available: remainingAvailable,
        warning_threshold: threshold,
        has_warning: unavailableCount >= threshold,
        conflicts: conflictResult.rows,
      })
    }
  )

  router.get('/api/leave-requests/:id/timeline', authRequired, async (req, res) => {
    const id = Number(req.params.id)
    const requestResult = await db.query(
      `SELECT id, employee_id, employee_name, leave_type_name, status, created_at, decided_at,
              approved_by_name, approved_by_role, rejection_comment
       FROM leave_requests WHERE id = $1`,
      [id]
    )
    const leave = requestResult.rows[0]
    if (!leave) return res.status(404).json({ message: 'Leave request not found' })
    const ownsRequest = Number(leave.employee_id) === Number(req.user.employee_id)
    if (!ownsRequest && !isManagement(req.user)) return res.status(403).json({ message: 'Forbidden' })

    const [commentResult, changeResult] = await Promise.all([
      db.query(
        `SELECT c.id, c.message, c.author_role, c.created_at, u.email,
                e.first_name, e.last_name
         FROM leave_request_comments c
         JOIN users u ON u.id = c.user_id
         LEFT JOIN employees e ON e.id = u.employee_id
         WHERE c.leave_request_id = $1 ORDER BY c.created_at ASC`,
        [id]
      ),
      db.query(
        `SELECT id, request_type, original_start_date, original_end_date,
                requested_start_date, requested_end_date, reason, status,
                review_comment, reviewed_by_name, reviewed_by_role,
                created_at, reviewed_at
         FROM leave_change_requests
         WHERE leave_request_id = $1 ORDER BY created_at ASC`,
        [id]
      ),
    ])
    const events = [{
      id: `submitted-${id}`,
      type: 'submitted',
      title: 'Leave request submitted',
      actor: leave.employee_name || 'Employee',
      message: leave.leave_type_name,
      created_at: leave.created_at,
    }]
    for (const comment of commentResult.rows) {
      events.push({
        id: `comment-${comment.id}`,
        type: 'comment',
        title: 'Comment added',
        actor: `${comment.first_name || ''} ${comment.last_name || ''}`.trim() || comment.email,
        actor_role: comment.author_role,
        message: comment.message,
        created_at: comment.created_at,
      })
    }
    if (['approved', 'rejected', 'cancelled'].includes(leave.status)) {
      const originalDecision = leave.status === 'cancelled' ? 'approved' : leave.status
      events.push({
        id: `decision-${id}`,
        type: originalDecision,
        title: `Leave request ${originalDecision}`,
        actor: leave.approved_by_name || 'Management',
        actor_role: leave.approved_by_role,
        message: originalDecision === 'rejected' ? leave.rejection_comment : '',
        created_at: leave.decided_at || leave.created_at,
      })
    }
    for (const change of changeResult.rows) {
      const action = change.request_type === 'move' ? 'date move' : 'cancellation'
      const requestedDates = change.request_type === 'move'
        ? `Requested dates: ${change.requested_start_date} - ${change.requested_end_date}`
        : ''
      events.push({
        id: `change-requested-${change.id}`,
        type: 'change_requested',
        title: `Leave ${action} requested`,
        actor: leave.employee_name || 'Employee',
        actor_role: 'employee',
        message: [requestedDates, change.reason].filter(Boolean).join('\n'),
        created_at: change.created_at,
      })
      if (change.status !== 'pending') {
        events.push({
          id: `change-reviewed-${change.id}`,
          type: change.status,
          title: `Leave ${action} ${change.status}`,
          actor: change.reviewed_by_name || 'Management',
          actor_role: change.reviewed_by_role,
          message: change.review_comment || '',
          created_at: change.reviewed_at,
        })
      }
    }
    events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    res.json(events)
  })

  return router
}

module.exports = { createLeaveInsightsRouter }
