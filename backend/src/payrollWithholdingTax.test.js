const test = require('node:test')
const assert = require('node:assert/strict')
const { calculateWithholdingTax, calculateTax, profileTaxSettings } = require('./services/payrollCalculationService')
const { draftPay } = require('./services/payrollChargesService')

const taxSettings = { tin: true, minimumWageEarner: false, taxShield: 0 }
// A ₱20,000 employee's payday: half the monthly basic, plus whatever attendance added.
const line = (details = {}, fields = {}) => ({ gross_salary: '10000.00', cola_pay: '0.00', absence_deduction: '0.00',
  late_deduction: '0.00', undertime_deduction: '0.00', employee_sss: '0.00', employee_philhealth: '0.00',
  employee_pagibig: '0.00', details: { taxSettings, ...details }, ...fields })

test('withholding tax follows the workbook semi-monthly table (BIR, from 2023)', () => {
  for (const [taxable, tax] of [[-500, 0], [10000, 0], [10417, 0], [11000, 87.45], [16666, 937.35], [16667, 937.5],
    [20000, 1604.1], [40000, 5937.45], [100000, 21770.8], [400000, 115104.15]]) {
    assert.equal(calculateWithholdingTax(taxable), tax, `taxable ${taxable}`)
  }
})

test('taxable pay takes off contributions and the tax shield; TIN and minimum wage follow the workbook', () => {
  const base = { taxableEarnings: 12000, employeeContributions: 700 }
  assert.deepEqual(calculateTax({ ...base, taxSettings }), { taxablePay: 11300, withholdingTax: 132.45 })
  assert.deepEqual(calculateTax({ ...base, taxSettings: { ...taxSettings, taxShield: 1000 } }), { taxablePay: 10300, withholdingTax: 0 })
  assert.deepEqual(calculateTax({ ...base, taxSettings: { ...taxSettings, tin: false } }), { taxablePay: 11300, withholdingTax: 0 })
  assert.deepEqual(calculateTax({ ...base, taxSettings: { ...taxSettings, minimumWageEarner: true } }), { taxablePay: 0, withholdingTax: 0 })
})

test('a profile without a TIN setting is taxed, like the workbook where every employee has a TIN', () => {
  assert.deepEqual(profileTaxSettings({ contribution_settings: { sss: true, philhealth: true, pagibig: true } }), taxSettings)
  assert.deepEqual(profileTaxSettings({ contribution_settings: { sss: true, philhealth: true, pagibig: true, tin: false },
    minimum_wage_earner: true, tax_shield: '250.50' }), { tin: false, minimumWageEarner: true, taxShield: 250.5 })
})

test('overtime that lifts a payday over ₱10,417 is taxed and taken from net pay', () => {
  const pay = draftPay(line({ automaticEarnings: [{ type: 'overtime', amount: 1000 }] }))
  assert.equal(pay.withholdingTax, 87.45)
  assert.equal(pay.tax.taxablePay, 11000)
  assert.equal(pay.netPay, 10912.55)
})

test('COLA and non-taxable allowances are paid in full but stay out of taxable pay', () => {
  const pay = draftPay(line({ automaticEarnings: [{ type: 'overtime', amount: 500 }] }, { cola_pay: '2500.00' }),
    { charges: [{ type: 'other_non_taxable_earning', amount: 1000, note: 'Transport' }] })
  assert.equal(pay.tax.taxablePay, 10500)
  assert.equal(pay.withholdingTax, 12.45)
  assert.equal(pay.netPay, 13987.55)
})

test('month-end contributions and absences lower taxable pay', () => {
  const pay = draftPay(line({ automaticEarnings: [{ type: 'overtime', amount: 1000 }] },
    { absence_deduction: '500.00', employee_philhealth: '500.00', employee_pagibig: '200.00' }), { employeeSss: 1000 })
  assert.equal(pay.tax.taxablePay, 8800)
  assert.equal(pay.withholdingTax, 0)
  assert.equal(pay.netPay, 8800)
})

test('a basic pay correction is taxable', () => {
  const pay = draftPay(line(), { charges: [{ type: 'basic_pay_adjustment', amount: 1000, note: 'Back pay' }] })
  assert.equal(pay.withholdingTax, 87.45)
})

test('tax HR enters replaces the computed tax', () => {
  const pay = draftPay(line({ automaticEarnings: [{ type: 'overtime', amount: 1000 }] }),
    { charges: [{ type: 'tax_withholding', amount: 50, note: 'BIR' }] })
  assert.equal(pay.withholdingTax, 0)
  assert.equal(pay.tax.overridden, true)
  assert.equal(pay.netPay, 10950)
})

