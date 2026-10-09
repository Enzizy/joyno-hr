// Clock minutes are relative to the date the shift starts; overnight values
// extend beyond 1440. The company has a fixed one-hour unpaid meal break.
function clockMinutes(value) {
  const match = String(value).match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/)
  if (!match) throw new TypeError(`Invalid schedule time: ${value}`)
  return Number(match[1]) * 60 + Number(match[2])
}
function shiftDefaults(shift) {
  return String(shift).toLowerCase() === 'night'
    ? { work_start_time: '21:00', work_end_time: '06:00', unpaid_break_minutes: 60 }
    : { work_start_time: '09:00', work_end_time: '18:00', unpaid_break_minutes: 60 }
}
function shiftWindow(profile = {}) {
  const defaults = shiftDefaults(profile.shift)
  const start = clockMinutes(profile.work_start_time ?? profile.workStartTime ?? defaults.work_start_time)
  let end = clockMinutes(profile.work_end_time ?? profile.workEndTime ?? defaults.work_end_time)
  if (end === start) throw new TypeError('Work starts and ends must be different')
  const overnight = end < start
  if (overnight) end += 1440
  let breakStart = clockMinutes(profile.lunch_start_time ?? profile.lunchStartTime ?? (overnight ? '01:00' : '13:00'))
  if (overnight && breakStart < start) breakStart += 1440
  const breakMinutes = Number(profile.unpaid_break_minutes ?? profile.unpaidBreakMinutes ?? 60)
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) throw new TypeError('Invalid unpaid break')
  const breakEnd = breakStart + breakMinutes
  const segments = [[start, Math.min(Math.max(breakStart, start), end)], [Math.max(Math.min(breakEnd, end), start), end]]
  return { start, end, overnight, breakStart, breakEnd, segments,
    paidMinutes: segments.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0),
    // Midpoint of the off-duty gap assigns early arrivals/late departures to
    // one shift only, including the morning after the cutoff's final date.
    boundary: overnight ? (end - 1440 + start) / 2 : 0 }
}
function paidShiftOverlap(from, to, profile = {}) {
  return shiftWindow(profile).segments.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(to, end) - Math.max(from, start)), 0)
}
function coverageWindow(from, to, profile = {}) {
  const shift = shiftWindow(profile)
  if (shift.overnight && from < shift.start) from += 1440
  if (shift.overnight && to < shift.start) to += 1440
  return { from, to }
}
// Schedules pay 4 to 8 hours a day. An eight-hour day keeps its one-hour unpaid lunch inside the
// shift; a shorter day (for example a 7 PM–1 AM night) may run without one. Returns the problem, or null.
const MIN_PAID_MINUTES = 240
const FULL_DAY_MINUTES = 480
function scheduleProblem(profile = {}) {
  const window = shiftWindow(profile)
  const breakMinutes = Number(profile.unpaid_break_minutes ?? profile.unpaidBreakMinutes ?? 60)
  if (window.paidMinutes < MIN_PAID_MINUTES || window.paidMinutes > FULL_DAY_MINUTES) return 'Use a schedule with 4 to 8 paid hours'
  if (window.paidMinutes === FULL_DAY_MINUTES && (breakMinutes !== 60 || window.breakStart < window.start || window.breakEnd > window.end)) {
    return 'An eight-hour day needs its one-hour unpaid lunch inside the shift'
  }
  return null
}
// Paid minutes in a full scheduled day; eight hours when the schedule is unknown.
function scheduledPaidMinutes(profile) {
  if (!profile?.work_start_time && !profile?.workStartTime) return FULL_DAY_MINUTES
  try { return shiftWindow(profile).paidMinutes || FULL_DAY_MINUTES } catch { return FULL_DAY_MINUTES }
}
module.exports = { clockMinutes, shiftDefaults, shiftWindow, paidShiftOverlap, coverageWindow, scheduleProblem, scheduledPaidMinutes }
