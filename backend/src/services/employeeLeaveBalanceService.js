function asNonNegativeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

const { currentManilaDate, isPaidLeaveEligible } = require('./leaveEligibilityService')

function buildEmployeeLeaveBalanceBreakdown(employee, policies, usageRows, year, asOf = currentManilaDate()) {
  const usageByType = new Map(
    usageRows.map((row) => [String(row.leave_type_name || '').trim().toLowerCase(), asNonNegativeNumber(row.used_days)])
  )

  const balances = policies
    .filter((policy) => policy.is_active !== false && asNonNegativeNumber(policy.paid_days_per_year) > 0)
    .map((policy) => {
      const allowance = asNonNegativeNumber(policy.paid_days_per_year)
      const used = usageByType.get(String(policy.name || '').trim().toLowerCase()) || 0
      const eligible = isPaidLeaveEligible(employee.date_hired, asOf, policy.min_months_employed)
      return {
        id: policy.id,
        name: policy.name,
        annual_allowance: allowance,
        used,
        remaining: Math.max(0, allowance - used),
        eligible,
        min_months_employed: asNonNegativeNumber(policy.min_months_employed),
        cash_convertible: Boolean(policy.cash_convertible),
      }
    })

  return {
    year: Number(year),
    available_credit_pool: balances.filter((item) => item.eligible).reduce((total, item) => total + item.remaining, 0),
    credit_pool_entitlement: balances.filter((item) => item.eligible).reduce((total, item) => total + item.annual_allowance, 0),
    balances,
  }
}

async function getEmployeeLeaveBalanceBreakdown(queryDb, employee, policies, options = {}) {
  const asOf = options.asOf || currentManilaDate()
  const year = Number(options.year || (asOf instanceof Date ? asOf.getFullYear() : String(asOf).slice(0, 4)))
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

// The stored total is a summary only. Each active leave type keeps its own allowance.
async function refreshEmployeeLeaveCredits(queryDb, employeeId = null, asOf = currentManilaDate()) {
  const year = Number(asOf.slice(0, 4))
  const { rows } = await queryDb.query(
    `WITH credit_totals AS (
       SELECT e.id,
         COALESCE(SUM(p.paid_days_per_year), 0) AS entitlement,
         COALESCE(SUM(GREATEST(0, p.paid_days_per_year - COALESCE(usage.used, 0))), 0) AS remaining
       FROM employees e
       LEFT JOIN leave_policies p ON p.is_active = TRUE AND p.is_employee_requestable = TRUE
         AND p.paid_days_per_year > 0
         AND e.date_hired + make_interval(months => p.min_months_employed) <= $1::date
       LEFT JOIN LATERAL (
         SELECT SUM(credits_deducted) AS used FROM leave_requests lr
         WHERE lr.employee_id = e.id AND LOWER(lr.leave_type_name) = LOWER(p.name)
           AND lr.status = 'approved' AND lr.leave_pay_type IN ('paid', 'partial_paid')
           AND EXTRACT(YEAR FROM lr.start_date) = $2::int
       ) usage ON TRUE
       WHERE ($3::int IS NULL OR e.id = $3::int)
       GROUP BY e.id
     )
     UPDATE employees e
     SET leave_credits = t.remaining, leave_credits_entitlement = t.entitlement,
         leave_credits_reset_year = $2, updated_at = NOW()
     FROM credit_totals t WHERE e.id = t.id
       AND (e.leave_credits, e.leave_credits_entitlement, e.leave_credits_reset_year)
           IS DISTINCT FROM (t.remaining, t.entitlement, $2::int)
     RETURNING e.id`,
    [asOf, year, employeeId]
  )
  return rows
}

module.exports = {
  buildEmployeeLeaveBalanceBreakdown,
  getEmployeeLeaveBalanceBreakdown,
  refreshEmployeeLeaveCredits,
}
