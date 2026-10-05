const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const { createPayrollRouter } = require('./routes/payrollRoutes')

test('CSV inspection accepts New Bio-only dates and preserves Windows-1252 names', async () => {
  const app = express()
  app.use(createPayrollRouter({ db: { query: async () => { throw new Error('Inspection must not write to the database') } }, payrollService: {},
    authRequired: (req, res, next) => { req.user = { id: 1, role: 'hr' }; next() },
    requireRole: () => (req, res, next) => next() }))
  const server = app.listen(0)
  try {
    const csv = 'Person ID,Name,Time,Attendance Check Point\n\'00000042,CG CAÑETE,09/01/26 09:00,New Bio_New Office Biometrics_Entrance Card Reader1'
    const form = new FormData()
    form.append('file', new Blob([Buffer.from(csv, 'latin1')], { type: 'text/csv' }), 'records.csv')
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/payroll/test/inspect-csv`, { method: 'POST', body: form })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.deepEqual(result.usableDates, ['2026-09-01'])
    assert.equal(result.people[0].personId, '00000042')
    assert.equal(result.people[0].name, 'CG CAÑETE')
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('pay profile saves monthly COLA along with basic salary', async () => {
  const app = express()
  app.use(express.json())
  let saved
  app.use(createPayrollRouter({ db: { query: async () => ({ rows: [] }) }, payrollService: {
    upsertProfile: async (input) => { saved = input; return { employee_id: input.employeeId, monthly_cola: input.monthlyCola } },
  }, authRequired: (req, res, next) => { req.user = { id: 1, role: 'hr' }; next() },
  requireRole: () => (req, res, next) => next() }))
  const server = app.listen(0)
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/payroll/profiles/12`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyBasicSalary: 15000, monthlyCola: 1000,
        effectiveFrom: '2026-09-01', biometricPersonId: '42' }),
    })
    assert.equal(response.status, 200)
    assert.equal(saved.monthlyCola, 1000)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('first-cutoff correction is restricted to management and forwards the HR reason', async () => {
  const app = express()
  app.use(express.json())
  let correction
  const authRequired = (req, res, next) => { req.user = { id: 1, role: req.get('X-Test-Role') || 'employee' }; next() }
  const requireRole = (roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).end()
  app.use(createPayrollRouter({ db: { query: async () => ({ rows: [] }) }, payrollService: {
    overrideFirstCutoffPay: async (...args) => { correction = args; return { id: 8, net_pay: 6150 } },
  }, authRequired, requireRole }))
  const server = app.listen(0)
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/payroll/runs/4/lines/8/first-cutoff-pay`
    const options = { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstCutoffPay: 8000, reason: 'Confirmed by HR' }) }
    assert.equal((await fetch(url, options)).status, 403)
    const manager = await fetch(url, { ...options, headers: { ...options.headers, 'X-Test-Role': 'hr' } })
    assert.equal(manager.status, 200)
    assert.deepEqual(correction.slice(0, 4), [4, 8, 8000, 'Confirmed by HR'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('draft payslip is printable by management but never visible or emailable to employees', async () => {
  const app = express()
  const draft = {
    id: 8, employee_id: 12, employee_code: 'IT-12', employee_name: 'Sample Employee',
    gross_salary: 7500, net_pay: 7500, details: {}, payroll_run_id: 4, run_id: 4,
    period_start: '2026-09-11', period_end: '2026-09-25', payday: '2026-09-30', cutoff: 'second', status: 'draft',
  }
  const db = {
    async query(sql, params) {
      if (sql.includes('FROM payroll_run_lines line')) {
        const employeeId = params[2]
        return { rows: employeeId == null ? [draft] : [] }
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  const authRequired = (req, res, next) => {
    req.user = req.get('X-Test-Role') === 'hr' ? { id: 1, role: 'hr' } : { id: 2, role: 'employee', employee_id: 12 }
    next()
  }
  const requireRole = (roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).end()
  app.use(createPayrollRouter({ db, payrollService: {}, authRequired, requireRole, addAuditLog: async () => {} }))
  const server = app.listen(0)
  try {
    const url = `http://127.0.0.1:${server.address().port}`
    const employee = await fetch(`${url}/api/payroll/my-payslips/8.pdf`)
    assert.equal(employee.status, 404)
    const inspect = await fetch(`${url}/api/payroll/test/inspect-csv`, { method: 'POST' })
    assert.equal(inspect.status, 403)
    const manager = await fetch(`${url}/api/payroll/runs/4/payslips/8.pdf`, { headers: { 'X-Test-Role': 'hr' } })
    assert.equal(manager.status, 200)
    assert.equal(manager.headers.get('content-type'), 'application/pdf')
    assert.equal(manager.headers.get('cache-control'), 'private, no-store')
    assert.equal(Buffer.from(await manager.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')
    const send = await fetch(`${url}/api/payroll/runs/4/payslips/8/send`, { method: 'POST', headers: { 'X-Test-Role': 'hr' } })
    assert.equal(send.status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('paid and closed payslip email uses the linked account and does not resend it', async () => {
  const previous = process.env.PAYROLL_FINALIZATION_ENABLED
  process.env.PAYROLL_FINALIZATION_ENABLED = 'true'
  const app = express()
  let deliveries = 0
  let sent = false
  const db = {
    transaction: async (callback) => callback(db),
    async query(sql, params) {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (sql.includes('FROM payroll_run_lines line')) return { rows: [{
        id: 8, employee_id: 12, employee_code: 'IT-12', employee_name: 'Sample Employee',
        gross_salary: 7500, net_pay: 7500, details: {}, payroll_run_id: 4, run_id: 4,
        period_start: '2026-09-11', period_end: '2026-09-25', payday: '2026-09-30', cutoff: 'second', status: 'locked',
      }] }
      if (sql.includes('SELECT 1 FROM payroll_run_events')) return { rows: sent ? [{ '?column?': 1 }] : [] }
      if (sql.includes('FROM payroll_payments'))return {rows:[{'?column?':1}]}
      if (sql.includes('SELECT DISTINCT LOWER(TRIM(email))')) return { rows: [{ email: 'employee@example.test' }] }
      if (sql.includes('INSERT INTO payroll_run_events')) { sent = true; return { rows: [] } }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  const authRequired = (req, res, next) => { req.user = { id: 1, role: 'hr' }; next() }
  const requireRole = () => (req, res, next) => next()
  app.use(createPayrollRouter({ db, payrollService: {}, authRequired, requireRole,
    deliverPayslipEmail: async (email) => {
      deliveries += 1
      assert.equal(email.to, 'employee@example.test')
      assert.equal(email.requireDelivery, true)
      assert.equal(email.attachments[0].content.subarray(0, 5).toString(), '%PDF-')
    },
  }))
  const server = app.listen(0)
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/payroll/runs/4/payslips/8/send`
    const first = await fetch(url, { method: 'POST' })
    assert.equal(first.status, 200)
    assert.equal((await first.json()).status, 'sent')
    const second = await fetch(url, { method: 'POST' })
    assert.equal((await second.json()).status, 'already_sent')
    assert.equal(deliveries, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    if (previous === undefined) delete process.env.PAYROLL_FINALIZATION_ENABLED
    else process.env.PAYROLL_FINALIZATION_ENABLED = previous
  }
})

test('one-employee CSV preview includes manual earnings and does not write to the database', async () => {
  const app = express()
  const queries = []
  const db = { async query(sql) {
    queries.push(sql)
    assert.match(sql, /^SELECT id, employee_code, first_name, last_name FROM employees/)
    return { rows: [{ id: 12, employee_code: 'IT-12', first_name: 'Sample', last_name: 'Employee' }] }
  } }
  app.use(createPayrollRouter({ db, payrollService: {},
    authRequired: (req, res, next) => { req.user = { id: 1, role: 'hr' }; next() },
    requireRole: () => (req, res, next) => next(),
  }))
  const server = app.listen(0)
  try {
    const body = new FormData()
    body.append('file', new Blob([[
      'Person ID,Name,Time,Attendance Check Point',
      "'0042,Sample Employee,09/11/26 08:30,Main_Door_Out_Door1_Entrance Card Reader1",
      "'0042,Sample Employee,09/11/26 18:20,Main_Door_IN_Door1_Entrance Card Reader1",
    ].join('\n')], { type: 'text/csv' }), 'attendance.csv')
    for (const [key, value] of Object.entries({ employeeId: 12, biometricPersonId: '0042',
      monthlyBasicSalary: 15000, monthlyCola: 1000, workedSpecialHolidayDays: 1, specialHolidayOvertimeHours: 4,
      periodStart: '2026-09-11', periodEnd: '2026-09-25', payday: '2026-09-30', cutoff: 'second' })) {
      body.append(key, String(value))
    }
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/payroll/test/employee-preview`, { method: 'POST', body })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.line.net_pay, 7439.66)
    assert.equal(result.line.cola_pay, 500)
    assert.equal(result.line.employee_sss, 775)
    assert.equal(result.sssAssessment.monthlyCompensation, 15582.76)
    assert.equal(result.sssAssessment.firstCutoffSource, 'assumed-half-basic')
    assert.deepEqual(result.specialHoliday, { holidayPremium: 206.90, overtimePay: 582.76, total: 789.66 })
    assert.equal(result.identityWarning, null)
    assert.equal(result.line.details.manualEarnings.length, 2)
    assert.equal(result.line.details.manualEarnings[0].type, 'holiday_premium')
    assert.equal(result.warnings.length, 10)
    assert.equal(Buffer.from(result.pdfBase64, 'base64').subarray(0, 5).toString(), '%PDF-')
    body.set('firstCutoffPay', '7000')
    const adjustedResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/payroll/test/employee-preview`, { method: 'POST', body })
    assert.equal(adjustedResponse.status, 200)
    const adjusted = await adjustedResponse.json()
    assert.equal(adjusted.sssAssessment.firstCutoffSource, 'entered')
    assert.equal(adjusted.line.employee_sss, 750)
    assert.equal(adjusted.line.net_pay, 7464.66)
    body.set('workedSpecialHolidayHours', '7')
    const partialResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/payroll/test/employee-preview`, { method: 'POST', body })
    assert.equal(partialResponse.status, 200)
    const partial = await partialResponse.json()
    assert.equal(partial.specialHoliday.holidayPremium, 181.03)
    assert.equal(partial.line.details.manualEarnings[0].approvedHours, 7)
    assert.equal(queries.length, 3)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
