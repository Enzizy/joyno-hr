// Reports built from finished payroll: monthly government remittances (SSS, PhilHealth, Pag-IBIG and
// the BIR 1601-C figures) and the 13th month pay for a year. Only real (not practice) pay runs that
// are approved or released count; drafts can still change.
const { payslipSections } = require('./payrollPayslipService')
const { basicAdjustmentTotal } = require('./payrollChargesService')

const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const amount = value => Number(value || 0)

const FINISHED_LINES_SQL = `SELECT line.*, run.payday::text AS run_payday, run.cutoff AS run_cutoff, run.status AS run_status,
    e.department, e.first_name, e.last_name
  FROM payroll_run_lines line
  JOIN payroll_runs run ON run.id = line.payroll_run_id
  LEFT JOIN employees e ON e.id = line.employee_id
  WHERE run.status IN ('approved', 'locked') AND COALESCE(run.rule_snapshot->>'isTest', 'false') <> 'true'`

function withholding(line) {
  const entered = (line.details?.charges || []).filter(entry => entry.type === 'tax_withholding')
    .reduce((sum, entry) => sum + amount(entry.amount), 0)
  return round(amount(line.withholding_tax) + entered)
}

// One line's share of the monthly remittances and of BIR 1601-C.
function remittanceLine(line) {
  const sections = payslipSections(line)
  const contributions = amount(line.employee_sss) + amount(line.employee_philhealth) + amount(line.employee_pagibig)
  const allowances = (line.details?.charges || []).filter(entry => entry.type === 'other_non_taxable_earning')
    .reduce((sum, entry) => sum + amount(entry.amount), amount(line.cola_pay))
  const settings = line.details?.taxSettings || {}
  const mwe = Boolean(settings.minimumWageEarner)
  const shield = mwe ? 0 : amount(settings.taxShield)
  const gross = round(sections.gross)
  const nonTaxable = mwe ? gross : round(contributions + allowances + shield)
  return {
    gross, mweCompensation: mwe ? gross : 0, contributions: mwe ? 0 : round(contributions), allowances: mwe ? 0 : round(allowances),
    taxShield: round(shield), taxable: round(Math.max(0, gross - nonTaxable)), tax: withholding(line),
    sssEmployee: amount(line.employee_sss), sssEmployer: amount(line.employer_sss), ec: amount(line.employer_ec),
    philhealthEmployee: amount(line.employee_philhealth), philhealthEmployer: amount(line.employer_philhealth),
    pagibigEmployee: amount(line.employee_pagibig), pagibigEmployer: amount(line.employer_pagibig),
  }
}

const SUM_KEYS = ['gross', 'mweCompensation', 'contributions', 'allowances', 'taxShield', 'taxable', 'tax', 'sssEmployee', 'sssEmployer', 'ec',
  'philhealthEmployee', 'philhealthEmployer', 'pagibigEmployee', 'pagibigEmployer']

async function monthlyRemittance(db, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw Object.assign(new Error('Choose a month (YYYY-MM)'), { status: 400 })
  const start = `${month}-01`
  const { rows } = await db.query(`${FINISHED_LINES_SQL} AND run.payday >= $1::date AND run.payday < ($1::date + INTERVAL '1 month')
    ORDER BY line.employee_name, run.payday`, [start])
  const byEmployee = new Map()
  const paydays = new Map()
  for (const line of rows) {
    paydays.set(line.run_payday, line.run_status)
    const key = Number(line.employee_id)
    if (!byEmployee.has(key)) {
      byEmployee.set(key, { employeeId: key, employeeCode: line.employee_code, name: line.employee_name, department: line.department || '',
        minimumWageEarner: false, tin: true, ...Object.fromEntries(SUM_KEYS.map(k => [k, 0])) })
    }
    const item = byEmployee.get(key)
    const share = remittanceLine(line)
    for (const k of SUM_KEYS) item[k] = round(item[k] + share[k])
    if (line.details?.taxSettings?.minimumWageEarner) item.minimumWageEarner = true
    if (line.details?.taxSettings && line.details.taxSettings.tin === false) item.tin = false
  }
  const employees = [...byEmployee.values()]
  const totals = Object.fromEntries(SUM_KEYS.map(k => [k, round(employees.reduce((sum, item) => sum + item[k], 0))]))
  return {
    month,
    paydays: [...paydays].map(([payday, status]) => ({ payday, status })).sort((a, b) => a.payday.localeCompare(b.payday)),
    employees,
    totals,
    bir1601c: {
      totalCompensation: totals.gross,
      mweCompensation: totals.mweCompensation,
      thirteenthMonthAndOtherBenefits: 0,
      deMinimis: 0,
      contributions: totals.contributions,
      otherNonTaxable: round(totals.allowances + totals.taxShield),
      taxableCompensation: totals.taxable,
      taxWithheld: totals.tax,
    },
  }
}

// 13th month pay = basic pay earned in the year / 12 (workbook PAYROLL REGISTER BB/BC), summed from each payroll.
async function thirteenthMonth(db, year) {
  if (!/^\d{4}$/.test(String(year))) throw Object.assign(new Error('Choose a year'), { status: 400 })
  const { rows } = await db.query(`${FINISHED_LINES_SQL} AND EXTRACT(YEAR FROM run.payday) = $1 ORDER BY line.employee_name, run.payday`, [Number(year)])
  const byEmployee = new Map()
  for (const line of rows) {
    const key = Number(line.employee_id)
    if (!byEmployee.has(key)) byEmployee.set(key, { employeeId: key, employeeCode: line.employee_code, name: line.employee_name,
      department: line.department || '', payrolls: 0, basicEarned: 0, thirteenthMonth: 0, firstPayday: line.run_payday, lastPayday: line.run_payday })
    const item = byEmployee.get(key)
    item.payrolls += 1
    item.thirteenthMonth = round(item.thirteenthMonth + amount(line.thirteenth_month_accrual))
    // Workbook register BB: basic less absences, plus basic-pay corrections.
    item.basicEarned = round(item.basicEarned + amount(line.gross_salary) - amount(line.absence_deduction) + basicAdjustmentTotal(line.details?.charges || []))
    item.lastPayday = line.run_payday
  }
  const employees = [...byEmployee.values()]
  return { year: Number(year), employees, total: round(employees.reduce((sum, item) => sum + item.thirteenthMonth, 0)),
    firstPayday: rows[0]?.run_payday || null, lastPayday: rows.at(-1)?.run_payday || null }
}

module.exports = { monthlyRemittance, thirteenthMonth, remittanceLine }