test('a draft calculated before withholding tax gets none until it is recalculated', () => {
  const legacy = line({ automaticEarnings: [{ type: 'overtime', amount: 1000 }] })
  delete legacy.details.taxSettings
  assert.equal(draftPay(legacy).withholdingTax, 0)
  assert.equal(draftPay(legacy).netPay, 11000)
})

const { normalizeTaxTable, SEMI_MONTHLY_TAX_TABLE } = require('./services/payrollCalculationService')
const { createPayrollService } = require('./services/payrollService')
// A made-up future table: nothing up to ₱12,000, then 10%.
const newRates = [{ upTo: 12000, base: 0, over: 0, rate: 0 }, { upTo: null, base: 0, over: 12000, rate: 0.1 }]

test('a draft uses the tax table saved with it', () => {
  const pay = draftPay(line({ automaticEarnings: [{ type: 'overtime', amount: 3000 }], taxTable: { effectiveFrom: '2027-01-01', rows: newRates } }))
  assert.equal(pay.withholdingTax, 100)
  assert.equal(pay.tax.tableEffectiveFrom, '2027-01-01')
})

test('HR-entered tables need rising limits, an open last row, peso amounts and 0–100% rates', () => {
  assert.deepEqual(normalizeTaxTable(SEMI_MONTHLY_TAX_TABLE), SEMI_MONTHLY_TAX_TABLE)
  assert.deepEqual(normalizeTaxTable([{ upTo: '12000', base: '0', over: '0', rate: '0' }, { upTo: '', base: 0, over: 12000, rate: 0.1 }]), newRates)
  for (const rows of [[newRates[0]], [newRates[0], { ...newRates[1], upTo: 20000 }], [{ ...newRates[0], upTo: null }, newRates[1]],
    [newRates[0], { upTo: 11000, base: 0, over: 11000, rate: 0.1 }, newRates[1]], [newRates[0], { ...newRates[1], rate: 1.5 }],
    [newRates[0], { ...newRates[1], base: 0.001 }], [newRates[0], { ...newRates[1], over: 5000 }]]) {
    assert.throws(() => normalizeTaxTable(rows), TypeError)
  }
})

test('new rates cannot start on or before a payday that is already approved', async () => {
  const queries = []
  const service = createPayrollService({ db: { async query(sql, params) {
    queries.push(sql)
    if (sql.includes('LOCK TABLE')) return { rows: [] }
    if (sql.includes('FROM payroll_runs')) return { rows: params[0] <= '2026-09-30' ? [{ payday: '2026-09-30' }] : [] }
    if (sql.includes('INSERT INTO payroll_tax_tables')) return { rows: [] }
    throw new Error(`Unexpected query: ${sql}`)
  } } })
  await assert.rejects(service.saveTaxTable('2026-09-01', { rows: newRates }), /Payroll for 2026-09-30 is already approved/)
  assert.equal(queries.some(sql => sql.includes('INSERT INTO payroll_tax_tables')), false)
  assert.deepEqual(await service.saveTaxTable('2027-01-01', { rows: newRates, note: 'Example law' }), { effectiveFrom: '2027-01-01', rows: newRates, note: 'Example law' })
})

test('approval asks for a recalculation when the payday\'s tax table changed after the draft was made', async () => {
  const previous = process.env.PAYROLL_FINALIZATION_ENABLED
  process.env.PAYROLL_FINALIZATION_ENABLED = 'true'
  const { fingerprint } = require('./services/attendanceReviewService')
  const batch = { id: 7, review_state: 'confirmed', period_start: '2027-01-11', period_end: '2027-01-25', review_version: 2,
    context_hash: fingerprint({ employees: [], profiles: [], leaves: [], holidays: [] }), error_count: 0 }
  const service = createPayrollService({ db: { async query(sql) {
    if (sql.includes('FROM payroll_attendance_review_events')) return { rows: [] }
    if (sql.includes('FROM payroll_attendance_import_batches')) return { rows: [batch] }
    if (sql.includes('SELECT * FROM payroll_runs')) return { rows: [{ id: 1, status: 'draft', cutoff: 'first', attendance_batch_id: 7, payday: '2027-01-15',
      period_start: '2027-01-11', period_end: '2027-01-25', rule_snapshot: { version: 6, attendanceContextHash: batch.context_hash, attendanceReviewVersion: 2 } }] }
    if (sql.includes('p.minimum_wage_earner')) return { rows: [{ employee_code: 'TAX-1', details: { taxSettings, taxTable: { effectiveFrom: '2023-01-01', rows: SEMI_MONTHLY_TAX_TABLE } },
      contribution_settings: { sss: true, philhealth: true, pagibig: true }, minimum_wage_earner: false, tax_shield: '0.00' }] }
    if (sql.includes('FROM payroll_tax_tables')) return { rows: [{ effective_from: '2027-01-01', brackets: newRates }] }
    if (sql.includes('UPDATE payroll_runs')) throw new Error('Must not approve')
    return { rows: [] }
  } } })
  try {
    await assert.rejects(service.approveRun(1), /withholding tax table for this payday changed/)
  } finally {
    if (previous === undefined) delete process.env.PAYROLL_FINALIZATION_ENABLED
    else process.env.PAYROLL_FINALIZATION_ENABLED = previous
  }
})

