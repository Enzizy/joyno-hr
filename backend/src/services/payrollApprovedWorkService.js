const { dateKey } = require('./payrollAttendanceService')

// Approved overtime and special-holiday work recorded by HR on the attendance day.
// Multipliers follow FOR TESTING.xlsm TIMEKEEPING / PAYROLL REGISTER:
//   regular-day OT = hourly x 125% x hours (register K: daily/8*1.25*P)
//   WSH/RD OT      = hourly x 130% x 130% x hours (TIMEKEEPING S: hrs*1.3*1.3)
//   WSH/RD premium = paid hours / 8 x daily x 30% (register P: 0.3 * days * daily);
//                    the monthly basic already pays the ordinary day.
const DAY_TYPES = Object.freeze({
  regular: { label: 'Regular workday', overtimeMultiplier: 1.25, premiumRate: 0 },
  special_holiday: { label: 'Special holiday / rest day (WSH/RD)', overtimeMultiplier: 1.3 * 1.3, premiumRate: 0.3 },
})
const MAX_OVERTIME_HOURS = 16
const round = value => Math.round((value + Number.EPSILON) * 100) / 100

function normalizeApprovedWork(decision = {}) {
  const dayType = decision.dayType == null || decision.dayType === '' ? 'regular' : String(decision.dayType)
  const raw = decision.overtimeHours
  const overtimeHours = raw == null || raw === '' ? 0 : Number(raw)
  if (!DAY_TYPES[dayType]) throw Object.assign(new Error('Choose a regular workday or a special holiday / rest day'), { statusCode: 400 })
  if (!Number.isFinite(overtimeHours) || overtimeHours < 0 || overtimeHours > MAX_OVERTIME_HOURS ||
      Math.abs(overtimeHours * 100 - Math.round(overtimeHours * 100)) > 0.000001) {
    throw Object.assign(new Error(`Approved overtime must be 0–${MAX_OVERTIME_HOURS} hours, with up to two decimals`), { statusCode: 400 })
  }
  return { dayType, overtimeHours }
}

function hasApprovedWork(decision) {
  const { dayType, overtimeHours } = normalizeApprovedWork(decision || {})
  return dayType !== 'regular' || overtimeHours > 0
}

// Paid hours actually worked inside the schedule: 8 less late and undertime.
// Work verified without punches counts as the full scheduled day.
function paidHoursWorked(day) {
  const missed = Number(day.late_minutes ?? day.lateMinutes ?? 0) + Number(day.undertime_minutes ?? day.undertimeMinutes ?? 0)
  return Math.max(0, 480 - missed) / 60
}

function profileForDate(profiles, employeeId, date, fallback) {
  return profiles.filter(p => Number(p.employee_id) === Number(employeeId) && dateKey(p.effective_from) <= date &&
    (!p.effective_to || dateKey(p.effective_to) >= date))
    .sort((a, b) => dateKey(b.effective_from).localeCompare(dateKey(a.effective_from)))[0] || fallback
}

function calculateApprovedWork({ attendance = [], profiles = [], employeeId, fallbackProfile = {} }) {
  let overtimePay = 0, premiumPay = 0, overtimeHours = 0, premiumHours = 0
  const days = []
  for (const day of attendance) {
    const decision = day.review_decision ?? day.reviewDecision
    if (!decision || day.status !== 'present' || !hasApprovedWork(decision)) continue
    const date = dateKey(day.work_date ?? day.date)
    const work = normalizeApprovedWork(decision)
    const rule = DAY_TYPES[work.dayType]
    const profile = profileForDate(profiles, employeeId, date, fallbackProfile)
    const dailyRate = Number(profile.monthly_basic_salary ?? profile.monthlyBasicSalary) * 12 / Number(profile.daily_rate_divisor ?? 261)
    if (!Number.isFinite(dailyRate) || dailyRate < 0) throw new TypeError('Approved overtime requires a valid basic salary')
    const hourlyRate = dailyRate / 8
    const paidHours = rule.premiumRate ? paidHoursWorked(day) : 0
    const dayOvertime = work.overtimeHours * hourlyRate * rule.overtimeMultiplier
    const dayPremium = paidHours / 8 * dailyRate * rule.premiumRate
    overtimePay += dayOvertime; premiumPay += dayPremium
    overtimeHours += work.overtimeHours; premiumHours += paidHours
    days.push({ date, dayType: work.dayType, overtimeHours: work.overtimeHours, premiumHours: round(paidHours),
      overtimeAmount: round(dayOvertime), premiumAmount: round(dayPremium), reason: decision.reason || null })
  }
  const overtime = round(overtimePay), premium = round(premiumPay)
  const automaticEarnings = [
    ...(overtime > 0 ? [{ type: 'overtime', amount: overtime,
      note: `${round(overtimeHours)} approved OT hours from attendance (regular day 125%, WSH/RD 169%)` }] : []),
    ...(premium > 0 ? [{ type: 'holiday_premium', amount: premium,
      note: `${round(premiumHours)} paid hours on special holiday / rest day × daily rate ÷ 8 × 30%` }] : []),
  ]
  return { automaticEarnings, approvedWork: { days, overtimeHours: round(overtimeHours), overtimeAmount: overtime,
    premiumHours: round(premiumHours), premiumAmount: premium } }
}

module.exports = { DAY_TYPES, MAX_OVERTIME_HOURS, calculateApprovedWork, hasApprovedWork, normalizeApprovedWork, paidHoursWorked }
