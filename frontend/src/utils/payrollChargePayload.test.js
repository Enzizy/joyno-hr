import test from 'node:test'
import assert from 'node:assert/strict'
import { payChargePayload } from './payrollAdjustments.js'

test('cash advance and loan deductions use the API positive-amount contract while basic corrections remain signed', () => {
  for(const type of ['cash_advance','sss_salary_loan','sss_calamity_loan','pagibig_mpl','pagibig_calamity','pagibig_mp2','tax_withholding','other_charge']) {
    assert.deepEqual(payChargePayload({type,amount:200,key:1,source:'charge',note:'Approved deduction'}),{type,amount:200,note:'Approved deduction'})
  }
  assert.equal(payChargePayload({type:'basic_pay_adjustment',amount:200,direction:'deduct',source:'charge'}).amount,-200)
  assert.equal(payChargePayload({type:'basic_pay_adjustment',amount:200,direction:'add',source:'charge'}).amount,200)
  assert.equal(payChargePayload({type:'other_non_taxable_earning',amount:200,source:'charge'}).amount,200)
})