// Workbook Remittance H9/Z9/AJ9: no month-end contributions when the month-end cutoff's pay is ₱1,500 or less.
function monthEndDraft(overrides = {}) {
  const state = { id: 8, payroll_run_id: 4, employee_id: 12, monthly_basic_salary: '15000', daily_rate: '689.66', hourly_rate: '86.21',
    gross_salary: '7500', cola_pay: '0', absence_deduction: '6206.94', late_deduction: '0', undertime_deduction: '0',
    employee_sss: '0', employer_sss: '0', employer_ec: '0', employee_philhealth: '0', employer_philhealth: '0', employee_pagibig: '0', employer_pagibig: '0',
    status: 'draft', cutoff: 'second', include_contributions: true,
    details: { manualEarnings: [], charges: [], contributionSettings: { sss: true, philhealth: true, pagibig: true },
      sssAssessment: { firstCutoffPay: 7500, firstCutoffSource: 'saved-first-cutoff-approved' } }, ...overrides }
  const db = { async query(sql, params = []) {
    if (sql.includes('SELECT line.*, run.status')) return { rows: [{ ...state }] }
    if (sql.includes('UPDATE payroll_run_lines SET details')) {
      Object.assign(state, { details: JSON.parse(params[0]), net_pay: params[1], employee_sss: params[2], employee_philhealth: params[7], employee_pagibig: params[9] })
      if (sql.includes('thirteenth_month_accrual')) Object.assign(state, { employee_philhealth: params[8], employee_pagibig: params[10] })
      return { rows: [{ ...state }] }
    }
    if (sql.includes('INSERT INTO payroll_run_events') || sql.includes('INSERT INTO audit_logs')) return { rows: [] }
    throw new Error(`Unexpected query: ${sql}`)
  } }
  return { state, service: createPayrollService({ db }) }
}

test('month-end contributions are skipped when the cutoff pay is ₱1,500 or less, and return once it is over', async () => {
  const { state, service } = monthEndDraft()
  // ₱7,500 basic less 9 absent days leaves ₱1,293.06 for the cutoff: no SSS, PhilHealth or Pag-IBIG.
  await service.updateCharges(4, 8, [], { id: 1, role: 'hr' })
  assert.deepEqual([state.employee_sss, state.employee_philhealth, state.employee_pagibig].map(Number), [0, 0, 0])
  assert.deepEqual(state.details.contributionsSkipped, { basis: 1293.06, minimum: 1500 })
  assert.equal(Number(state.net_pay), 1293.06)
  // A ₱300 basic correction lifts it to ₱1,593.06, so the month's contributions apply again.
  await service.updateCharges(4, 8, [{ type: 'basic_pay_adjustment', amount: 300, note: 'Correction' }], { id: 1, role: 'hr' })
  assert.ok(Number(state.employee_sss) > 0)
  assert.equal(Number(state.employee_philhealth), 375)
  assert.equal(Number(state.employee_pagibig), 200)
  assert.equal(state.details.contributionsSkipped, null)
})

