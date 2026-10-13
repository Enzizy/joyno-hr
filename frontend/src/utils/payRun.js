import { standardPeriod, matchingAttendanceReviews } from './payrollPeriods.js'
import { reviewScope, runScope } from './payrollScope.js'

// A pay run: confirm attendance, check and approve pay, then choose how payslips go out.
// Employee setup is shown on the Payroll page, so a pay run starts at Attendance.
export const PAY_RUN_STAGES = Object.freeze([
  { key: 'attendance', label: 'Attendance' },
  { key: 'review', label: 'Review & approve' },
  { key: 'payslips', label: 'Payslips' },
])

const validDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value

// A pay run is keyed by its standard payday: the 15th, or the month end (30th; Feb's last day).
export function periodForPayday(payday) {
  const key = String(payday || '')
  if (!validDateKey(key)) return null
  const month = key.slice(0, 7)
  const cutoff = Number(key.slice(8, 10)) <= 15 ? 'first' : 'second'
  const period = standardPeriod(month, cutoff)
  return period && period.payday === key ? { ...period, month, cutoff } : null
}

export function paydayForPeriodEnd(periodEnd) {
  const key = String(periodEnd || '').slice(0, 10)
  if (!validDateKey(key)) return null
  const day = Number(key.slice(8, 10))
  if (day === 10) return standardPeriod(key.slice(0, 7), 'first')?.payday ?? null
  if (day === 25) return standardPeriod(key.slice(0, 7), 'second')?.payday ?? null
  return null
}

// Standard paydays from `past` paydays before today through `future` paydays on or after today, newest first.
export function paydaysAround(todayKey, { past = 4, future = 1 } = {}) {
  const [year, month] = String(todayKey).slice(0, 7).split('-').map(Number)
  const all = []
  for (let offset = -Math.ceil(past / 2) - 1; offset <= Math.ceil(future / 2) + 1; offset += 1) {
    const monthKey = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7)
    for (const cutoff of ['first', 'second']) all.push(standardPeriod(monthKey, cutoff).payday)
  }
  const upcoming = all.filter(day => day >= todayKey).slice(0, future)
  const earlier = all.filter(day => day < todayKey).slice(-past)
  return [...earlier, ...upcoming].reverse()
}

export function nextPayday(todayKey) {
  return paydaysAround(todayKey, { past: 0, future: 1 })[0]
}

const sameDay = (a, b) => String(a || '').slice(0, 10) === b

export function runsForPeriod(runs, period, shift, practice) {
  if (!period) return []
  return (runs || []).filter(run => runScope(run) === shift && Boolean(run.rule_snapshot?.isTest) === practice &&
    sameDay(run.period_start, period.start) && sameDay(run.period_end, period.end))
    .sort((a, b) => Number(b.id) - Number(a.id))
}

export function reviewsForShift(reviews, shift, practice) {
  return (reviews || []).filter(review => reviewScope(review) === shift && Boolean(review.is_test ?? review.isTest) === practice)
}

export function attendanceForPeriod(reviews, period, shift, practice) {
  if (!period) return { confirmed: null, unfinished: null }
  const scoped = reviewsForShift(reviews, shift, practice)
  return {
    confirmed: matchingAttendanceReviews(scoped, period.start, period.end)[0] || null,
    unfinished: matchingAttendanceReviews(scoped, period.start, period.end, false)[0] || null,
  }
}

// A monthly salary below this is a placeholder (for example ₱0.01 while HR confirms the amount), not a real salary.
// The server applies the same rule when it checks attendance.
export const MINIMUM_MONTHLY_SALARY = 1000
export const hasSalary = profile => Number(profile?.monthly_basic_salary ?? profile?.monthly_basic ?? 0) >= MINIMUM_MONTHLY_SALARY

export function profileReady(profile) {
  return hasSalary(profile) &&
    Boolean(String(profile?.biometric_person_id || '').trim()) &&
    Boolean(profile?.work_start_time) && Boolean(profile?.work_end_time)
}

export function profileGaps(profile) {
  const gaps = []
  if (!hasSalary(profile)) gaps.push('Monthly salary')
  if (!String(profile?.biometric_person_id || '').trim()) gaps.push('Attendance ID')
  if (!profile?.work_start_time || !profile?.work_end_time) gaps.push('Schedule')
  return gaps
}

const newerUpload = (confirmed, unfinished) => Boolean(unfinished && (!confirmed || Number(unfinished.id) > Number(confirmed.id)))

// The run a pay run page shows. A practice run belongs to the attendance it was calculated from,
// so a newer practice upload for the same dates (for example, other people) starts a fresh practice run.
export function currentPayRun({ period, shift, practice = false, reviews = [], runs = [] }) {
  const latest = runsForPeriod(runs, period, shift, practice)[0] || null
  if (!latest || !practice) return latest
  const { confirmed, unfinished } = attendanceForPeriod(reviews, period, shift, practice)
  if (newerUpload(confirmed, unfinished)) return null
  const forConfirmed = runsForPeriod(runs, period, shift, practice).find(run => !run.attendance_batch_id || !confirmed || String(run.attendance_batch_id) === String(confirmed.id))
  return forConfirmed || null
}

