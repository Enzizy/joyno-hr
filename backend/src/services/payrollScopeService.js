function dayShiftOnly() {
  return process.env.PAYROLL_DAY_SHIFT_ONLY === 'true'
}

function isNightPayrollEmployee(employee, profiles = []) {
  if (String(employee.shift || '').toLowerCase() === 'night') return true
  const overnight = profile => profile.work_start_time && profile.work_end_time &&
    String(profile.work_end_time).slice(0, 5) < String(profile.work_start_time).slice(0, 5)
  return Boolean(overnight(employee) || profiles.some(profile =>
    Number(profile.employee_id) === Number(employee.employee_id ?? employee.id) && overnight(profile)))
}

function payrollEmployeeIncluded(employee, profiles = [], restrictToDay = dayShiftOnly()) {
  // The CEO pays the payroll and is not paid through it.
  if (employee.is_ceo === true) return false
  const scope = typeof restrictToDay === 'boolean' ? (restrictToDay ? 'day' : 'all') : normalizePayrollScope(restrictToDay)
  const night = isNightPayrollEmployee(employee, profiles)
  return scope === 'all' || (scope === 'night' ? night : !night)
}

function normalizePayrollScope(value) {
  if (value === undefined || value === null || value === '') return dayShiftOnly() ? 'day' : 'all'
  if (!['day', 'night', 'all'].includes(value)) throw new RangeError('Choose Day or Night shift')
  return value
}

async function attendancePayrollScope(db, batchId) {
  const row = (await db.query(`SELECT current_value->>'payrollScope' AS payroll_scope FROM payroll_attendance_review_events
    WHERE batch_id=$1 AND current_value ? 'payrollScope' ORDER BY id DESC LIMIT 1`, [batchId])).rows[0]
  return row?.payroll_scope || 'all'
}

async function attendanceReviewSettings(db, batchId) {
  const row = (await db.query(`SELECT current_value FROM payroll_attendance_review_events
    WHERE batch_id=$1 AND current_value ? 'payrollScope' ORDER BY id DESC LIMIT 1`, [batchId])).rows[0]
  return row?.current_value || { payrollScope: 'all' }
}

function assertPracticeAllowed(isTest) {
  if (isTest && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw Object.assign(new Error('Practice payroll is available only in the local test app'), { statusCode: 403 })
  }
}

function canFinalizePayroll(run) {
  if (run.rule_snapshot?.isTest === true) { assertPracticeAllowed(true); return true }
  return process.env.PAYROLL_FINALIZATION_ENABLED === 'true'
}

module.exports = { dayShiftOnly, isNightPayrollEmployee, payrollEmployeeIncluded, normalizePayrollScope, attendancePayrollScope, attendanceReviewSettings, assertPracticeAllowed, canFinalizePayroll }
