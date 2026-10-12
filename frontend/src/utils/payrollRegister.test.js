import test from 'node:test'
import assert from 'node:assert/strict'
import { payAmounts } from './payrollRegister.js'

test('register totals separate employee deductions from employer costs and preserve signed corrections', () => {
  const line = { gross_salary: '7500', cola_pay: '500', absence_deduction: '600', late_deduction: '50', undertime_deduction: '25',
    employee_sss: '750', employee_philhealth: '375', employee_pagibig: '200', employer_sss: '1500', employer_ec: '30',
    net_pay: '6700', details: { automaticEarnings: [{type:'overtime',amount:400},{type:'night_differential',amount:100}],
      manualEarnings: [{type:'night_differential',amount:200}], charges: [{type:'other_non_taxable_earning',amount:300},
        {type:'basic_pay_adjustment',amount:-100},{type:'cash_advance',amount:100}] } }
  const result = payAmounts(line)
  assert.equal(result.earnings, 8900)
  assert.equal(result.deductions, 2200)
  assert.equal(result.earnings-result.deductions,result.net)
  assert.equal(result.extra,600)
})
