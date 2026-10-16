// HR and admin correct a recorded leave's dates (and, if needed, its type), for example leave plotted on the
// wrong days. The leave's credits are given back, pay and credits are worked out again for the new dates as if
// it were recorded fresh, and the new credits are taken. Dates covered by approved or released payroll stay fixed.

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const dateText = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10)

async function rescheduleLeave({ db, id, input = {}, user, employeeColumns, resolveLeaveType, resolveEffectiveLeaveType, resolveLeaveCompensation }) {
  const startDate = String(input.start_date || '')
  const endDate = String(input.end_date || '')
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) throw httpError(400, 'Choose a valid start and end date')

  return db.transaction(async (tx) => {
    const leave = (await tx.query('SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE', [id])).rows[0]
    if (!leave) throw httpError(404, 'Leave not found')
    if (!['approved', 'pending'].includes(leave.status)) throw httpError(409, 'Only pending or approved leave can be moved')

    const before = { start_date: dateText(leave.start_date), end_date: dateText(leave.end_date) }
    const typeName = String(input.leave_type_name || leave.leave_type_name)
    if (before.start_date === startDate && before.end_date === endDate && typeName === leave.leave_type_name) {
      throw httpError(400, 'Nothing changed')
    }

    // Pay for both the old and the new dates may already be final.
    const finalized = (await tx.query(`SELECT payday::text, status FROM payroll_runs
      WHERE status IN ('approved', 'locked') AND COALESCE(rule_snapshot->>'isTest', 'false') <> 'true'
        AND ((period_start <= $2 AND period_end >= $1) OR (period_start <= $4 AND period_end >= $3))
      ORDER BY payday LIMIT 1`, [before.start_date, before.end_date, startDate, endDate])).rows[0]
    if (finalized) {
      throw httpError(409, `The ${finalized.payday} payroll covering these dates is ${finalized.status === 'locked' ? 'already released' : 'approved'}. ${finalized.status === 'locked' ? 'Correct it with an adjustment on a later payroll instead' : 'Undo its approval first, then move the leave'}`)
    }

    const overlap = (await tx.query(`SELECT id FROM leave_requests WHERE employee_id = $1 AND id <> $2 AND status IN ('pending', 'approved')
      AND start_date <= $3 AND end_date >= $4 LIMIT 1`, [leave.employee_id, id, endDate, startDate])).rows[0]
    if (overlap) throw httpError(409, 'The employee already has another leave on these dates')

    const selectedType = await resolveLeaveType(typeName)
    if (!selectedType || selectedType.is_active === false) throw httpError(400, 'Invalid leave type')

    // Give the old credits back before working out the new ones.
    const approved = leave.status === 'approved'
    const oldCredits = approved ? Number(leave.credits_deducted || 0) : 0
    if (oldCredits > 0) await tx.query('UPDATE employees SET leave_credits = leave_credits + $1, updated_at = NOW() WHERE id = $2', [oldCredits, leave.employee_id])
    const employee = (await tx.query(`SELECT ${employeeColumns} FROM employees WHERE id = $1 FOR UPDATE`, [leave.employee_id])).rows[0]
    if (!employee) throw httpError(404, 'Employee not found')

    const leaveType = selectedType.id === 'awol' ? selectedType : await resolveEffectiveLeaveType(selectedType, employee.date_hired, startDate)
    const hasDocument = Boolean(leave.offline_document_received || leave.attachment_data)
    let compensation
    try {
      compensation = await resolveLeaveCompensation(employee, leaveType, startDate, endDate, hasDocument, tx,
        { dayFraction: Number(leave.day_fraction ?? 1), excludeRequestId: id })
    } catch (error) {
      if (error instanceof TypeError) throw httpError(400, 'A half-day leave stays on a single date')
      throw error
    }
    if (!compensation) throw httpError(400, 'The new dates have no working days to charge')

    await tx.query(`UPDATE leave_requests SET start_date = $1, end_date = $2, leave_type_name = $3, leave_pay_type = $4,
      leave_days = $5, paid_days = $6, unpaid_days = $7, credits_deducted = $8 WHERE id = $9`,
    [startDate, endDate, leaveType.name, compensation.leavePayType, compensation.leaveDays, compensation.paidDays,
      compensation.unpaidDays, approved ? compensation.creditsDeducted : leave.credits_deducted, id])
    if (approved && Number(compensation.creditsDeducted || 0) > 0) {
      await tx.query('UPDATE employees SET leave_credits = GREATEST(0, leave_credits - $1), updated_at = NOW() WHERE id = $2',
        [compensation.creditsDeducted, leave.employee_id])
    }

    return {
      leave, compensation, employee,
      before: { ...before, leave_type_name: leave.leave_type_name, paid_days: leave.paid_days, unpaid_days: leave.unpaid_days },
      after: { start_date: startDate, end_date: endDate, leave_type_name: leaveType.name, paid_days: compensation.paidDays, unpaid_days: compensation.unpaidDays },
    }
  })
}

module.exports = { rescheduleLeave }
