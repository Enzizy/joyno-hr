const test = require('node:test')
const assert = require('node:assert/strict')
const { buildEmployeeLeaveBalanceBreakdown } = require('./services/employeeLeaveBalanceService')

const policies = [
  { id: 'vacation_leave', name: 'Vacation Leave', paid_days_per_year: 3, min_months_employed: 6 },
  { id: 'sick_leave', name: 'Sick Leave', paid_days_per_year: 5, min_months_employed: 12 },
  { id: 'leave_of_absence', name: 'Leave of Absence', paid_days_per_year: 0, min_months_employed: 0 },
]

test('builds per-type remaining balances and preserves the shared credit pool', () => {
  const result = buildEmployeeLeaveBalanceBreakdown(
    { date_hired: '2024-01-17', leave_credits: 8, leave_credits_entitlement: 15 },
    policies,
    [
      { leave_type_name: 'Vacation Leave', used_days: '1' },
      { leave_type_name: 'Sick Leave', used_days: '2' },
    ],
    2026,
    new Date('2026-08-11T00:00:00Z')
  )

  assert.equal(result.available_credit_pool, 8)
  assert.equal(result.credit_pool_entitlement, 15)
  assert.deepEqual(result.balances.map(({ id, used, remaining, eligible }) => ({ id, used, remaining, eligible })), [
    { id: 'vacation_leave', used: 1, remaining: 2, eligible: true },
    { id: 'sick_leave', used: 2, remaining: 3, eligible: true },
  ])
})

test('marks future entitlements ineligible without removing their annual allowance', () => {
  const result = buildEmployeeLeaveBalanceBreakdown(
    { date_hired: '2026-04-15', leave_credits: 0, leave_credits_entitlement: 0 },
    policies,
    [],
    2026,
    new Date('2026-08-11T00:00:00Z')
  )

  assert.equal(result.balances[0].eligible, false)
  assert.equal(result.balances[0].annual_allowance, 3)
  assert.equal(result.balances[0].remaining, 3)
})
