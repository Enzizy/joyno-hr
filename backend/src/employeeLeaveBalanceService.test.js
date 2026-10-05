const test = require('node:test')
const assert = require('node:assert/strict')
const { buildEmployeeLeaveBalanceBreakdown } = require('./services/employeeLeaveBalanceService')

const policies = [
  { id: 'vacation_leave', name: 'Vacation Leave', paid_days_per_year: 3, min_months_employed: 3 },
  { id: 'sick_leave', name: 'Sick Leave', paid_days_per_year: 5, min_months_employed: 3 },
  { id: 'leave_of_absence', name: 'Leave of Absence', paid_days_per_year: 0, min_months_employed: 0 },
]

test('builds independent balances and derives the total from remaining allowances', () => {
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

  assert.equal(result.available_credit_pool, 5)
  assert.equal(result.credit_pool_entitlement, 8)
  assert.deepEqual(result.balances.map(({ id, used, remaining, eligible }) => ({ id, used, remaining, eligible })), [
    { id: 'vacation_leave', used: 1, remaining: 2, eligible: true },
    { id: 'sick_leave', used: 2, remaining: 3, eligible: true },
  ])
})

test('marks future entitlements ineligible without removing their annual allowance', () => {
  const result = buildEmployeeLeaveBalanceBreakdown(
    { date_hired: '2026-06-15', leave_credits: 0, leave_credits_entitlement: 0 },
    policies,
    [],
    2026,
    new Date('2026-08-11T00:00:00Z')
  )

  assert.equal(result.balances[0].eligible, false)
  assert.equal(result.balances[0].annual_allowance, 3)
  assert.equal(result.balances[0].remaining, 3)
})

const currentPolicies = [
  ...policies,
  { id: 'service_incentive_leave', name: 'Service Incentive Leave', paid_days_per_year: 5, min_months_employed: 12, cash_convertible: true },
  { id: 'bereavement_leave', name: 'Bereavement Leave', paid_days_per_year: 2, min_months_employed: 12, is_active: false },
]

for (const [asOf, expected] of [['2026-04-14', 0], ['2026-04-15', 8], ['2027-01-14', 8], ['2027-01-15', 13]]) {
  test(`independent annual entitlement is ${expected} days on ${asOf}`, () => {
    const result = buildEmployeeLeaveBalanceBreakdown({ date_hired: '2026-01-15', leave_credits: 15 }, currentPolicies, [], Number(asOf.slice(0, 4)), asOf)
    assert.equal(result.credit_pool_entitlement, expected)
    assert.equal(result.available_credit_pool, expected)
    assert.ok(!result.balances.some((item) => item.id === 'bereavement_leave'))
  })
}

test('overused sick leave and historical bereavement cannot consume vacation or SIL', () => {
  const result = buildEmployeeLeaveBalanceBreakdown({ date_hired: '2024-01-01', leave_credits: 0 }, currentPolicies,
    [{ leave_type_name: 'Sick Leave', used_days: 9 }, { leave_type_name: 'Bereavement Leave', used_days: 2 }], 2026, '2026-10-02')
  assert.equal(result.available_credit_pool, 8)
  assert.equal(result.credit_pool_entitlement, 13)
  assert.equal(result.balances.find((item) => item.id === 'vacation_leave').remaining, 3)
  assert.equal(result.balances.find((item) => item.id === 'service_incentive_leave').remaining, 5)
})
