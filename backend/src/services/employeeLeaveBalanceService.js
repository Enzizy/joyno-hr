function asNonNegativeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function isEligible(dateHired, asOf, minimumMonths) {
  if (!dateHired) return false
  const hired = new Date(dateHired)
  const eligibilityDate = new Date(hired)
  const referenceDate = new Date(asOf)
  if (Number.isNaN(hired.getTime()) || Number.isNaN(referenceDate.getTime())) return false
  eligibilityDate.setMonth(eligibilityDate.getMonth() + asNonNegativeNumber(minimumMonths))
  return referenceDate >= eligibilityDate
}

function buildEmployeeLeaveBalanceBreakdown(employee, policies, usageRows, year, asOf = new Date()) {
  const usageByType = new Map(
    usageRows.map((row) => [String(row.leave_type_name || '').trim().toLowerCase(), asNonNegativeNumber(row.used_days)])
  )

  const balances = policies
    .filter((policy) => asNonNegativeNumber(policy.paid_days_per_year) > 0)
    .map((policy) => {
      const allowance = asNonNegativeNumber(policy.paid_days_per_year)
      const used = usageByType.get(String(policy.name || '').trim().toLowerCase()) || 0
      const eligible = isEligible(employee.date_hired, asOf, policy.min_months_employed)
      return {
        id: policy.id,
        name: policy.name,
        annual_allowance: allowance,
        used,
        remaining: Math.max(0, allowance - used),
        eligible,
        min_months_employed: asNonNegativeNumber(policy.min_months_employed),
      }
    })

  return {
    year: Number(year),
    available_credit_pool: asNonNegativeNumber(employee.leave_credits),
    credit_pool_entitlement: asNonNegativeNumber(employee.leave_credits_entitlement),
    balances,
  }
}

async function getEmployeeLeaveBalanceBreakdown(queryDb, employee, policies, options = {}) {
  const year = Number(options.year || new Date().getFullYear())
  const asOf = options.asOf || new Date()
  const { rows } = await queryDb.query(
    `SELECT leave_type_name, COALESCE(SUM(credits_deducted), 0)::numeric AS used_days
     FROM leave_requests
     WHERE employee_id = $1
       AND status = 'approved'
       AND leave_pay_type IN ('paid', 'partial_paid')
       AND EXTRACT(YEAR FROM start_date) = $2::int
     GROUP BY leave_type_name`,
    [employee.id, year]
  )
  return buildEmployeeLeaveBalanceBreakdown(employee, policies, rows, year, asOf)
}

module.exports = {
  buildEmployeeLeaveBalanceBreakdown,
  getEmployeeLeaveBalanceBreakdown,
}
