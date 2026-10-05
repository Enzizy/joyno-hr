const test = require('node:test')
const assert = require('node:assert/strict')
const {fingerprint}=require('./services/attendanceReviewService')
const emptyReviewContext={employees:[],profiles:[],leaves:[],holidays:[]}
const confirmedBatch={id:7,review_state:'confirmed',period_start:'2026-09-11',period_end:'2026-09-25',review_version:2,context_hash:fingerprint(emptyReviewContext),error_count:0}
function reviewFixture(sql){
  if(sql.includes('FROM payroll_attendance_import_batches'))return {rows:[confirmedBatch]}
  if(sql.includes('SELECT e.id,e.employee_code')||sql.includes('SELECT p.id,p.employee_id')||sql.includes('FROM leave_requests WHERE status')||sql.includes('FROM philippine_holidays'))return {rows:[]}
}
const {
  calculateContributions,
  calculatePayrollLine,
  calculateSssAssessablePay,
  calculateWorkedSpecialHoliday,
  getSssMonthlySalaryCredit,
} = require('./services/payrollCalculationService')
const {
  computeDailyAttendance,
  dateKey,
  decodeAttendanceCsv,
  listWeekdays,
  parseAttendanceCsv,
  parseManilaTimestamp,
} = require('./services/payrollAttendanceService')
const { payrollPeriodForMonth, validatePayrollPeriod } = require('./services/payrollScheduleService')
const { createPayrollService } = require('./services/payrollService')

test('15,000 monthly salary pays 7,500 per cutoff with all contributions on second cutoff', () => {
  const first = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    cutoff: 'first',
    includeContributions: true,
  })
  const second = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    cutoff: 'second',
    includeContributions: true,
  })

  assert.equal(first.grossSalary, 7500)
  assert.equal(first.employeeDeductions, 0)
  assert.equal(first.netPay, 7500)
  assert.deepEqual(
    [second.employeeSss, second.employeePhilhealth, second.employeePagibig],
    [750, 375, 200]
  )
  assert.equal(second.employeeDeductions, 1325)
  assert.equal(second.netPay, 6175)
  assert.equal(second.employerSss, 1500)
  assert.equal(second.employerEc, 30)
  assert.equal(second.employerPhilhealth, 375)
  assert.equal(second.employerPagibig, 200)
})

test('monthly COLA is a separate earning split across both cutoffs without changing basic pay', () => {
  const first = calculatePayrollLine({ monthlyBasicSalary: 15000, monthlyCola: 1000,
    cutoff: 'first', includeContributions: true })
  const second = calculatePayrollLine({ monthlyBasicSalary: 15000, monthlyCola: 1000,
    cutoff: 'second', includeContributions: true })
  assert.equal(first.grossSalary, 7500)
  assert.equal(first.colaPay, 500)
  assert.equal(first.netPay, 8000)
  assert.equal(second.colaPay, 500)
  assert.equal(second.employeeDeductions, 1325)
  assert.equal(second.netPay, 6675)
  const oddCentFirst = calculatePayrollLine({ monthlyBasicSalary: 15000, monthlyCola: 1000.01, cutoff: 'first' })
  const oddCentSecond = calculatePayrollLine({ monthlyBasicSalary: 15000, monthlyCola: 1000.01, cutoff: 'second' })
  assert.equal(oddCentFirst.colaPay + oddCentSecond.colaPay, 1000.01)
})

test('perfect attendance across scheduled weekdays keeps full semi-monthly basic pay', () => {
  const workdays = listWeekdays('2026-09-11', '2026-09-25')
  assert.equal(workdays.length, 11)
  assert.ok(workdays.every((day) => ![0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())))
  const attendance = workdays.map((date) => ({ date, status: 'present', lateMinutes: 0, undertimeMinutes: 0 }))
  const first = calculatePayrollLine({ monthlyBasicSalary: 15000, cutoff: 'first', attendance })
  const second = calculatePayrollLine({ monthlyBasicSalary: 15000, cutoff: 'second', includeContributions: true, attendance })
  assert.equal(first.grossSalary, 7500)
  assert.equal(first.netPay, 7500)
  assert.equal(second.grossSalary, 7500)
  assert.equal(second.absenceDeduction, 0)
  assert.equal(second.lateDeduction, 0)
  assert.equal(second.undertimeDeduction, 0)
  assert.equal(second.netPay, 6175)
})

