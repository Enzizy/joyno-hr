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
  resolveLeaveCompensation,
}) {
  const selectedLeaveType = await resolveLeaveType(entry.leave_type_name)
  if (!selectedLeaveType || selectedLeaveType.is_active === false || selectedLeaveType.id === 'awol') {
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
      entry.start_date
    )
    const compensation = await resolveLeaveCompensation(
      employee,
      effectiveLeaveType,
      entry.start_date,
      entry.end_date,
      entry.supporting_document_received,
      tx,
      {dayFraction:entry.day_fraction ?? 1}
    )
    if (!compensation) {
      throw httpError(400, 'The selected range has no chargeable working days')
    }
    if (Number(entry.day_fraction ?? 1) < 1) {
      const {paidOverlap}=require('./attendanceReviewService')
      const profile=(await tx.query(`SELECT * FROM payroll_employee_profiles WHERE employee_id=$1 AND effective_from <= $2
        AND COALESCE(effective_to,'infinity'::date) >= $2 ORDER BY effective_from DESC LIMIT 1`,[employee.id,entry.start_date])).rows[0]
      const toMinutes=t=>Number(t.split(':')[0])*60+Number(t.split(':')[1])
      const covered=paidOverlap(toMinutes(entry.coverage_start),toMinutes(entry.coverage_end),profile || {})
      if (Math.abs(covered-Number(entry.day_fraction)*480)>0.01) throw httpError(400,'Half-day leave must cover four scheduled paid hours, excluding the unpaid break')
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
        attachment_review_status, attachment_reviewed_by, attachment_reviewed_at,day_fraction,coverage_start,coverage_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9,$10,$11,NOW(),$12,$13,$14,$15,$16,$17,$18::integer,$19,$20,
               CASE WHEN $21::boolean THEN $22::integer ELSE NULL::integer END,
               CASE WHEN $21::boolean THEN NOW() ELSE NULL END,$23,$24,$25)
       RETURNING id`,
      [
        employee.id,
        employee.employee_code,
        employeeName,
        // leave_type_id is a legacy integer column; current policy IDs are strings.
        null,
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
        Number(entry.day_fraction ?? 1),entry.coverage_start || null,entry.coverage_end || null,
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
