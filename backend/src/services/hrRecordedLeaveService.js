const { initialReviewStatus } = require('./leaveAttachmentReviewService')

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

async function createHrRecordedLeave({
  db,
  entry,
  user,
  employeeColumns,
  resolveLeaveType,
  resolveEffectiveLeaveType,
  calculateTenureMonths,
  resolveLeaveCompensation,
}) {
  const selectedLeaveType = await resolveLeaveType(entry.leave_type_name)
  if (!selectedLeaveType || selectedLeaveType.id === 'awol') {
    throw httpError(400, 'Invalid leave type')
  }

  return db.transaction(async (tx) => {
    const employeeResult = await tx.query(
      `SELECT ${employeeColumns} FROM employees WHERE id = $1 FOR UPDATE`,
      [entry.employee_id]
    )
    const employee = employeeResult.rows[0]
    if (!employee) throw httpError(404, 'Employee not found')

    const overlapResult = await tx.query(
      `SELECT id FROM leave_requests
       WHERE employee_id = $1
         AND status IN ('pending', 'approved')
         AND start_date <= $2
         AND end_date >= $3
       LIMIT 1`,
      [entry.employee_id, entry.end_date, entry.start_date]
    )
    if (overlapResult.rows.length) {
      throw httpError(400, 'The employee already has a pending or approved leave in this date range')
    }

    const effectiveLeaveType = await resolveEffectiveLeaveType(
      selectedLeaveType,
      employee.date_hired,
      new Date(`${entry.start_date}T00:00:00`),
      calculateTenureMonths
    )
    const compensation = await resolveLeaveCompensation(
      employee,
      effectiveLeaveType,
      entry.start_date,
      entry.end_date,
      entry.supporting_document_received,
      tx
    )
    if (!compensation) {
      throw httpError(400, 'The selected range has no chargeable working days')
    }

    const employeeName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
    const source = user.role === 'hr' ? 'hr_recorded' : 'admin_recorded'
    const reason = entry.description
      || `Official leave recorded directly by ${String(user.role || 'management').toUpperCase()}.`
    const attachmentReviewStatus = initialReviewStatus(
      effectiveLeaveType,
      false,
      entry.supporting_document_received
    )
    const insertResult = await tx.query(
      `INSERT INTO leave_requests
       (employee_id, employee_code, employee_name, leave_type_id, leave_type_name, start_date, end_date,
        reason, status, approved_by, approved_by_name, approved_by_role, decided_at,
        leave_pay_type, leave_days, paid_days, unpaid_days, credits_deducted,
        submission_source, entered_by, offline_document_received,
        attachment_review_status, attachment_reviewed_by, attachment_reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9,$10,$11,NOW(),$12,$13,$14,$15,$16,$17,$18::integer,$19,$20,
               CASE WHEN $21::boolean THEN $22::integer ELSE NULL::integer END,
               CASE WHEN $21::boolean THEN NOW() ELSE NULL END)
       RETURNING id`,
      [
        employee.id,
        employee.employee_code,
        employeeName,
        effectiveLeaveType.id,
        effectiveLeaveType.name,
        entry.start_date,
        entry.end_date,
        reason,
        user.id,
        user.email,
        user.role,
        compensation.leavePayType,
        compensation.leaveDays,
        compensation.paidDays,
        compensation.unpaidDays,
        compensation.creditsDeducted,
        source,
        user.id,
        entry.supporting_document_received,
        attachmentReviewStatus,
        attachmentReviewStatus === 'valid',
        user.id,
      ]
    )
    const id = insertResult.rows[0]?.id

    if (Number(compensation.creditsDeducted || 0) > 0) {
      await tx.query(
        `UPDATE employees
         SET leave_credits = GREATEST(0, leave_credits - $1), updated_at = NOW()
         WHERE id = $2`,
        [compensation.creditsDeducted, employee.id]
      )
    }

    return {
      id,
      employee,
      leaveType: effectiveLeaveType,
      compensation,
      reason,
      source,
    }
  })
}

module.exports = { createHrRecordedLeave }
