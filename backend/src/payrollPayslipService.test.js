const assert = require('node:assert/strict')
const test = require('node:test')
const { payrollBreakdown, payslipFilename, renderPayslipPdf } = require('./services/payrollPayslipService')
const { createPayrollService } = require('./services/payrollService')
const { normalizeCharges } = require('./services/payrollChargesService')

const line = {
  id: 8, employee_id: 12, employee_code: 'IT/12', employee_name: 'Sample Employee',
  gross_salary: '7500.00', daily_rate: '689.655172', absence_deduction: '0', late_deduction: '0',
  undertime_deduction: '0', employee_sss: '750', employee_philhealth: '375', employee_pagibig: '200',
  net_pay: '6375', details: { manualEarnings: [
    { type: 'overtime', amount: 150, note: 'Approved September 28 overtime' },
    { type: 'holiday_premium', amount: 206.90, note: 'Special holiday September 21' },
  ] }, status: 'draft',
}
const run = { id: 4, status: 'draft', period_start: '2026-09-11', period_end: '2026-09-25', payday: '2026-09-30' }

test('payslip totals include manual earnings but exclude fare and 13th-month accrual', () => {
  const totals = payrollBreakdown(line)
  assert.equal(totals.totalEarnings, 7856.9)
  assert.equal(totals.totalDeductions, 1325)
  assert.equal(payslipFilename(run, line), 'payslip-IT_12-2026-09-30.pdf')
})

test('payslip separates COLA, charge earnings, and loan or advance deductions', () => {
  const charged = { ...line, cola_pay: '500', details: { ...line.details, charges: [
    { type: 'other_non_taxable_earning', amount: 125, note: 'Approved allowance' },
    { type: 'basic_pay_adjustment', amount: -50, note: 'Correct prior basic overpayment' },
    { type: 'sss_salary_loan', amount: 100, note: 'SSS loan installment' },
  ] } }
  const totals = payrollBreakdown(charged)
  assert.equal(totals.totalEarnings, 8481.9)
  assert.equal(totals.totalDeductions, 1475)
  assert.equal(totals.chargeEarnings.length, 1)
  assert.throws(() => normalizeCharges([{ type: 'sss_salary_loan', amount: -100, note: 'Invalid' }]), /valid type/)
})

test('draft charges replace rather than duplicate deductions and cannot overdraw pay', async () => {
  const state = { ...line, gross_salary: '7500', cola_pay: '500', employee_sss: '0',
    employee_philhealth: '0', employee_pagibig: '0', status: 'draft',
    details: { manualEarnings: [], charges: [] } }
  const db = { async query(sql, params = []) {
    if (sql.includes('SELECT line.*, run.status')) return { rows: [{ ...state }] }
    if (sql.includes('UPDATE payroll_run_lines SET details')) {
      state.details = JSON.parse(params[0])
      state.net_pay = params[1]
      return { rows: [{ ...state }] }
    }
    if (sql.includes('INSERT INTO payroll_run_events')) return { rows: [] }
    if (sql.includes('INSERT INTO audit_logs')) return { rows: [] }
    throw new Error(`Unexpected query: ${sql}`)
  } }
  const service = createPayrollService({ db })
  const charges = [{ type: 'cash_advance', amount: 1000, note: 'Approved cash advance repayment' }]
  const first = await service.updateCharges(4, 8, charges, { id: 1, role: 'hr' })
  const second = await service.updateCharges(4, 8, charges, { id: 1, role: 'hr' })
  assert.equal(first.net_pay, 7000)
  assert.equal(second.net_pay, 7000)
  await assert.rejects(service.updateCharges(4, 8, [{ type: 'cash_advance', amount: 9000, note: 'Too large' }]),
    { statusCode: 422 })
  state.status = 'approved'
  await assert.rejects(service.updateCharges(4, 8, charges), { statusCode: 409 })
})

test('a basic-pay adjustment changes the workbook SSS bracket but COLA does not', async () => {
  const state = { ...line, monthly_basic_salary: '15000', cola_pay: '500',
    cutoff: 'second', include_contributions: true, employee_sss: '750',
    details: { manualEarnings: [], charges: [], sssAssessment: { firstCutoffPay: 7500,
      firstCutoffSource: 'saved-first-cutoff-approved' } } }
  const db = { async query(sql, params = []) {
    if (sql.includes('SELECT line.*, run.status')) return { rows: [{ ...state }] }
    if (sql.includes('UPDATE payroll_run_lines SET details')) {
      state.details = JSON.parse(params[0])
      state.net_pay = params[1]
      state.employee_sss = params[2]
      return { rows: [{ ...state }] }
    }
    if (sql.includes('INSERT INTO payroll_run_events')) return { rows: [] }
    throw new Error(`Unexpected query: ${sql}`)
  } }
  const updated = await createPayrollService({ db }).updateCharges(4, 8, [
    { type: 'basic_pay_adjustment', amount: 300, note: 'Approved basic pay correction' },
  ])
  assert.equal(updated.details.sssAssessment.monthlyCompensation, 15300)
  assert.equal(updated.employee_sss, 775)
  assert.equal(updated.net_pay, 6950)
})

