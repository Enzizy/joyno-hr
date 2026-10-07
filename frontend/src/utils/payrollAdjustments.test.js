import test from 'node:test'
import assert from 'node:assert/strict'
import { adjustmentLabel, lineAdjustments } from './payrollAdjustments.js'

test('adjustments are listed signed: deductions negative, additions and corrections as stored', () => {
  const line = { details: {
    charges: [{ type: 'cash_advance', amount: 1000 }, { type: 'other_non_taxable_earning', amount: 500 }, { type: 'basic_pay_adjustment', amount: -250 }],
    manualEarnings: [{ type: 'other', amount: 300, note: 'Referral bonus' }],
  } }
  assert.deepEqual(lineAdjustments(line).map(entry => [entry.label, entry.amount]), [
    ['Cash advance', -1000], ['Allowance or reimbursement (non-taxable)', 500], ['Basic pay correction', -250], ['Other earning', 300],
  ])
  assert.deepEqual(lineAdjustments({}), [])
  assert.equal(adjustmentLabel('pagibig_mpl'), 'Pag-IBIG MPL')
})
