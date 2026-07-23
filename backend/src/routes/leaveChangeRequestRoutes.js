const express = require('express')
const { addAuditLog, updateEmployeeStatus } = require('../helpers')

const MANAGEMENT_ROLES = ['admin', 'hr', 'ceo']
const REQUEST_COLUMNS = `
  lcr.id, lcr.leave_request_id, lcr.employee_id, lcr.request_type,
  lcr.original_start_date, lcr.original_end_date, lcr.requested_start_date,
  lcr.requested_end_date, lcr.reason, lcr.status, lcr.review_comment,
  lcr.reviewed_by, lcr.reviewed_by_name, lcr.reviewed_by_role,
  lcr.credits_refunded, lcr.created_at, lcr.reviewed_at,
  lr.employee_name, lr.employee_code, lr.leave_type_name,
  lr.start_date AS current_start_date, lr.end_date AS current_end_date,
  lr.leave_pay_type, lr.leave_days, lr.paid_days, lr.unpaid_days,
  lr.credits_deducted, lr.status AS leave_status`

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function dateOnly(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function rangeLabel(start, end) {
  return `${dateOnly(start)} - ${dateOnly(end)}`
}

function createLeaveChangeRequestRouter({
  db,
  authRequired,
  requireRole,
  calculateLeaveDays,
  createNotification,
  notifyRoles,
  sendEmailNotification,
  frontendOrigin,
}) {
  const router = express.Router()

  async function findRequest(queryable, id) {
    const { rows } = await queryable.query(
      `SELECT ${REQUEST_COLUMNS}
       FROM leave_change_requests lcr
       JOIN leave_requests lr ON lr.id = lcr.leave_request_id
       WHERE lcr.id = $1`,
      [id]
    )
    return rows[0] || null
  }

  async function notifyManagement(changeRequest) {
    const typeLabel = changeRequest.request_type === 'move' ? 'reschedule' : 'cancellation'
    await notifyRoles(['admin', 'hr'], {
      type: 'leave_change_requested',
      title: `Leave ${typeLabel} requested`,
      message: `${changeRequest.employee_name} requested a leave ${typeLabel}.`,
      targetTable: 'leave_requests',
      targetId: changeRequest.leave_request_id,
    })
    const { rows } = await db.query(
      `SELECT DISTINCT email FROM users
       WHERE role IN ('admin', 'hr') AND email IS NOT NULL AND email <> ''`
    )
    const reviewUrl = frontendOrigin ? `${frontendOrigin}/leave-approvals` : ''
    for (const recipient of rows) {
      sendEmailNotification({
        to: recipient.email,
        subject: `Leave ${typeLabel} request: ${changeRequest.employee_name}`,
        text: [
          'A change to an approved leave needs review.',
          '',
          `Employee: ${changeRequest.employee_name}`,
          `Leave type: ${changeRequest.leave_type_name}`,
          `Current dates: ${rangeLabel(changeRequest.original_start_date, changeRequest.original_end_date)}`,
          changeRequest.request_type === 'move'
            ? `Requested dates: ${rangeLabel(changeRequest.requested_start_date, changeRequest.requested_end_date)}`
            : 'Requested action: Cancel approved leave',
          `Reason: ${changeRequest.reason}`,
          reviewUrl ? `Open leave approvals: ${reviewUrl}` : 'Open Joyno HR to review the request.',
        ].join('\n'),
      })
    }
  }

  async function notifyEmployee(changeRequest) {
    const { rows } = await db.query(
      `SELECT u.id, u.email, e.first_name, e.last_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.employee_id = $1 ORDER BY u.id ASC LIMIT 1`,
      [changeRequest.employee_id]
    )
    const owner = rows[0]
    if (!owner) return
    const action = changeRequest.request_type === 'move' ? 'reschedule' : 'cancellation'
    const approved = changeRequest.status === 'approved'
    await createNotification({
      userId: owner.id,
      type: approved ? 'leave_change_approved' : 'leave_change_rejected',
      title: `Leave ${action} ${approved ? 'approved' : 'rejected'}`,
      message: approved
        ? `Your leave ${action} request was approved.`
        : changeRequest.review_comment || `Your leave ${action} request was not approved.`,
      targetTable: 'leave_requests',
      targetId: changeRequest.leave_request_id,
    })
    const employeeName = `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || 'Employee'
    const leaveUrl = frontendOrigin ? `${frontendOrigin}/leave-request` : ''
    sendEmailNotification({
      to: owner.email,
      subject: `Leave ${action} request ${approved ? 'approved' : 'rejected'}`,
      text: [
        `Hi ${employeeName},`,
        '',
        `Your request to ${action} your approved leave was ${approved ? 'approved' : 'rejected'}.`,
        changeRequest.request_type === 'move' && approved
          ? `New dates: ${rangeLabel(changeRequest.requested_start_date, changeRequest.requested_end_date)}`
          : '',
        changeRequest.request_type === 'cancel' && approved
          ? `Credits returned: ${Number(changeRequest.credits_refunded || 0).toFixed(2)}`
          : '',
        changeRequest.review_comment ? `Management note: ${changeRequest.review_comment}` : '',
        leaveUrl ? `View your leave: ${leaveUrl}` : 'Open Joyno HR to view the update.',
      ].filter(Boolean).join('\n'),
    })
  }

  router.get('/api/leave-change-requests', authRequired, async (req, res) => {
    const isManagement = MANAGEMENT_ROLES.includes(req.user.role)
    const params = []
    const filters = []
    if (!isManagement) {
      if (!req.user.employee_id) return res.json([])
      params.push(req.user.employee_id)
      filters.push(`lcr.employee_id = $${params.length}`)
    } else if (req.query.scope === 'mine') {
      params.push(req.user.employee_id || 0)
      filters.push(`lcr.employee_id = $${params.length}`)
    }
    if (req.query.status) {
      params.push(String(req.query.status).toLowerCase())
      filters.push(`lcr.status = $${params.length}`)
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const { rows } = await db.query(
      `SELECT ${REQUEST_COLUMNS}
       FROM leave_change_requests lcr
       JOIN leave_requests lr ON lr.id = lcr.leave_request_id
       ${where}
       ORDER BY CASE WHEN lcr.status = 'pending' THEN 0 ELSE 1 END, lcr.created_at ASC`,
      params
    )
    res.json(rows)
  })

  router.post('/api/leave-change-requests', authRequired, async (req, res) => {
    if (!req.user.employee_id) return res.status(400).json({ message: 'No employee linked to your account' })
    const leaveRequestId = Number(req.body?.leave_request_id)
    const requestType = String(req.body?.request_type || '').toLowerCase()
    const requestedStartDate = req.body?.requested_start_date
    const requestedEndDate = req.body?.requested_end_date
    const reason = String(req.body?.reason || '').trim()
    if (!leaveRequestId || !['move', 'cancel'].includes(requestType)) {
      return res.status(400).json({ message: 'Approved leave and request type are required' })
    }
    if (!reason || reason.length > 2000) {
      return res.status(400).json({ message: 'Reason must be between 1 and 2000 characters' })
    }
    if (requestType === 'move' && (!validDate(requestedStartDate) || !validDate(requestedEndDate))) {
      return res.status(400).json({ message: 'Valid requested dates are required' })
    }

    try {
      const created = await db.transaction(async (tx) => {
        const { rows } = await tx.query(
          `SELECT id, employee_id, employee_name, leave_type_name, start_date, end_date,
                  status, leave_days, start_date > CURRENT_DATE AS is_future
           FROM leave_requests WHERE id = $1 FOR UPDATE`,
          [leaveRequestId]
        )
        const leave = rows[0]
        if (!leave) {
          const error = new Error('Leave request not found')
          error.status = 404
          throw error
        }
        if (Number(leave.employee_id) !== Number(req.user.employee_id)) {
          const error = new Error('You can only change your own leave')
          error.status = 403
          throw error
        }
        if (leave.status !== 'approved') {
          const error = new Error('Only approved leave can be changed')
          error.status = 400
          throw error
        }
        if (!leave.is_future) {
          const error = new Error('Only future leave can be moved or cancelled')
          error.status = 400
          throw error
        }
        if (requestType === 'move') {
          const requestedDays = await calculateLeaveDays(requestedStartDate, requestedEndDate)
          const futureDate = await tx.query(
            'SELECT $1::date > CURRENT_DATE AS is_future',
            [requestedStartDate]
          )
          if (!requestedDays || !futureDate.rows[0]?.is_future) {
            const error = new Error('New leave dates must be a valid future range')
            error.status = 400
            throw error
          }
          if (Number(requestedDays) !== Number(leave.leave_days)) {
            const error = new Error(`Rescheduled leave must remain ${Number(leave.leave_days)} day(s)`)
            error.status = 400
            throw error
          }
          if (String(requestedStartDate).slice(0, 4) !== String(leave.start_date).slice(0, 4)) {
            const error = new Error('Rescheduled leave must remain in the same calendar year')
            error.status = 400
            throw error
          }
          const overlap = await tx.query(
            `SELECT id FROM leave_requests
             WHERE employee_id = $1 AND id <> $2 AND status IN ('pending', 'approved')
               AND start_date <= $3 AND end_date >= $4 LIMIT 1`,
            [leave.employee_id, leave.id, requestedEndDate, requestedStartDate]
          )
          if (overlap.rows.length) {
            const error = new Error('The requested dates overlap another leave request')
            error.status = 400
            throw error
          }
        }
        const insert = await tx.query(
          `INSERT INTO leave_change_requests
           (leave_request_id, employee_id, request_type, original_start_date,
            original_end_date, requested_start_date, requested_end_date, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id`,
          [
            leave.id,
            leave.employee_id,
            requestType,
            leave.start_date,
            leave.end_date,
            requestType === 'move' ? requestedStartDate : null,
            requestType === 'move' ? requestedEndDate : null,
            reason,
          ]
        )
        return findRequest(tx, insert.rows[0].id)
      })
      await notifyManagement(created)
      await addAuditLog(req.user.id, `request_leave_${requestType}`, 'leave_change_requests', created.id)
      res.status(201).json(created)
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'A change request for this leave is already pending' })
      }
      res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to submit leave change request' })
    }
  })

  router.post(
    '/api/leave-change-requests/:id/approve',
    authRequired,
    requireRole(MANAGEMENT_ROLES),
    async (req, res) => {
      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ message: 'Invalid change request id' })
      try {
        const updated = await db.transaction(async (tx) => {
          const changeRequest = await findRequest(tx, id)
          if (!changeRequest) {
            const error = new Error('Change request not found')
            error.status = 404
            throw error
          }
          if (changeRequest.status !== 'pending') {
            const error = new Error('Only pending change requests can be approved')
            error.status = 400
            throw error
          }
          const dateEligibility = await tx.query(
            `SELECT $1::date > CURRENT_DATE AS leave_is_future,
                    $2::date > CURRENT_DATE AS requested_is_future`,
            [changeRequest.current_start_date, changeRequest.requested_start_date || changeRequest.current_start_date]
          )
          if (changeRequest.leave_status !== 'approved' || !dateEligibility.rows[0]?.leave_is_future) {
            const error = new Error('The approved leave is no longer eligible for changes')
            error.status = 400
            throw error
          }
          let creditsRefunded = 0
          if (changeRequest.request_type === 'move') {
            if (!dateEligibility.rows[0]?.requested_is_future) {
              const error = new Error('The requested dates are no longer in the future')
              error.status = 400
              throw error
            }
            const overlap = await tx.query(
              `SELECT id FROM leave_requests
               WHERE employee_id = $1 AND id <> $2 AND status IN ('pending', 'approved')
                 AND start_date <= $3 AND end_date >= $4 LIMIT 1`,
              [
                changeRequest.employee_id,
                changeRequest.leave_request_id,
                changeRequest.requested_end_date,
                changeRequest.requested_start_date,
              ]
            )
            if (overlap.rows.length) {
              const error = new Error('The requested dates now overlap another leave request')
              error.status = 409
              throw error
            }
            await tx.query(
              `UPDATE leave_requests SET start_date = $1, end_date = $2 WHERE id = $3`,
              [changeRequest.requested_start_date, changeRequest.requested_end_date, changeRequest.leave_request_id]
            )
          } else {
            creditsRefunded = Number(changeRequest.credits_deducted || 0)
            await tx.query(
              `UPDATE leave_requests SET status = 'cancelled' WHERE id = $1`,
              [changeRequest.leave_request_id]
            )
            if (creditsRefunded > 0) {
              await tx.query(
                `UPDATE employees
                 SET leave_credits = leave_credits + $1, updated_at = NOW()
                 WHERE id = $2`,
                [creditsRefunded, changeRequest.employee_id]
              )
            }
          }
          await tx.query(
            `UPDATE leave_change_requests
             SET status = 'approved', review_comment = $1, reviewed_by = $2,
                 reviewed_by_name = $3, reviewed_by_role = $4,
                 credits_refunded = $5, reviewed_at = NOW()
             WHERE id = $6`,
            [
              String(req.body?.comment || '').trim() || null,
              req.user.id,
              req.user.email,
              req.user.role,
              creditsRefunded,
              id,
            ]
          )
          return findRequest(tx, id)
        })
        await updateEmployeeStatus(updated.employee_id)
        await notifyEmployee(updated)
        await addAuditLog(req.user.id, `approve_leave_${updated.request_type}`, 'leave_change_requests', id)
        res.json(updated)
      } catch (error) {
        res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to approve change request' })
      }
    }
  )

  router.post(
    '/api/leave-change-requests/:id/reject',
    authRequired,
    requireRole(MANAGEMENT_ROLES),
    async (req, res) => {
      const id = Number(req.params.id)
      const comment = String(req.body?.comment || '').trim()
      if (!id) return res.status(400).json({ message: 'Invalid change request id' })
      if (!comment || comment.length > 2000) {
        return res.status(400).json({ message: 'Review reason must be between 1 and 2000 characters' })
      }
      const { rowCount } = await db.query(
        `UPDATE leave_change_requests
         SET status = 'rejected', review_comment = $1, reviewed_by = $2,
             reviewed_by_name = $3, reviewed_by_role = $4, reviewed_at = NOW()
         WHERE id = $5 AND status = 'pending'`,
        [comment, req.user.id, req.user.email, req.user.role, id]
      )
      if (!rowCount) return res.status(400).json({ message: 'Pending change request not found' })
      const updated = await findRequest(db, id)
      await notifyEmployee(updated)
      await addAuditLog(req.user.id, `reject_leave_${updated.request_type}`, 'leave_change_requests', id)
      res.json(updated)
    }
  )

  return router
}

module.exports = { createLeaveChangeRequestRouter }
