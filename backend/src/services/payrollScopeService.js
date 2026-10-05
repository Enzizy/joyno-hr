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
  return !restrictToDay || !isNightPayrollEmployee(employee, profiles)
}

module.exports = { dayShiftOnly, isNightPayrollEmployee, payrollEmployeeIncluded }
