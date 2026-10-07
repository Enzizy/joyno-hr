const assert = require('node:assert/strict')
const test = require('node:test')
const { payrollBreakdown, payslipSections, amountInWords, payslipFilename, renderPayslipPdf, renderPayslipsPdf } = require('./services/payrollPayslipService')
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

const pageCount = (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length

test('payslip PDF keeps the workbook rows when a line has many charges', async () => {
  const manyCharges = Array.from({ length: 20 }, (_, index) => ({
    type: 'cash_advance', amount: 1, note: `Approved installment ${index + 1}`,
  }))
  const charged = { ...line, details: { ...line.details, charges: manyCharges } }
  const pdf = await renderPayslipPdf({ run, line: charged })
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.equal(pageCount(pdf), 1)
  assert.equal(payslipSections(charged).deductions.find((row) => row.label.startsWith('CASH ADVANCE')).amount, 20)
})

test('payslip follows the workbook layout and its net pay matches the pay line', () => {
  const leaveLine = { ...line, absence_days: 1, paid_leave_days: 2, unpaid_leave_days: 0, absence_deduction: '689.66',
    late_minutes: 30, undertime_minutes: 15, late_deduction: '43.10', undertime_deduction: '21.55', cola_pay: '500',
    details: { manualEarnings: [], charges: [{ type: 'pagibig_mpl', amount: 300, note: 'MPL 2 of 24' }, { type: 'other_non_taxable_earning', amount: 250, note: 'Rice' }],
      automaticEarnings: [{ type: 'overtime', amount: 582.76 }], approvedWork: { overtimeHours: 4 } } }
  const sections = payslipSections(leaveLine)
  const less = Object.fromEntries(sections.less.map((row) => [row.label, row]))
  const add = Object.fromEntries(sections.additions.map((row) => [row.label, row]))
  // Paid leave is shown inside ABSENCE and added back under LEAVE, as the workbook does.
  assert.equal(less.ABSENCE.qty, '(3.00)')
  assert.equal(less.ABSENCE.amount, 2068.97)
  assert.equal(add.LEAVE.amount, 1379.31)
  assert.equal(less['UT/LATE'].qty, '(45 min.)')
  assert.equal(add.OVERTIME.qty, '(4.00)')
  assert.equal(add['ALLOWANCE / COLA'].amount, 750)
  assert.equal(sections.deductions.find((row) => row.label === 'MPL').amount, 300)
  const systemNet = 7500 + 500 + 582.76 + 250 - 689.66 - 64.65 - 1325 - 300
  assert.equal(sections.net, Math.round(systemNet * 100) / 100)
})

test('amount in words follows the workbook macro', () => {
  assert.equal(amountInWords(6728.45), 'Six Thousand Seven Hundred Twenty Eight & 45/100 Pesos Only')
  assert.equal(amountInWords(15000), 'Fifteen Thousand Pesos Only')
  assert.equal(amountInWords(1210005.07), 'One Million Two Hundred Ten Thousand Five & 07/100 Pesos Only')
})

test('print sheets put two copies of each payslip on one Legal page', async () => {
  const pdf = await renderPayslipsPdf([{ run, line }, { run, line: { ...line, id: 9, employee_code: 'IT/13' } }], { copies: 2 })
  assert.equal(pageCount(pdf), 2)
  assert.match(pdf.toString('latin1'), /\/MediaBox \[0 0 612 1008\]/)
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