test('database DATE values keep the Manila workdate, not the previous UTC day', () => {
  assert.equal(dateKey(new Date('2026-10-11T16:00:00.000Z')), '2026-10-12')
  assert.equal(dateKey(new Date('2026-10-12T00:00:00.000Z')), '2026-10-12')
})

test('contribution bases honor SSS brackets and PhilHealth/Pag-IBIG caps', () => {
  assert.equal(getSssMonthlySalaryCredit(15000), 15000)
  assert.equal(getSssMonthlySalaryCredit(15250), 15500)
  assert.equal(getSssMonthlySalaryCredit(90000), 35000)
  assert.deepEqual(
    [calculateContributions(1000).philHealthEmployee, calculateContributions(1000).pagIbigEmployee],
    [250, 10]
  )
  assert.deepEqual(
    [calculateContributions(150000).philHealthEmployee, calculateContributions(150000).pagIbigEmployee],
    [2500, 200]
  )
})

test('workbook SSS lookup includes both cutoff net basics and overtime, but not WSH/RD premium', () => {
  const assessment = calculateSssAssessablePay({ firstCutoffPay: 7500, grossSalary: 7500,
    manualEarnings: [
      { type: 'holiday_premium', amount: 206.90 },
      { type: 'overtime', amount: 582.76 },
    ] })
  assert.deepEqual(assessment, { firstCutoffPay: 7500, secondCutoffNetBasic: 7500,
    overtimePay: 582.76, monthlyCompensation: 15582.76 })
  const contributions = calculateContributions(15000, { sssCompensation: assessment.monthlyCompensation })
  assert.equal(contributions.sssMsc, 15500)
  assert.equal(contributions.sssEmployee, 775)
  assert.equal(contributions.philHealthEmployee, 375)
  assert.equal(contributions.pagIbigEmployee, 200)
})

test('month-end draft uses saved first-cutoff eligible pay for the SSS bracket', async () => {
  const run = { id: 3, period_start: '2026-09-11', period_end: '2026-09-25',
    payday: '2026-09-30', status: 'draft', cutoff: 'second' }
  let insertedLine
  const service = createPayrollService({ db: { async query(sql, params = []) {
    const fixture=reviewFixture(sql);if(fixture)return fixture
    if (sql.includes('SELECT * FROM payroll_runs WHERE period_start')) return { rows: [] }
    if (sql.includes('FROM employees employee')) return { rows: [{ employee_id: 12,
      employee_code: 'IT-12', first_name: 'Sample', last_name: 'Employee', profile_id: 1,
      monthly_basic_salary: '15000', monthly_cola: '1000', daily_fare_rate: '0', unpaid_break_minutes: 60,
      daily_rate_divisor: 261, workdays: [1, 2, 3, 4, 5], effective_from: '2026-01-01' }] }
    if (sql.includes('FROM payroll_run_lines line JOIN payroll_runs run')) {
      assert.equal(params[0], '2026-09-10')
      return { rows: [{ employee_id: 12, gross_salary: '7500', absence_deduction: '0',
        late_deduction: '0', undertime_deduction: '0', first_cutoff_status: 'approved',
        details: { manualEarnings: [{ type: 'overtime', amount: 600 }] } }] }
    }
    if (sql.includes('INSERT INTO payroll_runs')) return { rows: [run] }
    if (sql.includes('INSERT INTO payroll_run_lines')) { insertedLine = params; return { rows: [] } }
    if (sql.includes('INSERT INTO payroll_run_events')) return { rows: [] }
    if (sql.includes('SELECT * FROM payroll_runs WHERE id')) return { rows: [run] }
    if (sql.includes('SELECT * FROM payroll_run_lines WHERE payroll_run_id')) return { rows: [] }
    if (sql.includes('SELECT * FROM payroll_run_events')) return { rows: [] }
    if (sql.includes('FROM payroll_payments') || sql.includes('FROM payroll_daily_attendance') || sql.includes('FROM payroll_attendance_import_errors'))return {rows:[]}
    throw new Error(`Unexpected query: ${sql}`)
  } } })
  await service.previewRun({ periodStart: run.period_start, periodEnd: run.period_end,
    payday: run.payday, cutoff: 'second', includeContributions: true,attendanceBatchId:7 })
  assert.equal(insertedLine[16], 775)
  assert.equal(insertedLine[26], 500)
  const details = JSON.parse(insertedLine[25])
  assert.equal(details.sssAssessment.firstCutoffPay, 8100)
  assert.equal(details.sssAssessment.firstCutoffSource, 'saved-first-cutoff-approved')
  assert.equal(details.sssAssessment.monthlyCompensation, 15600)
})

