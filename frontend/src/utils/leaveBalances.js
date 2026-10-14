import { isPaidLeaveEligible } from './leaveEligibility.js'

// Paid leave left for each employee and leave type in a year, by the same rule as My leave: the type's
// yearly paid days, less paid days already approved that year; none until the months of service are met.
export function leaveBalances({ employees = [], leaveTypes = [], requests = [], year, asOf }) {
  const types = leaveTypes.filter(type => Number(type.paid_days_per_year) > 0)
  const used = new Map()
  const pending = new Map()
  for (const request of requests) {
    if (String(request.start_date || '').slice(0, 4) !== String(year)) continue
    const key = `${request.employee_id}|${String(request.leave_type_name || '').toLowerCase()}`
    if (request.status === 'approved' && ['paid', 'partial_paid'].includes(String(request.leave_pay_type || '').toLowerCase())) {
      used.set(key, (used.get(key) || 0) + Number(request.credits_deducted || 0))
    } else if (request.status === 'pending') {
      pending.set(key, (pending.get(key) || 0) + Number(request.leave_days || 0))
    }
  }
  const rows = employees.map(employee => ({
    employeeId: employee.id,
    employeeCode: employee.employee_code,
    name: [employee.first_name, employee.last_name].filter(Boolean).join(' '),
    department: employee.department || '',
    balances: types.map(type => {
      const key = `${employee.id}|${String(type.name).toLowerCase()}`
      const total = Number(type.paid_days_per_year)
      const usedDays = Math.round((used.get(key) || 0) * 100) / 100
      return { typeId: type.id, total, used: usedDays, pending: pending.get(key) || 0,
        remaining: Math.max(0, Math.round((total - usedDays) * 100) / 100),
        eligible: isPaidLeaveEligible(employee.date_hired, asOf, type.min_months_employed || 0) }
    }),
  }))
  return { types, rows }
}