test('13th month pay and remittances are built from approved and released payroll lines', async () => {
  const { thirteenthMonth, monthlyRemittance } = require('./services/payrollReportsService')
  const lines = [
    { employee_id: 3, employee_code: 'A-3', employee_name: 'Ana Cruz', department: 'Sales', run_payday: '2026-09-30', run_status: 'locked',
      gross_salary: '8000', absence_deduction: '0', late_deduction: '0', undertime_deduction: '0', cola_pay: '500', thirteenth_month_accrual: '666.67',
      employee_sss: '800', employer_sss: '1600', employer_ec: '30', employee_philhealth: '400', employer_philhealth: '400', employee_pagibig: '200', employer_pagibig: '200',
      withholding_tax: '12.45', details: { taxSettings: { tin: true, minimumWageEarner: false, taxShield: 0 }, charges: [] } },
  ]
  const db = { async query() { return { rows: lines } } }
  const year = await thirteenthMonth(db, 2026)
  assert.deepEqual(year.employees[0], { employeeId: 3, employeeCode: 'A-3', name: 'Ana Cruz', department: 'Sales', payrolls: 1, basicEarned: 8000,
    thirteenthMonth: 666.67, firstPayday: '2026-09-30', lastPayday: '2026-09-30' })
  const month = await monthlyRemittance(db, '2026-09')
  assert.equal(month.totals.sssEmployee + month.totals.sssEmployer + month.totals.ec, 2430)
  assert.deepEqual(month.bir1601c, { totalCompensation: 8500, mweCompensation: 0, thirteenthMonthAndOtherBenefits: 0, deMinimis: 0,
    contributions: 1400, otherNonTaxable: 500, taxableCompensation: 6600, taxWithheld: 12.45 })
  await assert.rejects(monthlyRemittance(db, 'September'), /Choose a month/)
})

test('unused SIL converts to cash at the actual daily pay, once 12 months are served by Dec 24', async () => {
  const { silConversion } = require('./services/payrollReportsService')
  const db = { async query(sql) {
    if (sql.includes('FROM leave_policies')) return { rows: [{ id: 'service_incentive_leave', name: 'Service Incentive Leave', paid_days_per_year: '5.00', min_months_employed: 12 }] }
    if (sql.includes('FROM employees e')) return { rows: [
      { id: 1, employee_code: 'A', first_name: 'Ana', last_name: 'Full', date_hired: '2025-01-10', monthly_basic_salary: '15000', daily_rate_divisor: 261, work_start_time: '09:00', work_end_time: '18:00', unpaid_break_minutes: 60 },
      { id: 2, employee_code: 'B', first_name: 'Ben', last_name: 'Night', date_hired: '2025-05-26', monthly_basic_salary: '15000', daily_rate_divisor: 261, work_start_time: '19:00', work_end_time: '01:00', unpaid_break_minutes: 0 },
      { id: 3, employee_code: 'C', first_name: 'Cy', last_name: 'New', date_hired: '2026-03-01', monthly_basic_salary: '15000', daily_rate_divisor: 261, work_start_time: '09:00', work_end_time: '18:00', unpaid_break_minutes: 60 },
    ] }
    if (sql.includes('FROM leave_requests')) return { rows: [{ employee_id: 1, type: 'service incentive leave', days: '3' }] }
    throw new Error(`Unexpected query: ${sql}`)
  } }
  const report = await silConversion(db, 2026)
  const [ana, ben, cy] = report.employees
  assert.deepEqual([ana.daysLeft, ana.dailyRate, ana.cash], [2, 689.66, 1379.31])
  assert.deepEqual([ben.daysLeft, ben.dailyRate, ben.cash], [5, 517.24, 2586.21])
  assert.deepEqual([cy.eligible, cy.daysLeft, cy.cash], [false, 0, 0])
  assert.equal(report.total, 3965.52)
})

test('SIL conversion goes only to people with 12 months of service on the 13th month release date', async () => {
  const { silConversion } = require('./services/payrollReportsService')
  const db = { async query(sql) {
    if (sql.includes('FROM leave_policies')) return { rows: [{ id: 'service_incentive_leave', name: 'Service Incentive Leave', paid_days_per_year: '5.00', min_months_employed: 12 }] }
    // Reaches one year on Dec 19.
    if (sql.includes('FROM employees e')) return { rows: [{ id: 1, employee_code: 'A', first_name: 'Ana', last_name: 'Cruz', date_hired: '2025-12-19',
      monthly_basic_salary: '15000', daily_rate_divisor: 261, work_start_time: '09:00', work_end_time: '18:00', unpaid_break_minutes: 60 }] }
    if (sql.includes('FROM leave_requests')) return { rows: [] }
    throw new Error(`Unexpected query: ${sql}`)
  } }
  assert.equal((await silConversion(db, 2026, '2026-12-18')).employees[0].cash, 0)
  assert.equal((await silConversion(db, 2026, '2026-12-19')).employees[0].cash, 3448.28)
  assert.equal((await silConversion(db, 2026)).payout, '2026-12-24')
  await assert.rejects(silConversion(db, 2026, '2026-12-28'), /on or before Dec 24/)
})