test('workbook salary deduction combines lateness and undertime at the 261-day rate', () => {
  const result = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    cutoff: 'first',
    attendance: [
      { status: 'absent' },
      { status: 'present', lateMinutes: 10, undertimeMinutes: 60 },
      { status: 'exception', lateMinutes: 500, undertimeMinutes: 500 },
    ],
  })

  assert.equal(result.absenceDeduction, 689.66)
  assert.equal(result.lateMinutes, 10)
  assert.equal(result.lateDeduction, 14.37)
  assert.equal(result.undertimeDeduction, 86.2)
  // The workbook keeps the daily rate at full precision in MASTERFILE, then
  // rounds the combined late + undertime deduction only at the final step.
  const workbookTimeDeduction = Math.round((((10 + 60) / 60) * (15000 * 12 / 261) / 8) * 100) / 100
  assert.equal(Math.round((result.lateDeduction + result.undertimeDeduction) * 100) / 100, workbookTimeDeduction)
  assert.equal(result.weeklyFareAllowance, 0)
  assert.equal(result.netPay, 6709.77)
  assert.equal(result.thirteenthMonthAccrual, 567.53)
})

test('salaried special-holiday day adds only 30% premium while overtime uses 130% x 130%', () => {
  const earnings = calculateWorkedSpecialHoliday({ monthlyBasicSalary: 15000, workedDays: 1, overtimeHours: 4 })
  assert.deepEqual(earnings, { holidayPremium: 206.90, overtimePay: 582.76, total: 789.66 })
  const sevenHours = calculateWorkedSpecialHoliday({ monthlyBasicSalary: 15000, workedHours: 7, overtimeHours: 4 })
  assert.deepEqual(sevenHours, { holidayPremium: 181.03, overtimePay: 582.76, total: 763.79 })
  assert.equal(calculateWorkedSpecialHoliday({ monthlyBasicSalary: 15000, dailyRate: 700,
    workedHours: 7 }).holidayPremium, 183.75)
  assert.throws(() => calculateWorkedSpecialHoliday({ monthlyBasicSalary: 15000, workedDays: 0, overtimeHours: 4 }), /invalid/)
})

