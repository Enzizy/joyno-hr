// Reports built from finished payroll: monthly government remittances (SSS, PhilHealth, Pag-IBIG and
// the BIR 1601-C figures) and the 13th month pay for a year. Only real (not practice) pay runs that
// are approved or released count; drafts can still change.
const { payslipSections } = require('./payrollPayslipService')
const { basicAdjustmentTotal } = require('./payrollChargesService')
const { payableProfile } = require('./payrollShiftService')
const { isPaidLeaveEligible } = require('./leaveEligibilityService')

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

// Unused leave that converts to cash (Service Incentive Leave), paid together with the 13th month pay on or
// before Dec 24. Cash = days left × the employee's actual daily pay (a shorter schedule's share of the salary).
// Only employees with 12 months of service on the day the 13th month is released qualify; someone who reaches it
// after the release gets nothing this year and converts next year's unused SIL instead (HR, Oct 2026).
async function silConversion(db, year, releaseDate) {
  if (!/^\d{4}$/.test(String(year))) throw Object.assign(new Error('Choose a year'), { status: 400 })
  const payout = releaseDate || `${year}-12-24`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payout) || payout.slice(0, 4) !== String(year) || payout > `${year}-12-24` ||
      new Date(`${payout}T00:00:00Z`).toISOString().slice(0, 10) !== payout) {
    throw Object.assign(new Error(`The 13th month release date must be in ${year}, on or before Dec 24`), { status: 400 })
  }
  const types = (await db.query(`SELECT id, name, paid_days_per_year, min_months_employed FROM leave_policies
    WHERE cash_convertible = TRUE AND is_active = TRUE AND paid_days_per_year > 0 ORDER BY name`)).rows
  const employees = (await db.query(`SELECT e.id, e.employee_code, e.first_name, e.last_name, e.department, e.date_hired::text,
      p.monthly_basic_salary, p.daily_rate_divisor, p.work_start_time, p.work_end_time, p.unpaid_break_minutes
    FROM employees e
    LEFT JOIN LATERAL (SELECT * FROM payroll_employee_profiles WHERE employee_id = e.id ORDER BY effective_from DESC, id DESC LIMIT 1) p ON TRUE
    WHERE COALESCE(LOWER(e.status), 'active') IN ('active', 'on_leave')
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id AND u.role = 'ceo')
    ORDER BY e.first_name, e.last_name`)).rows
  const used = (await db.query(`SELECT employee_id, LOWER(leave_type_name) AS type, SUM(COALESCE(credits_deducted, leave_days, 0))::numeric AS days
    FROM leave_requests WHERE status = 'approved' AND leave_pay_type IN ('paid', 'partial_paid') AND EXTRACT(YEAR FROM start_date) = $1
    GROUP BY employee_id, LOWER(leave_type_name)`, [Number(year)])).rows
  const usedDays = new Map(used.map(row => [`${row.employee_id}|${row.type}`, Number(row.days)]))
  const rows = employees.map(employee => {
    const salary = employee.monthly_basic_salary == null ? null : Number(payableProfile(employee).monthly_basic_salary)
    const dailyRate = salary == null ? null : salary * 12 / Number(employee.daily_rate_divisor || 261)
    const leave = types.map(type => {
      const eligible = isPaidLeaveEligible(employee.date_hired, payout, type.min_months_employed)
      const taken = round(usedDays.get(`${employee.id}|${type.name.toLowerCase()}`) || 0)
      return { type: type.name, total: Number(type.paid_days_per_year), used: taken, eligible,
        left: eligible ? Math.max(0, round(Number(type.paid_days_per_year) - taken)) : 0 }
    })
    const daysLeft = round(leave.reduce((sum, item) => sum + item.left, 0))
    return { employeeId: employee.id, employeeCode: employee.employee_code, name: `${employee.first_name} ${employee.last_name}`.trim(),
      department: employee.department || '', dateHired: employee.date_hired, eligible: leave.some(item => item.eligible), leave,
      daysLeft, dailyRate: dailyRate == null ? null : round(dailyRate), cash: dailyRate == null ? 0 : round(daysLeft * dailyRate) }
  })
  return { year: Number(year), payout, types: types.map(type => ({ name: type.name, days: Number(type.paid_days_per_year), minMonths: type.min_months_employed })),
    employees: rows, total: round(rows.reduce((sum, row) => sum + row.cash, 0)), missingSalary: rows.filter(row => row.dailyRate == null).length }
}

module.exports = { monthlyRemittance, thirteenthMonth, silConversion, remittanceLine }
