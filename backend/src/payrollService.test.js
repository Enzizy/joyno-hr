const test = require('node:test')
const assert = require('node:assert/strict')
const {
  calculateContributions,
  calculatePayrollLine,
  getSssMonthlySalaryCredit,
} = require('./services/payrollCalculationService')
const {
  computeDailyAttendance,
  parseAttendanceCsv,
  parseManilaTimestamp,
} = require('./services/payrollAttendanceService')
const { buildWeeklyFareSummary } = require('./services/payrollService')

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

test('attendance deductions use the 261 divisor and do not deduct salary for lateness', () => {
  const result = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    dailyFareRate: 100,
    cutoff: 'first',
    attendance: [
      { status: 'absent' },
      { status: 'present', lateMinutes: 10, undertimeMinutes: 60 },
      { status: 'exception', lateMinutes: 500, undertimeMinutes: 500 },
    ],
  })

  assert.equal(result.absenceDeduction, 689.66)
  assert.equal(result.undertimeDeduction, 86.21)
  assert.equal(result.weeklyFareAllowance, 50)
  assert.equal(result.netPay, 6724.13)
})

test('daily fare is reduced only for that day and is capped at zero', () => {
  const result = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    dailyFareRate: 100,
    attendance: [
      { status: 'present', lateMinutes: 0 },
      { status: 'present', lateMinutes: 10 },
      { status: 'present', lateMinutes: 21 },
      { status: 'absent', lateMinutes: 0 },
    ],
  })

  assert.equal(result.weeklyFareAllowance, 150)
  assert.equal(result.netPay, 6810.34)
})

test('a worked half-day is represented as 240 undertime minutes', () => {
  const result = calculatePayrollLine({
    monthlyBasicSalary: 15000,
    dailyFareRate: 100,
    cutoff: 'first',
    attendance: [{ status: 'present', lateMinutes: 0, undertimeMinutes: 240 }],
  })

  assert.equal(result.undertimeMinutes, 240)
  assert.equal(result.undertimeDeduction, 344.83)
  assert.equal(result.weeklyFareAllowance, 100)
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
})

test('timezone-less timestamps use Asia/Manila local time', () => {
  const timestamp = parseManilaTimestamp('2026-09-21 09:00:00')
  assert.equal(timestamp.toISOString(), '2026-09-21T01:00:00.000Z')
})

test('daily attendance uses first and last scans; a single scan requires HR review', () => {
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
  const absent = computeDailyAttendance({ date: '2026-09-23', profile })

  assert.equal(present.status, 'present')
  assert.equal(present.lateMinutes, 10)
  assert.equal(present.undertimeMinutes, 60)
  assert.equal(exception.status, 'exception')
  assert.equal(exception.exceptionReason, 'Only one scan was recorded for this workday')
  assert.equal(absent.status, 'absent')
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

test('weekly fare summary applies each day cap and keeps absences at zero', () => {
  const [summary] = buildWeeklyFareSummary([
    { work_date: '2026-09-21', employee_id: 1, employee_code: 'A-1', first_name: 'Ana', last_name: 'Dela Cruz', status: 'present', daily_fare_rate: 100, late_minutes: 0 },
    { work_date: '2026-09-22', employee_id: 1, employee_code: 'A-1', first_name: 'Ana', last_name: 'Dela Cruz', status: 'present', daily_fare_rate: 100, late_minutes: 10 },
    { work_date: '2026-09-23', employee_id: 1, employee_code: 'A-1', first_name: 'Ana', last_name: 'Dela Cruz', status: 'present', daily_fare_rate: 100, late_minutes: 25 },
    { work_date: '2026-09-24', employee_id: 1, employee_code: 'A-1', first_name: 'Ana', last_name: 'Dela Cruz', status: 'absent', daily_fare_rate: 100, late_minutes: 0 },
  ])

  assert.equal(summary.week_start, '2026-09-21')
  assert.equal(summary.week_end, '2026-09-25')
  assert.equal(summary.amount, 150)
})
