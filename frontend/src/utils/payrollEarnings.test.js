import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveEarnings, needsNightReview } from './payrollEarnings.js'

test('register and payslip use automatic night pay, with a total override replacing it', () => {
  const details={automaticEarnings:[{type:'night_differential',amount:60.34}],manualEarnings:[{type:'overtime',amount:100}]}
  assert.equal(effectiveEarnings(details).reduce((sum,e)=>sum+e.amount,0),160.34)
  details.manualEarnings.push({type:'night_differential',amount:0,note:'HR verified no eligible night work'})
  assert.equal(effectiveEarnings(details).reduce((sum,e)=>sum+e.amount,0),100)
})
test('holiday or unmeasured night work blocks approval until a reasoned total override exists', () => {
  const line={details:{nightDifferential:{reviewRequired:true},manualEarnings:[]}}
  assert.equal(needsNightReview(line),true)
  line.details.manualEarnings.push({type:'night_differential',amount:100,note:'Verified holiday night total'})
  assert.equal(needsNightReview(line),false)
  line.details.manualEarnings=[];assert.equal(needsNightReview(line),true)
  assert.equal(needsNightReview({details:{}}),false)
})