test('HR first-cutoff override records its reason and recalculates SSS and net pay', async () => {
  const state = { id: 8, employee_id: 12, employee_code: 'IT-12', status: 'draft', cutoff: 'second',
    include_contributions: true, monthly_basic_salary: '15000', gross_salary: '7500', cola_pay: '0',
    absence_deduction: '0', late_deduction: '0', undertime_deduction: '0', employee_sss: '750',
    employee_philhealth: '375', employee_pagibig: '200', net_pay: '6175',
    details: { manualEarnings: [], charges: [], sssAssessment: { firstCutoffPay: 7500,
      firstCutoffSource: 'assumed-half-basic' } } }
  let event
  const service = createPayrollService({ db: { async query(sql, params = []) {
    if (sql.includes('SELECT line.*, run.status')) return { rows: [{ ...state }] }
    if (sql.includes('UPDATE payroll_run_lines SET details')) {
      Object.assign(state, { details: JSON.parse(params[0]), net_pay: params[1], employee_sss: params[2],
        employer_sss: params[3], employer_ec: params[4] })
      return { rows: [{ ...state }] }
    }
    if (sql.includes('INSERT INTO payroll_run_events')) { event = JSON.parse(params[5]); return { rows: [] } }
    if (sql.includes('INSERT INTO audit_logs')) return { rows: [] }
    throw new Error(`Unexpected query: ${sql}`)
  } } })
  const updated = await service.overrideFirstCutoffPay(4, 8, 8000, 'Confirmed from HR register', { id: 1, role: 'hr' })
  assert.equal(updated.employee_sss, 775)
  assert.equal(updated.net_pay, 6150)
  assert.equal(updated.details.sssAssessment.firstCutoffSource, 'hr-override')
  assert.equal(updated.details.sssAssessment.overrideReason, 'Confirmed from HR register')
  assert.equal(event.previousPay, 7500)
  assert.equal(event.firstCutoffPay, 8000)
  await assert.rejects(service.overrideFirstCutoffPay(4, 8, 8500, '  '), { statusCode: 400 })
})

test('late minutes never add travel fare to salary payroll', () => {
  const result = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    attendance: [
      { status: 'present', lateMinutes: 10 },
    ],
  })

  assert.equal(result.weeklyFareAllowance, 0)
  assert.equal(result.lateDeduction, 14.37)
  assert.equal(result.netPay, 7485.63)
  assert.equal(result.thirteenthMonthAccrual, 625)
})

test('only Monday-Friday attendance dates are counted within a calendar cutoff', () => {
  assert.equal(listWeekdays('2026-09-11', '2026-09-25').length, 11)
  const dates = listWeekdays('2026-10-11', '2026-10-25')
  assert.equal(dates.length, 10)
  assert.equal(dates[0], '2026-10-12')
  assert.equal(dates.at(-1), '2026-10-23')
  assert.equal(computeDailyAttendance({
    date: '2026-10-11',
    profile: { workdays: [1, 2, 3, 4, 5] },
  }), null)
  const payroll = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    attendance: [
      { date: '2026-10-11', status: 'absent' },
      { date: '2026-10-12', status: 'absent' },
    ],
  })
  assert.equal(payroll.absenceDays, 1)
  assert.equal(payroll.absenceDeduction, 689.66)
  assert.equal(calculatePayrollLine({ monthlyBasicSalary: 15000 }).dailyRate, 689.66)
})

test('a worked half-day is represented as 240 undertime minutes', () => {
  const result = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    cutoff: 'first',
    attendance: [{ status: 'present', lateMinutes: 0, undertimeMinutes: 240 }],
  })

  assert.equal(result.undertimeMinutes, 240)
  assert.equal(result.undertimeDeduction, 344.83)
  assert.equal(result.weeklyFareAllowance, 0)
  assert.equal(result.netPay, 7155.17)
})

test('approved paid and partially paid leave keep leave from becoming an absence', () => {
  const result = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    attendance: [
      { status: 'paid_leave' },
      { status: 'unpaid_leave' },
      { status: 'partial_leave', leaveDeductionFraction: 0.5 },
    ],
  })

  assert.equal(result.paidLeaveDays, 1)
  assert.equal(result.unpaidLeaveDays, 1.5)
  assert.equal(result.absenceDeduction, 1034.48)
  assert.equal(result.weeklyFareAllowance, 0)
})

