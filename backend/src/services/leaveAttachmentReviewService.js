const { getPhilippineHolidays } = require('./philippineHolidayService')

const REVIEW_STATUSES = {
  NOT_REQUIRED: 'not_required',
  MISSING: 'missing',
  PENDING: 'pending_review',
  REPLACEMENT_REQUIRED: 'replacement_required',
  VALID: 'valid',
  DEADLINE_MISSED: 'deadline_missed',
}

function requiresDocument(leaveType) {
  return Boolean(leaveType?.requires_attachment_for_paid)
}

function initialReviewStatus(leaveType, hasAttachment, offlineDocumentReceived = false) {
  if (!requiresDocument(leaveType)) return REVIEW_STATUSES.NOT_REQUIRED
  if (offlineDocumentReceived) return REVIEW_STATUSES.VALID
  return hasAttachment ? REVIEW_STATUSES.PENDING : REVIEW_STATUSES.MISSING
}

function approvalDocumentDecision(leaveType, leaveRequest, input = {}) {
  if (!requiresDocument(leaveType)) return { allowed: true, forceUnpaid: false }

  const status = leaveRequest.attachment_review_status || initialReviewStatus(
    leaveType,
    Boolean(leaveRequest.attachment_data),
    Boolean(leaveRequest.offline_document_received)
  )
  if (status === REVIEW_STATUSES.VALID) return { allowed: true, forceUnpaid: false }

  if ([REVIEW_STATUSES.MISSING, REVIEW_STATUSES.DEADLINE_MISSED].includes(status)) {
    if (input.approval_mode === 'unpaid' && input.confirm_unpaid === true) {
      return { allowed: true, forceUnpaid: true }
    }
    return {
      allowed: false,
      code: 'DOCUMENT_UNPAID_CONFIRMATION_REQUIRED',
      status,
      message: 'A valid supporting document is unavailable. Confirm approval as unpaid leave.',
    }
  }

  const messages = {
    [REVIEW_STATUSES.PENDING]: 'The supporting document must be reviewed before this leave can be approved.',
    [REVIEW_STATUSES.REPLACEMENT_REQUIRED]: 'The employee still has an active document replacement request.',
  }
  return {
    allowed: false,
    code: 'DOCUMENT_REVIEW_REQUIRED',
    status,
    message: messages[status] || 'Supporting document review is required before approval.',
  }
}

async function calculateBusinessDayDeadline(db, responseDays, now = new Date()) {
  const philippineDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const toPhilippineISO = (date) => {
    const parts = Object.fromEntries(
      philippineDateFormatter.formatToParts(date).map((part) => [part.type, part.value])
    )
    return `${parts.year}-${parts.month}-${parts.day}`
  }
  const days = responseDays === 1 ? 1 : 2
  const [year, month, day] = toPhilippineISO(now).split('-').map(Number)
  const cursor = new Date(Date.UTC(year, month - 1, day))
  const lookupEnd = new Date(cursor)
  lookupEnd.setUTCDate(lookupEnd.getUTCDate() + 14)
  const holidays = await getPhilippineHolidays(
    db,
    cursor.toISOString().slice(0, 10),
    lookupEnd.toISOString().slice(0, 10)
  )
  const nonWorking = new Set(
    holidays.filter((holiday) => !holiday.is_working_day).map((holiday) => holiday.holiday_date)
  )
  let remaining = days
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const iso = cursor.toISOString().slice(0, 10)
    if (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6 || nonWorking.has(iso)) continue
    remaining -= 1
  }
  return new Date(`${cursor.toISOString().slice(0, 10)}T23:59:59+08:00`)
}

function unpaidCompensation(leaveRequest) {
  const leaveDays = Number(leaveRequest.leave_days || 0)
  return {
    leavePayType: 'unpaid',
    leaveDays,
    paidDays: 0,
    unpaidDays: leaveDays,
    creditsDeducted: 0,
    note: 'Approved as unpaid because no valid supporting document was available.',
  }
}

async function expireAttachmentDeadlines(db) {
  const { rows } = await db.query(
    `UPDATE leave_requests
     SET attachment_review_status = 'deadline_missed',
         leave_pay_type = 'unpaid',
         paid_days = 0,
         unpaid_days = leave_days,
         credits_deducted = 0,
         attachment_reviewed_at = NOW()
     WHERE status = 'pending'
       AND attachment_review_status = 'replacement_required'
       AND attachment_resubmit_due_at IS NOT NULL
       AND attachment_resubmit_due_at < NOW()
     RETURNING id, employee_id, employee_name, leave_type_name, attachment_resubmit_due_at`
  )
  for (const leave of rows) {
    await db.query(
      `INSERT INTO leave_attachment_review_events
         (leave_request_id, action, due_at, actor_role, actor_name)
       VALUES ($1,'deadline_missed',$2,'system','Joyno HR')`,
      [leave.id, leave.attachment_resubmit_due_at]
    )
  }
  return rows
}

async function claimAttachmentDeadlineReminders(db) {
  const { rows } = await db.query(
    `UPDATE leave_requests
     SET attachment_reminder_sent_at = NOW()
     WHERE id IN (
       SELECT id FROM leave_requests
       WHERE status = 'pending'
         AND attachment_review_status = 'replacement_required'
         AND attachment_resubmit_due_at > NOW()
         AND attachment_resubmit_due_at <= NOW() + INTERVAL '24 hours'
         AND attachment_reminder_sent_at IS NULL
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, employee_id, employee_name, leave_type_name, attachment_resubmit_due_at`
  )
  return rows
}

module.exports = {
  REVIEW_STATUSES,
  approvalDocumentDecision,
  calculateBusinessDayDeadline,
  claimAttachmentDeadlineReminders,
  expireAttachmentDeadlines,
  initialReviewStatus,
  requiresDocument,
  unpaidCompensation,
}
