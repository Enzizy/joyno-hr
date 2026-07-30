const express = require('express')
const {
  REVIEW_STATUSES,
  calculateBusinessDayDeadline,
  requiresDocument,
} = require('../services/leaveAttachmentReviewService')

const MANAGEMENT_ROLES = ['admin', 'hr', 'ceo']

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function createLeaveAttachmentReviewRouter({
  db,
  authRequired,
  requireRole,
  uploadAttachment,
  resolveLeaveType,
  createNotification,
  notifyRoles,
  getUserContactById,
  sendEmailNotification,
  addAuditLog,
  leaveRequestColumns,
  frontendOrigin,
}) {
  const router = express.Router()

  async function loadLeave(id) {
    const { rows } = await db.query(
      `SELECT ${leaveRequestColumns} FROM leave_requests WHERE id = $1`,
      [id]
    )
    return rows[0] || null
  }

  async function getOwner(leave) {
    const { rows } = await db.query(
      'SELECT id FROM users WHERE employee_id = $1 ORDER BY id ASC LIMIT 1',
      [leave.employee_id]
    )
    const user = rows[0] || null
    return { user, contact: await getUserContactById(user?.id) }
  }

  async function notifyEmployee(leave, { type, title, message, subject, lines }) {
    const { user, contact } = await getOwner(leave)
    await createNotification({
      userId: user?.id,
      type,
      title,
      message,
      targetTable: 'leave_requests',
      targetId: leave.id,
    })
    sendEmailNotification({
      to: contact?.email,
      subject,
      text: [
        `Hi ${contact?.name || 'Employee'},`,
        '',
        ...lines,
        frontendOrigin ? `Open your leave request: ${frontendOrigin}/leave-request` : '',
      ].filter(Boolean).join('\n'),
    })
  }

  router.post(
    '/api/leave-requests/:id/attachment-review',
    authRequired,
    requireRole(MANAGEMENT_ROLES),
    asyncRoute(async (req, res) => {
      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ message: 'Invalid leave request id' })
      const leave = await loadLeave(id)
      if (!leave) return res.status(404).json({ message: 'Leave request not found' })
      if (leave.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending leave documents can be reviewed' })
      }
      const leaveType = await resolveLeaveType(leave.leave_type_name)
      if (!requiresDocument(leaveType)) {
        return res.status(400).json({ message: 'This leave type does not require supporting documentation' })
      }

      const action = String(req.body?.action || '').trim().toLowerCase()
      const note = String(req.body?.note || '').trim().slice(0, 1000)
      if (!['mark_valid', 'request_replacement'].includes(action)) {
        return res.status(400).json({ message: 'Invalid document review action' })
      }

      let status
      let dueAt = null
      let responseDays = null
      if (action === 'mark_valid') {
        if (!leave.attachment_data) {
          return res.status(400).json({ message: 'There is no attachment to validate' })
        }
        status = REVIEW_STATUSES.VALID
      } else {
        if (!note) return res.status(400).json({ message: 'Explain why a replacement is required' })
        responseDays = Number(req.body?.response_days) === 1 ? 1 : 2
        dueAt = await calculateBusinessDayDeadline(db, responseDays)
        status = REVIEW_STATUSES.REPLACEMENT_REQUIRED
      }

      await db.transaction(async (tx) => {
        await tx.query(
          `UPDATE leave_requests
           SET attachment_review_status = $1,
               attachment_review_note = $2,
               attachment_reviewed_by = $3,
               attachment_reviewed_at = NOW(),
               attachment_resubmit_due_at = $4,
               attachment_replacement_requested_at = CASE WHEN $6::boolean THEN NOW() ELSE NULL END,
               attachment_reminder_sent_at = NULL
           WHERE id = $5`,
          [status, note || null, req.user.id, dueAt, id, action === 'request_replacement']
        )
        await tx.query(
          `INSERT INTO leave_attachment_review_events
             (leave_request_id, attachment_version, action, note, response_days, due_at,
              actor_user_id, actor_role, actor_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            id,
            Number(leave.attachment_version || 0),
            action,
            note || null,
            responseDays,
            dueAt,
            req.user.id,
            req.user.role,
            req.user.email,
          ]
        )
      })

      if (action === 'mark_valid') {
        await notifyEmployee(leave, {
          type: 'leave_document_valid',
          title: 'Leave Document Accepted',
          message: `Your document for ${leave.leave_type_name} was accepted.`,
          subject: `Leave Document Accepted: ${leave.leave_type_name}`,
          lines: [
            `Your supporting document for ${leave.leave_type_name} was reviewed and accepted.`,
          ],
        })
      } else {
        await notifyEmployee(leave, {
          type: 'leave_document_replacement',
          title: 'Replacement Document Required',
          message: `${note} Upload a replacement by ${dueAt.toLocaleString('en-PH')}.`,
          subject: `Replacement Document Required: ${leave.leave_type_name}`,
          lines: [
            `Your supporting document for ${leave.leave_type_name} needs to be replaced.`,
            `Reason: ${note}`,
            `Deadline: ${dueAt.toLocaleString('en-PH')}`,
          ],
        })
      }

      await addAuditLog(req.user.id, action, 'leave_requests', id)
      res.json(await loadLeave(id))
    })
  )

  router.post(
    '/api/leave-requests/:id/attachment-replacement',
    authRequired,
    uploadAttachment,
    asyncRoute(async (req, res) => {
      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ message: 'Invalid leave request id' })
      const leave = await loadLeave(id)
      if (!leave) return res.status(404).json({ message: 'Leave request not found' })
      if (Number(leave.employee_id) !== Number(req.user.employee_id)) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      if (leave.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending leave requests accept replacement documents' })
      }
      const leaveType = await resolveLeaveType(leave.leave_type_name)
      if (!requiresDocument(leaveType)) {
        return res.status(400).json({ message: 'This leave type does not require supporting documentation' })
      }
      if (!req.file) return res.status(400).json({ message: 'Choose a replacement document' })

      const attachmentData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
      const nextVersion = Number(leave.attachment_version || 0) + 1
      await db.transaction(async (tx) => {
        await tx.query(
          `UPDATE leave_requests
           SET attachment_name = $1, attachment_type = $2, attachment_data = $3,
               attachment_review_status = 'pending_review',
               attachment_review_note = NULL,
               attachment_reviewed_by = NULL,
               attachment_reviewed_at = NULL,
               attachment_resubmit_due_at = NULL,
               attachment_replacement_requested_at = NULL,
               attachment_reminder_sent_at = NULL,
               attachment_version = $4,
               attachment_uploaded_at = NOW()
           WHERE id = $5`,
          [req.file.originalname, req.file.mimetype, attachmentData, nextVersion, id]
        )
        await tx.query(
          `INSERT INTO leave_attachment_review_events
             (leave_request_id, attachment_version, action, actor_user_id, actor_role, actor_name)
           VALUES ($1,$2,'replacement_uploaded',$3,$4,$5)`,
          [id, nextVersion, req.user.id, req.user.role, req.user.email]
        )
      })

      await notifyRoles(MANAGEMENT_ROLES, {
        type: 'leave_document_uploaded',
        title: 'Replacement Leave Document Uploaded',
        message: `${leave.employee_name} uploaded a replacement document for ${leave.leave_type_name}.`,
        targetTable: 'leave_requests',
        targetId: id,
      })
      const { rows: management } = await db.query(
        `SELECT DISTINCT email FROM users
         WHERE role = ANY($1::text[]) AND email IS NOT NULL AND email <> ''`,
        [MANAGEMENT_ROLES]
      )
      for (const manager of management) {
        sendEmailNotification({
          to: manager.email,
          subject: `Replacement Leave Document: ${leave.employee_name}`,
          text: [
            `${leave.employee_name} uploaded a replacement document for ${leave.leave_type_name}.`,
            frontendOrigin ? `Review the request: ${frontendOrigin}/leave-approvals` : '',
          ].filter(Boolean).join('\n'),
        })
      }
      await addAuditLog(req.user.id, 'upload_leave_attachment_replacement', 'leave_requests', id)
      res.json(await loadLeave(id))
    })
  )

  router.use((error, req, res, next) => {
    console.error('Leave attachment workflow failed', error)
    if (res.headersSent) return next(error)
    return res.status(500).json({
      message: 'Unable to update the supporting document. Please try again.',
    })
  })

  return router
}

module.exports = { createLeaveAttachmentReviewRouter }