test('CSV parser accepts aliases and preserves raw columns', () => {
  const [row] = parseAttendanceCsv('Employee ID,Date,Time,Device\nA-17,2026-09-21,09:00:00,Front Door')
  assert.equal(row.employeeCode, 'A-17')
  assert.equal(row.timestamp, '2026-09-21 09:00:00')
  assert.equal(row.raw.Device, 'Front Door')
  assert.equal(row.identifierType, 'employee_code')
  assert.equal(row.eventType, null)
})

test('biometric CSV maps counterintuitive door labels and two-digit local dates', () => {
  const rows = parseAttendanceCsv([
    'Person ID,Name,Time,Attendance Check Point',
    "'00000042,Example Person,09/01/26 8:46,Main_Door_Out_Door1_Entrance Card Reader1",
    "'00000042,Example Person,09/01/26 18:15,Main_Door_IN_Door1_Entrance Card Reader1",
    "'00000042,Example Person,09/01/26 12:00,New Bio_New Office Biometrics_Entrance Card Reader1",
  ].join('\n'))
  assert.equal(rows[0].employeeCode, '00000042')
  assert.equal(rows[0].identifierType, 'person_id')
  assert.deepEqual(rows.map((row) => row.eventType), ['in', 'out', 'boundary'])
  assert.equal(parseManilaTimestamp(rows[0].timestamp).toISOString(), '2026-09-01T00:46:00.000Z')
  assert.throws(() => parseManilaTimestamp('02/30/26 09:00'), /Invalid Manila timestamp/)
})

test('timezone-less timestamps use Asia/Manila local time', () => {
  const timestamp = parseManilaTimestamp('2026-09-21 09:00:00')
  assert.equal(timestamp.toISOString(), '2026-09-21T01:00:00.000Z')
})

test('biometric CSV decoding preserves names from Windows-1252 and UTF-8 exports', () => {
  const csv = 'Person ID,Name,Time\n42,CG CAÑETE,09/01/26 09:00'
  assert.equal(parseAttendanceCsv(decodeAttendanceCsv(Buffer.from(csv, 'latin1')))[0].raw.Name, 'CG CAÑETE')
  assert.equal(parseAttendanceCsv(decodeAttendanceCsv(Buffer.from('\uFEFF' + csv, 'utf8')))[0].raw.Name, 'CG CAÑETE')
})

test('New Bio extends daily endpoints while intermediate scans have no effect', () => {
  const event = (time, eventType) => ({ occurredAt: parseManilaTimestamp(`09/01/26 ${time}`), eventType })
  const doors = [event('9:10', 'in'), event('17:30', 'out')]
  const compute = events => computeDailyAttendance({ date: '2026-09-01', events })
  const base = compute(doors)
  const interior = compute([...doors, event('12:00', 'boundary'), event('14:00', 'boundary')])
  for (const key of ['firstScanAt', 'lastScanAt', 'lateMinutes', 'undertimeMinutes', 'status']) assert.equal(interior[key], base[key])
  const endpoints = compute([...doors, event('8:40', 'boundary'), event('18:15', 'boundary'), event('12:00', 'boundary')])
  assert.equal(endpoints.firstScanAt, '2026-09-01T00:40:00.000Z')
  assert.equal(endpoints.lastScanAt, '2026-09-01T10:15:00.000Z')
  assert.equal(endpoints.lateMinutes, 0)
  assert.equal(endpoints.undertimeMinutes, 0)
  assert.equal(endpoints.status, 'present')
  assert.equal(compute([event('9:00', 'boundary'), event('9:00', 'boundary')]).status, 'exception')
  assert.equal(compute([event('9:00', 'boundary'), event('18:00', 'boundary')]).status, 'present')
  const mixed = compute([event('8:40', 'boundary'), event('18:00', 'out'), event('19:00', 'ignored')])
  assert.equal(mixed.firstScanAt, '2026-09-01T00:40:00.000Z')
  assert.equal(mixed.lastScanAt, '2026-09-01T10:00:00.000Z')
})

