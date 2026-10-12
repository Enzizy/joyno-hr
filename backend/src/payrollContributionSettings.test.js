const test = require('node:test')
const assert = require('node:assert/strict')
const { calculatePayrollLine, calculateContributions, normalizeContributionSettings } = require('./services/payrollCalculationService')

test('government ID defaults preserve the existing three-agency calculations', () => {
  assert.deepEqual(normalizeContributionSettings(), { sss:true, philhealth:true, pagibig:true })
  assert.deepEqual(calculateContributions(15000), calculateContributions(15000, { contributionSettings:normalizeContributionSettings() }))
  assert.deepEqual(normalizeContributionSettings({pagibig:false}, {sss:false,philhealth:true,pagibig:true}), {sss:false,philhealth:true,pagibig:false})
})

test('Pag-IBIG-only month-end deducts 200 and excludes both employee and employer SSS/PhilHealth', () => {
  const line = calculatePayrollLine({monthlyBasicSalary:15000, cutoff:'second', includeContributions:true,
    sssCompensation:24000, contributionSettings:{sss:false,philhealth:false,pagibig:true}})
  assert.deepEqual([line.employeeSss,line.employerSss,line.employerEc,line.employeePhilhealth,line.employerPhilhealth], [0,0,0,0,0])
  assert.equal(line.employeePagibig,200)
  assert.equal(line.employerPagibig,200)
  assert.equal(line.netPay,7300)
  assert.deepEqual(line.contributionBasis,{sssCompensation:0,sssMsc:0,philHealth:0,pagIbig:10000,schedule:'PH-2025'})
})

test('each agency can be pending independently, with no first-cutoff deductions', () => {
  for (const key of ['sss','philhealth','pagibig']) {
    const settings = {sss:false,philhealth:false,pagibig:false,[key]:true}
    const c = calculateContributions(15000,{contributionSettings:settings})
    assert.deepEqual([c.sssEmployee,c.philHealthEmployee,c.pagIbigEmployee], [key==='sss'?750:0,key==='philhealth'?375:0,key==='pagibig'?200:0])
    const first = calculatePayrollLine({monthlyBasicSalary:15000,cutoff:'first',includeContributions:true,contributionSettings:settings})
    assert.equal(first.employeeDeductions,0)
  }
  const line = calculatePayrollLine({monthlyBasicSalary:15000,cutoff:'second',includeContributions:true,
    contributionSettings:{sss:false,philhealth:false,pagibig:false},attendance:[{status:'present',lateMinutes:30}]})
  assert.equal(line.employeeSss+line.employeePhilhealth+line.employeePagibig,0)
  assert.ok(line.lateDeduction>0)
})

test('invalid contribution switches cannot silently suppress deductions', () => {
  for (const value of [null,[],false,'pending',{sss:'false'},{sss:0},{sss:null},{other:true}]) {
    assert.throws(()=>normalizeContributionSettings(value),TypeError)
  }
})
