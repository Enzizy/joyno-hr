const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveLeaveCompensation } = require('./services/leaveCompensationService')

const sick = { name: 'Sick Leave', paid_days_per_year: 5, min_months_employed: 3, requires_attachment_for_paid: true }
const vacation = { name: 'Vacation Leave', paid_days_per_year: 3, min_months_employed: 3 }
const sil = { name: 'Service Incentive Leave', paid_days_per_year: 5, min_months_employed: 12 }

function database(used = 0) {
  return { async query(sql) { return { rows: sql.includes('philippine_holidays') ? [] : [{ used_days: used }] } } }
}

test('sick and vacation become paid on the three-month eligibility date', async () => {
  const employee = { id: 1, date_hired: '2026-01-15', leave_credits: 0 }
  for (const policy of [sick, vacation]) {
    const result = await resolveLeaveCompensation(employee, policy, '2026-04-15', '2026-04-15', true, database())
    assert.equal(result.paidDays, 1)
    assert.equal(result.creditsDeducted, 1)
  }
  const before = await resolveLeaveCompensation(employee, sick, '2026-04-14', '2026-04-14', true, database())
  assert.equal(before.paidDays, 0)
})

test('SIL requires one full year of service', async () => {
  const employee = { id: 1, date_hired: '2025-04-15' }
  const before = await resolveLeaveCompensation(employee, sil, '2026-04-14', '2026-04-14', false, database())
  const eligible = await resolveLeaveCompensation(employee, sil, '2026-04-15', '2026-04-15', false, database())
  assert.equal(before.paidDays, 0)
  assert.equal(eligible.paidDays, 1)
})

test('only the selected type limits paid days, including partial and exhausted allowances', async () => {
  const employee = { id: 1, date_hired: '2024-01-01', leave_credits: 0 }
  const partial = await resolveLeaveCompensation(employee, sick, '2026-04-13', '2026-04-15', true, database(4))
  assert.equal(partial.leavePayType, 'partial_paid')
  assert.equal(partial.paidDays, 1)
  assert.equal(partial.unpaidDays, 2)
  const exhausted = await resolveLeaveCompensation(employee, vacation, '2026-04-13', '2026-04-13', false, database(3))
  assert.equal(exhausted.paidDays, 0)
})

test('sick leave still requires a medical document for paid treatment', async () => {
  const result = await resolveLeaveCompensation({ id: 1, date_hired: '2024-01-01' }, sick, '2026-04-13', '2026-04-13', false, database())
  assert.equal(result.leavePayType, 'unpaid')
  assert.equal(result.creditsDeducted, 0)
})