test('daily attendance uses first mapped in and last mapped out; incomplete days need HR review', () => {
  const profile = { workdays: [1, 2, 3, 4, 5], work_start_time: '09:00', work_end_time: '18:00' }
  const present = computeDailyAttendance({
    date: '2026-09-21',
    profile,
    events: [
      { occurredAt: parseManilaTimestamp('2026-09-21 17:00:00') },
      { occurredAt: parseManilaTimestamp('2026-09-21 09:10:00') },
      { occurredAt: parseManilaTimestamp('2026-09-21 13:00:00') },
    ],
  })
  const exception = computeDailyAttendance({
    date: '2026-09-22',
    profile,
    events: [{ occurredAt: parseManilaTimestamp('2026-09-22 09:02:00') }],
  })
  const noScans = computeDailyAttendance({ date: '2026-09-23', profile })

  assert.equal(present.status, 'present')
  assert.equal(present.lateMinutes, 10)
  assert.equal(present.undertimeMinutes, 60)
  assert.equal(exception.status, 'exception')
  assert.equal(exception.exceptionReason, 'Only one scan was recorded for this workday')
  assert.equal(noScans.status, 'exception')
  assert.match(noScans.exceptionReason, /No biometric scans/)
})

test('door labels, intermediate scans, and the unpaid 13:00–14:00 lunch are respected', () => {
  const profile = { workdays: [1, 2, 3, 4, 5], work_start_time: '09:00', work_end_time: '18:00', unpaid_break_minutes: 60 }
  const event = (time, eventType) => ({ occurredAt: parseManilaTimestamp(`09/01/26 ${time}`), eventType })
  const full = computeDailyAttendance({
    date: '2026-09-01', profile,
    events: [event('8:46', 'in'), event('12:00', 'ignored'), event('13:03', 'in'), event('13:04', 'out'), event('18:15', 'out')],
  })
  assert.equal(full.status, 'present')
  assert.equal(full.firstScanAt, '2026-09-01T00:46:00.000Z')
  assert.equal(full.lastScanAt, '2026-09-01T10:15:00.000Z')
  assert.equal(full.lateMinutes, 0)
  assert.equal(full.undertimeMinutes, 0)

  const half = computeDailyAttendance({ date: '2026-09-01', profile, events: [event('9:10', 'in'), event('13:30', 'out')] })
  assert.equal(half.lateMinutes, 10)
  assert.equal(half.undertimeMinutes, 240)
  const missingOut = computeDailyAttendance({ date: '2026-09-01', profile, events: [event('9:10', 'in'), event('18:30', 'ignored')] })
  assert.equal(missingOut.status, 'exception')
  assert.equal(missingOut.lastScanAt, null)
  assert.match(missingOut.exceptionReason, /No recognized time-out/)
})

test('duplicate scans do not turn a single door event into a complete attendance day', () => {
  const occurredAt = parseManilaTimestamp('2026-09-21 09:00:00')
  const result = computeDailyAttendance({
    date: '2026-09-21',
    profile: { workdays: [1, 2, 3, 4, 5], work_start_time: '09:00', work_end_time: '18:00' },
    events: [{ occurredAt }, { occurredAt }],
  })

  assert.equal(result.status, 'exception')
  assert.equal(result.scanCount, 1)
})