test('draft PDF is a printable PDF buffer', async () => {
  const pdf = await renderPayslipPdf({ run, line })
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pdf.length > 1000)
})

test('payslip PDF handles a full set of charge entries', async () => {
  const manyCharges = Array.from({ length: 20 }, (_, index) => ({
    type: 'cash_advance', amount: 1, note: `Approved installment ${index + 1}`,
  }))
  const pdf = await renderPayslipPdf({ run, line: { ...line, details: { ...line.details, charges: manyCharges } } })
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 2)
})

test('manual earnings update is draft-only and recalculates net without double-counting', async () => {
  const state = { ...line, details: { ...line.details }, status: 'draft' }
  const events = []
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT line.*, run.status')) return { rows: [{ ...state }] }
      if (sql.includes('UPDATE payroll_run_lines SET details')) {
        state.details = JSON.parse(params[0])
        state.net_pay = params[1]
        return { rows: [{ ...state }] }
      }
      if (sql.includes('INSERT INTO payroll_run_events')) { events.push(JSON.parse(params[5])); return { rows: [] } }
      if (sql.includes('INSERT INTO audit_logs')) return { rows: [] }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  const service = createPayrollService({ db })
  const earnings = [{ type: 'holiday_premium', amount: 206.90, note: 'Approved holiday premium' }]
  const first = await service.updateManualEarnings(4, 8, earnings, { id: 1, role: 'hr' })
  assert.equal(first.net_pay, 6381.9)
  const second = await service.updateManualEarnings(4, 8, earnings, { id: 1, role: 'hr' })
  assert.equal(second.net_pay, 6381.9)
  assert.equal(events.length, 2)
  state.status = 'approved'
  await assert.rejects(service.updateManualEarnings(4, 8, earnings), { statusCode: 409 })
})

test('approved holiday hours determine the saved premium even if a client submits a different amount', async () => {
  const state = { ...line, status: 'draft', period_start: '2026-09-11', period_end: '2026-09-25',
    monthly_basic_salary: '15000', details: { manualEarnings: [], charges: [] } }
  const db = { async query(sql, params = []) {
    if (sql.includes('SELECT line.*, run.status')) return { rows: [{ ...state }] }
    if (sql.includes('UPDATE payroll_run_lines SET details')) {
      state.details = JSON.parse(params[0])
      state.net_pay = params[1]
      return { rows: [{ ...state }] }
    }
    if (sql.includes('INSERT INTO payroll_run_events')) return { rows: [] }
    throw new Error(`Unexpected query: ${sql}`)
  } }
  const service = createPayrollService({ db })
  const updated = await service.updateManualEarnings(4, 8, [{ type: 'holiday_premium', amount: 1,
    note: 'Approved seven-hour holiday', approvedHours: 7, holidayDate: '2026-09-21' }])
  assert.equal(updated.details.manualEarnings[0].amount, 181.03)
  assert.equal(updated.details.manualEarnings[0].approvedHours, 7)
  await assert.rejects(service.updateManualEarnings(4, 8, [
    { type: 'holiday_premium', amount: 1, note: 'Wrong date', approvedHours: 7, holidayDate: '2026-10-21' },
  ]), /within this payroll period/)
})

test('saved month-end draft recalculates SSS when approved overtime is entered', async () => {
  const state = { ...line, monthly_basic_salary: '15000', cutoff: 'second', include_contributions: true,
    net_pay: '6375', details: { sssAssessment: { firstCutoffPay: 7500,
      firstCutoffSource: 'assumed-half-basic' }, manualEarnings: [] } }
  const db = { async query(sql, params = []) {
    if (sql.includes('SELECT line.*, run.status')) return { rows: [{ ...state }] }
    if (sql.includes('UPDATE payroll_run_lines SET details')) {
      state.details = JSON.parse(params[0])
      state.net_pay = params[1]
      state.employee_sss = params[2]
      state.employer_sss = params[3]
      state.employer_ec = params[4]
      return { rows: [{ ...state }] }
    }
    if (sql.includes('INSERT INTO payroll_run_events')) return { rows: [] }
    throw new Error(`Unexpected query: ${sql}`)
  } }
  const updated = await createPayrollService({ db }).updateManualEarnings(4, 8, [
    { type: 'holiday_premium', amount: 206.90, note: 'Worked special holiday' },
    { type: 'overtime', amount: 582.76, note: 'Four approved holiday OT hours' },
  ])
  assert.equal(updated.employee_sss, 775)
  assert.equal(updated.net_pay, 6939.66)
  assert.equal(updated.details.sssAssessment.monthlyCompensation, 15582.76)
  assert.equal(updated.details.contributionBasis.sssMsc, 15500)
})