// Each stage is done, todo (the next thing to act on) or locked (waiting on an earlier stage or a setting).
export function payRunStages({ period, shift, practice = false, reviews = [], runs = [], attendanceNeedsRecheck = false }) {
  const { confirmed, unfinished } = attendanceForPeriod(reviews, period, shift, practice)
  const run = currentPayRun({ period, shift, practice, reviews, runs })
  const status = String(run?.status || '')
  const finalized = ['approved', 'locked'].includes(status)
  const attendanceDone = (Boolean(confirmed) && !newerUpload(confirmed, unfinished) && !attendanceNeedsRecheck) || finalized
  // Attendance was reopened, corrected and confirmed again after this draft was calculated.
  const outdated = status === 'draft' && Boolean(confirmed) && String(run.attendance_batch_id) === String(confirmed.id) &&
    run.rule_snapshot?.attendanceReviewVersion != null && Number(run.rule_snapshot.attendanceReviewVersion) !== Number(confirmed.review_version)

  let attendance
  if (attendanceDone) attendance = { state: 'done', detail: 'Confirmed' }
  else if (attendanceNeedsRecheck) attendance = { state: 'todo', detail: 'Needs recheck' }
  else if (unfinished?.needs_reimport) attendance = { state: 'todo', detail: 'Re-upload file' }
  else if (unfinished) attendance = { state: 'todo', detail: unfinished.pending_days ? `${unfinished.pending_days} ${Number(unfinished.pending_days)===1?'day':'days'} to decide` : 'Ready to confirm' }
  else attendance = { state: 'todo', detail: 'Upload file' }

  let review
  if (finalized) review = { state: 'done', detail: 'Approved' }
  else if (status === 'draft' && !attendanceDone) review = { state: 'locked', detail: 'Outdated' }
  else if (outdated) review = { state: 'todo', detail: 'Recalculate pay' }
  else if (status === 'draft') review = { state: 'todo', detail: 'Draft to check' }
  else if (attendanceDone) review = { state: 'todo', detail: 'Calculate pay' }
  else review = { state: 'locked', detail: 'After attendance' }

  // Approval only freezes the amounts; releasing to My payslips (and emailing) is chosen on the Payslips step.
  let payslips
  if (status === 'locked') payslips = { state: 'done', detail: practice ? 'Finished' : 'Released' }
  else if (status === 'approved') payslips = { state: 'todo', detail: practice ? 'Ready to finish' : 'Ready to release' }
  else payslips = { state: 'locked', detail: 'After approval' }

  return PAY_RUN_STAGES.map((stage, index) => {
    const status = [attendance, review, payslips][index]
    return { ...stage, ...status, available: stage.key === 'attendance' ||
      (stage.key === 'review' && Boolean(run)) || status.state !== 'locked' }
  })
}

// The first stage with something to do; once everything is done, the last stage.
export function currentStageKey(stages) {
  return stages.find(stage => stage.state === 'todo')?.key || [...stages].reverse().find(stage => stage.state === 'done')?.key || 'attendance'
}

export function runSummary(stages) {
  if (stages.every(stage => stage.state === 'done')) {
    const finished = stages.find(stage => stage.key === 'payslips')?.detail
    return { label: finished === 'Finished' ? 'Practice finished' : 'Payslips released', tone: 'success' }
  }
  const attendance = stages.find(stage => stage.key === 'attendance')
  const review = stages.find(stage => stage.key === 'review')
  if (attendance.detail === 'Upload file' && review.state === 'locked') return { label: 'Not started', tone: 'neutral' }
  const stage = stages.find(item => item.key === currentStageKey(stages))
  return { label: `${stage.label} · ${stage.detail}`, tone: stage.state === 'locked' ? 'neutral' : 'warning' }
}

// How many people in each shift are set up to be paid, and who is not.
export function paydayReadiness(period, profilesByShift) {
  const result = {}
  for (const [shift, list] of Object.entries(profilesByShift || {})) {
    const ready = (list || []).filter(profileReady)
    result[shift] = { total: (list || []).length, ready: ready.length, notSetUp: (list || []).filter(p => !profileReady(p)) }
  }
  return result
}

// The Payroll page's payday timeline uses the same steps as a pay run.
export const PAYDAY_STEPS = Object.freeze(PAY_RUN_STAGES.map(stage => stage.label))
// Where a payday is in PAYDAY_STEPS (3 = done): the least advanced shift that has people to pay.
// Before the cutoff ends, attendance is the next step (it opens the day after).
export function paydayProgress({ period, today, stagesByShift = [] }) {
  if (today <= period.end) return 0
  const progress = stagesByShift.map(stages => {
    const state = key => stages.find(stage => stage.key === key)?.state
    if (state('attendance') !== 'done') return 0
    if (state('review') !== 'done') return 1
    return state('payslips') === 'done' ? 3 : 2
  })
  return progress.length ? Math.min(...progress) : 0
}