test('biometric import uses HR Person ID mapping and flags an unmapped ID', async () => {
  const insertedEvents = []
  const insertedDays = []
  const importErrors = []
  const batch = { id: 7, period_start: '2026-09-21', period_end: '2026-09-21', row_count: 0, error_count: 0 }
  const db = {
    async query(sql, params = []) {
      if (sql.includes('INSERT INTO payroll_attendance_import_batches')) return { rows: [batch] }
      if (sql.includes('FROM employees employee') && sql.includes('payroll_biometric_identities')) {
        return { rows: [{ id: 3, employee_code: 'APP-3', biometric_person_id: '00000042' }] }
      }
      if (sql.includes('FROM payroll_employee_profiles profile')) {
        return { rows: [{ employee_id: 3, effective_from: '2026-09-01', effective_to: null,
          monthly_basic_salary: 15000, daily_fare_rate: 0, unpaid_break_minutes: 60,
          daily_rate_divisor: 261, workdays: [1, 2, 3, 4, 5], work_start_time: '09:00', work_end_time: '18:00' }] }
      }
      if (sql.includes('FROM philippine_holidays') || sql.includes('FROM leave_requests')) return { rows: [] }
      if (sql.includes('INSERT INTO payroll_attendance_events')) {
        insertedEvents.push(params)
        return { rows: [{ occurred_at: params[4] }] }
      }
      if (sql.includes('INSERT INTO payroll_attendance_import_errors')) {
        importErrors.push(params)
        return { rows: [] }
      }
      if (sql.includes('INSERT INTO payroll_daily_attendance')) {
        insertedDays.push(params)
        return { rows: [] }
      }
      if (sql.includes('UPDATE payroll_attendance_import_batches')) {
        batch.row_count = params[1]
        batch.error_count = params[2]
        return { rows: [] }
      }
      if (sql.includes('SELECT * FROM payroll_attendance_import_batches')) return { rows: [batch] }
      if (sql.includes('FROM payroll_daily_attendance daily') || sql.includes('FROM payroll_attendance_corrections')) return { rows: [] }
      if (sql.includes('FROM payroll_attendance_import_errors')) return { rows: [] }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  const service = createPayrollService({ db })
  const result = await service.importAttendance({
    periodStart: '2026-09-21', periodEnd: '2026-09-21',
    csvText: [
      'Person ID,Time,Attendance Check Point',
      "'00000042,09/21/26 08:40,New Bio_New Office Biometrics_Entrance Card Reader1",
      "'00000042,09/21/26 18:30,New Bio_New Office Biometrics_Entrance Card Reader1",
      "'00000999,09/21/26 09:00,New Bio_New Office Biometrics_Entrance Card Reader1",
    ].join('\n'),
  })

  assert.equal(result.error_count, 1)
  assert.equal(importErrors.length, 1)
  assert.match(importErrors[0][3], /not mapped/)
  assert.deepEqual(insertedEvents.map((event) => event[2]), [3, 3, null])
  assert.equal(insertedDays.length, 1)
  assert.equal(insertedDays[0][1], 3)
  assert.equal(insertedDays[0][3], 'present')
  assert.equal(insertedDays[0][7], 0)
  assert.equal(insertedDays[0][8], 0)
})

test('a CSV with no scheduled weekday scans rejects import before creating a batch', async () => {
  let queryCount = 0
  const service = createPayrollService({ db: { async query() { queryCount += 1; return { rows: [] } } } })
  await assert.rejects(service.importAttendance({
    periodStart: '2026-10-11', periodEnd: '2026-10-25',
    csvText: 'Person ID,Time,Attendance Check Point\n\'00000042,09/21/26 08:40,Main_Door_Out_Door1_Entrance Card Reader1',
  }), /no recognized scans on scheduled weekdays/i)
  assert.equal(queryCount, 0)
})

test('10th and 25th cutoffs yield the correct cross-month periods and February payday', () => {
  assert.deepEqual(payrollPeriodForMonth('2026-10', 'first'), {
    periodStart: '2026-09-26', periodEnd: '2026-10-10', suggestedPayday: '2026-10-15',
  })
  assert.deepEqual(payrollPeriodForMonth('2027-02', 'second'), {
    periodStart: '2027-02-11', periodEnd: '2027-02-25', suggestedPayday: '2027-02-28',
  })
  assert.equal(payrollPeriodForMonth('2028-02', 'second').suggestedPayday, '2028-02-29')
  assert.throws(() => validatePayrollPeriod('2026-10-01', '2026-10-10', 'first'), /covers 2026-09-26 through 2026-10-10/)
})

test('unfinished payroll cannot be approved by default', async () => {
  const service = createPayrollService({ db: { query: () => { throw new Error('Database should not be called') } } })
  await assert.rejects(service.approveRun(1), { statusCode: 403 })
})

test('approval rejects saved full-holiday-pay lines before updating the run', async () => {
  const previous = process.env.PAYROLL_FINALIZATION_ENABLED
  process.env.PAYROLL_FINALIZATION_ENABLED = 'true'
  const queries = []
  const service = createPayrollService({ db: {
    async query(sql) {
      queries.push(sql)
      const fixture=reviewFixture(sql);if(fixture)return fixture
      if (sql.includes('FROM payroll_runs')) return { rows: [{ id: 1, status: 'draft', attendance_batch_id: 7,
        rule_snapshot:{attendanceContextHash:confirmedBatch.context_hash,attendanceReviewVersion:2},period_start: '2026-09-11', period_end: '2026-09-25' }] }
      if (sql.includes('FROM payroll_attendance_import_batches')) return { rows: [{ error_count: 0 }] }
      if (sql.includes('FROM payroll_daily_attendance')) return { rows: [{ count: 0 }] }
      if (sql.includes('FROM payroll_run_lines')) return { rows: [{ '?column?': 1 }] }
      throw new Error(`Unexpected query: ${sql}`)
    },
  } })
  try {
    await assert.rejects(service.approveRun(1), /Replace legacy full-holiday-pay earnings/)
    assert.equal(queries.some((sql) => sql.includes('UPDATE payroll_runs')), false)
  } finally {
    if (previous === undefined) delete process.env.PAYROLL_FINALIZATION_ENABLED
    else process.env.PAYROLL_FINALIZATION_ENABLED = previous
  }
})

test('month-end approval rejects an unverified first-cutoff estimate', async () => {
  const previous = process.env.PAYROLL_FINALIZATION_ENABLED
  process.env.PAYROLL_FINALIZATION_ENABLED = 'true'
  let updated = false
  const service = createPayrollService({ db: { async query(sql) {
    const fixture=reviewFixture(sql);if(fixture)return fixture
    if (sql.includes('FROM payroll_runs')) return { rows: [{ id: 1, status: 'draft', cutoff: 'second',
      rule_snapshot:{attendanceContextHash:confirmedBatch.context_hash,attendanceReviewVersion:2},include_contributions: true, attendance_batch_id: 7, period_start: '2026-09-11', period_end: '2026-09-25' }] }
    if(sql.includes("details->'payBasisReview'"))return {rows:[]}
    if (sql.includes('FROM payroll_attendance_import_batches')) return { rows: [{ error_count: 0 }] }
    if (sql.includes('FROM payroll_daily_attendance')) return { rows: [{ count: 0 }] }
    if (sql.includes('SELECT 1 FROM payroll_run_lines')) return { rows: [] }
    if (sql.includes('SELECT employee_code FROM payroll_run_lines')) return { rows: [{ employee_code: 'IT-12' }] }
    if (sql.includes('UPDATE payroll_runs')) updated = true
    throw new Error(`Unexpected query: ${sql}`)
  } } })
  try {
    await assert.rejects(service.approveRun(1), /Confirm the 15th payroll amount for IT-12/)
    assert.equal(updated, false)
  } finally {
    if (previous === undefined) delete process.env.PAYROLL_FINALIZATION_ENABLED
    else process.env.PAYROLL_FINALIZATION_ENABLED = previous
  }
})

test('saved draft earnings cannot retain the old full-holiday-pay type', async () => {
  const service = createPayrollService({ db: { query: () => { throw new Error('Database should not be called') } } })
  await assert.rejects(service.updateManualEarnings(1, 2, [
    { type: 'special_holiday_pay', amount: 896.55, note: 'Old holiday calculation' },
  ]), /Remove legacy full-holiday-pay lines/)
})
