const { dateKey, addDays, minutesOnWorkDate } = require('./payrollAttendanceService')
const { shiftWindow } = require('./payrollShiftService')

const round = value => Math.round((value + Number.EPSILON) * 100) / 100
function effectiveEarnings(details = {}, manualEarnings = details.manualEarnings || []) {
  details = details || {}
  const overridden = new Set(manualEarnings.map(entry => entry.type))
  return [...(details.automaticEarnings || []).filter(entry => !overridden.has(entry.type)), ...manualEarnings]
}

function calculateNightDifferential({ attendance = [], profiles = [], employeeId, fallbackProfile = {}, holidays = [] }) {
  const holidayDates = new Set(holidays.map(h => dateKey(h.holiday_date)))
  const days = [], review = []
  let total = 0, paidMinutes = 0
  for (const day of attendance) {
    const date = dateKey(day.work_date ?? day.date)
    const profile = profiles.filter(p => Number(p.employee_id) === Number(employeeId) && dateKey(p.effective_from) <= date && (!p.effective_to || dateKey(p.effective_to) >= date))
      .sort((a, b) => dateKey(b.effective_from).localeCompare(dateKey(a.effective_from)))[0] || fallbackProfile
    const shift = shiftWindow(profile)
    if (day.status !== 'present') continue // Paid leave does not imply actual night work.
    const first = day.first_scan_at ?? day.firstScanAt, last = day.last_scan_at ?? day.lastScanAt
    const windows = [[0, 360], [1320, 1800], [2760, 3240]]
    const scheduledNight = shift.segments.some(([a, b]) => windows.some(([c, d]) => Math.min(b, d) > Math.max(a, c)))
    if (!first || !last) {
      if (scheduledNight) review.push({ date, reason: 'Work was verified without actual punches; HR must verify night hours and enter the total night differential override' })
      continue
    }
    const from = minutesOnWorkDate(first, date), to = minutesOnWorkDate(last, date)
    let minutes = 0, holidayMinutes = 0
    for (const [start, end] of shift.segments) {
      for (const [nightStart, nightEnd] of windows) {
        const a = Math.max(from, start, nightStart), b = Math.min(to, end, nightEnd)
        if (b <= a) continue
        minutes += b - a
        for (let offset = 0; offset <= 1; offset += 1) {
          if (holidayDates.has(addDays(date, offset))) holidayMinutes += Math.max(0, Math.min(b, (offset + 1) * 1440) - Math.max(a, offset * 1440))
        }
      }
    }
    const actualNightMinutes = windows.reduce((sum, [a,b]) => sum + Math.max(0, Math.min(to,b) - Math.max(from,a)), 0)
    const breakNightMinutes = windows.reduce((sum, [a,b]) => sum + Math.max(0, Math.min(to,shift.breakEnd,b) - Math.max(from,shift.breakStart,a)), 0)
    if (actualNightMinutes > minutes + breakNightMinutes + 0.01) review.push({date,reason:'Night punches extend outside scheduled paid hours; HR must verify approved overtime and enter the total night differential override'})
    const hourlyRate = Number(profile.monthly_basic_salary ?? profile.monthlyBasicSalary) * 12 / Number(profile.daily_rate_divisor ?? 261) / 8
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) throw new TypeError('Night differential requires a valid basic salary')
    const amount = minutes / 60 * hourlyRate * 0.10
    if (holidayMinutes > 0) review.push({ date, reason: 'Night work overlaps a holiday; HR must verify the holiday multiplier and enter the total night differential override' })
    paidMinutes += minutes; total += amount
    if (minutes > 0) days.push({ date, paidMinutes: round(minutes), hourlyRate, amount: round(amount), firstScanAt: first, lastScanAt: last, holidayMinutes: round(holidayMinutes) })
  }
  const amount = round(total), hours = round(paidMinutes / 60)
  return { automaticEarnings: amount > 0 ? [{ type: 'night_differential', amount,
    note: `${hours} paid night hours × basic hourly rate × 10% (10 PM–6 AM; unpaid break excluded)` }] : [],
    nightDifferential: { rate: 0.10, window: '22:00–06:00', paidMinutes: round(paidMinutes), amount, days,
      reviewRequired: review.length > 0, review } }
}
module.exports = { calculateNightDifferential, effectiveEarnings }
