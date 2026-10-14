import test from 'node:test'
import assert from 'node:assert/strict'
import { leaveBalances } from './leaveBalances.js'

test('leave balances subtract approved paid days in the year and respect months of service', () => {
  const { types, rows } = leaveBalances({
    year: 2026, asOf: '2026-10-14',
    employees: [{ id: 1, first_name: 'Ana', last_name: 'Cruz', date_hired: '2025-01-10' }, { id: 2, first_name: 'Ben', date_hired: '2026-09-01' }],
    leaveTypes: [{ id: 'vl', name: 'Vacation Leave', paid_days_per_year: 3, min_months_employed: 3 }, { id: 'loa', name: 'Leave of Absence', paid_days_per_year: 0 }],
    requests: [
      { employee_id: 1, leave_type_name: 'Vacation Leave', status: 'approved', leave_pay_type: 'paid', credits_deducted: 2, start_date: '2026-03-02' },
      { employee_id: 1, leave_type_name: 'Vacation Leave', status: 'approved', leave_pay_type: 'paid', credits_deducted: 1, start_date: '2025-12-01' },
      { employee_id: 1, leave_type_name: 'Vacation Leave', status: 'pending', leave_days: 1, start_date: '2026-11-02' },
      { employee_id: 1, leave_type_name: 'Vacation Leave', status: 'approved', leave_pay_type: 'unpaid', credits_deducted: 0, start_date: '2026-05-02' },
    ],
  })
  assert.deepEqual(types.map(type => type.id), ['vl'])
  assert.deepEqual(rows[0].balances[0], { typeId: 'vl', total: 3, used: 2, pending: 1, remaining: 1, eligible: true })
  assert.equal(rows[1].balances[0].eligible, false)
  assert.equal(rows[1].name, 'Ben')
})
