const test = require('node:test')
const assert = require('node:assert/strict')
const { calculateApprovedWork, normalizeApprovedWork } = require('./services/payrollApprovedWorkService')
const { reviewDecision } = require('./services/attendanceReviewService')

const profile = salary => ({ employee_id: 1, effective_from: '2026-01-01', monthly_basic_salary: String(salary), daily_rate_divisor: 261,
  work_start_time: '09:00', work_end_time: '18:00', unpaid_break_minutes: 60, workdays: [1, 2, 3, 4, 5] })
const day = (date, decision, extra = {}) => ({ work_date: date, status: 'present', late_minutes: 0, undertime_minutes: 0, review_decision: decision, ...extra })
const run = (salary, attendance) => calculateApprovedWork({ attendance, employeeId: 1, profiles: [profile(salary)] })

test('approved OT matches the workbook register for WSH/RD and regular-day hours', () => {
  // FOR TESTING.xlsm: Thompson 18,000/month, 4 OT hours on WSH/RD = 699.31
  const thompson = run(18000, [day('2026-09-11', { dayType: 'special_holiday', overtimeHours: 4 }, { late_minutes: 0 })])
  assert.equal(thompson.automaticEarnings.find(e => e.type === 'overtime').amount, 699.31)
  // Edwards 15,000/month: 11 regular OT hours + 6 WSH/RD OT hours = 2,059.48
  const edwards = run(15000, [day('2026-09-14', { overtimeHours: 11 }), day('2026-09-11', { dayType: 'special_holiday', overtimeHours: 6 })])
  assert.equal(edwards.automaticEarnings.find(e => e.type === 'overtime').amount, 2059.48)
  assert.equal(edwards.approvedWork.overtimeHours, 17)
})

test('the 30% WSH/RD premium uses paid hours actually worked', () => {
  // Anderson 20,000/month worked 7 of 8 paid hours (0.875 day) on WSH/RD = 241.38
  const anderson = run(20000, [day('2026-09-11', { dayType: 'special_holiday', overtimeHours: 0 }, { undertime_minutes: 60 })])
  assert.deepEqual(anderson.automaticEarnings, [{ type: 'holiday_premium', amount: 241.38, note: '7 paid hours on special holiday / rest day × daily rate ÷ 8 × 30%' }])
})

test('a full special-holiday day with 4 OT hours pays the premium and 169% overtime', () => {
  const result = run(15000, [day('2026-09-11', { dayType: 'special_holiday', overtimeHours: 4 })])
  assert.deepEqual(result.automaticEarnings.map(e => [e.type, e.amount]), [['overtime', 582.76], ['holiday_premium', 206.9]])
})

test('days without approved work, or not worked, add nothing', () => {
  const result = run(15000, [day('2026-09-14', { action: 'acknowledge' }), day('2026-09-15', null),
    { work_date: '2026-09-16', status: 'absent', review_decision: { overtimeHours: 3 } }])
  assert.deepEqual(result.automaticEarnings, [])
})

test('approved work input is validated', () => {
  assert.deepEqual(normalizeApprovedWork({}), { dayType: 'regular', overtimeHours: 0 })
  assert.throws(() => normalizeApprovedWork({ overtimeHours: -1 }), /0–16 hours/)
  assert.throws(() => normalizeApprovedWork({ overtimeHours: 2.333 }), /two decimals/)
  assert.throws(() => normalizeApprovedWork({ dayType: 'regular_holiday' }), /special holiday/)
})

test('HR records OT on the verified day, and cannot record it on an absence', () => {
  const base = { employee_id: 1, work_date: '2026-09-11', status: 'present', issue_codes: ['late_undertime'], first_scan_at: '2026-09-11T00:47:00.000Z',
    last_scan_at: '2026-09-11T06:33:00.000Z', late_minutes: 0, undertime_minutes: 207, profile: profile(15000) }
  // HR's note is optional; the history still says what was decided.
  const resolved = reviewDecision(base, { action: 'actual_times', timeIn: '08:47', timeOut: '22:00', dayType: 'special_holiday', overtimeHours: 4 }, { leaves: [] })
  assert.equal(resolved.correction_reason, 'Real times entered: 08:47–22:00 · special holiday / rest day · 4 h approved OT')
  assert.equal(reviewDecision(base, { action: 'acknowledge', reason: 'Company event' }, { leaves: [] }).correction_reason, 'Company event')
  assert.equal(resolved.undertime_minutes, 0)
  assert.equal(resolved.review_decision.dayType, 'special_holiday')
  assert.equal(resolved.review_decision.overtimeHours, 4)
  const empty = { ...base, status: 'exception', issue_codes: ['no_record'], first_scan_at: null, last_scan_at: null, undertime_minutes: 0 }
  assert.throws(() => reviewDecision(empty, { action: 'absent', overtimeHours: 2, reason: 'Absent' }, { leaves: [] }), /day the employee worked/)
})
