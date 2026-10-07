import test from 'node:test'
import assert from 'node:assert/strict'
import {payrollShift,reviewScope,runScope} from './payrollScope.js'

test('shift selection defaults to Day and retains Night in attendance/payroll links',()=>{
  assert.equal(payrollShift(undefined),'day')
  assert.equal(payrollShift('night'),'night')
})
test('older combined reviews and runs cannot masquerade as Day attendance',()=>{
  assert.equal(reviewScope({}),'all')
  assert.equal(reviewScope({payrollScope:'night'}),'night')
  assert.equal(runScope({rule_snapshot:{payrollScope:'day'}}),'day')
  assert.equal(runScope({}),'all')
})
