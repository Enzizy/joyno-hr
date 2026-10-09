const { payrollEmployeeIncluded, normalizePayrollScope, attendancePayrollScope, attendanceReviewSettings, assertPracticeAllowed } = require('./payrollScopeService')
const { shiftWindow, shiftDefaults, paidShiftOverlap, coverageWindow, scheduleProblem, scheduledPaidMinutes } = require('./payrollShiftService')
const crypto = require('node:crypto')
const { normalizeApprovedWork } = require('./payrollApprovedWorkService')
const { parseAttendanceCsv, parseManilaTimestamp, manilaDateParts, dateKey, addDays,
  computeDailyAttendance, weekday, isAttendanceScan, attendanceWorkDate, minutesOnWorkDate, verifiedShiftTimestamp } = require('./payrollAttendanceService')

// A monthly salary below this is a placeholder (for example ₱0.01), so the employee is treated as not set up.
// The frontend's profileReady uses the same amount.
const MINIMUM_MONTHLY_SALARY = 1000
function fail(message, statusCode = 409) { throw Object.assign(new Error(message), { statusCode }) }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
function fingerprint(value) {
  // A salary/leave change in the other shift must not invalidate this shift's confirmed review.
  if (value?.payrollScope && value.employees && value.profiles && value.leaves) {
    const employees=value.employees.filter(e=>payrollEmployeeIncluded(e,value.profiles,value.payrollScope) && (!value.isTest || value.employeeIds.includes(Number(e.id))))
    const ids=new Set(employees.map(e=>Number(e.id)))
    value={...value,employees,profiles:value.profiles.filter(p=>ids.has(Number(p.employee_id))),leaves:value.leaves.filter(l=>ids.has(Number(l.employee_id)))}
  }
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
function validPeriod(start, end) {
  for (const value of [start, end]) {
    const parsed = new Date(`${value}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('Use valid YYYY-MM-DD dates', 400)
  }
  if (end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 61) fail('Select a period of 1–62 calendar days', 400)
}
function profileAt(profiles, id, date) {
  return profiles.filter(p => Number(p.employee_id) === Number(id) && p.effective_from <= date && (!p.effective_to || p.effective_to >= date))
    .sort((a,b) => b.effective_from.localeCompare(a.effective_from))[0]
}
function employed(employee, date) {
  return (!employee.date_hired || employee.date_hired <= date) && (!employee.last_working_date || date <= employee.last_working_date)
}
// A day off measured like a scheduled day, so hours worked on a rest day can be counted.
function withWorkday(profile, date) {
  const workdays = (profile?.workdays || [1,2,3,4,5]).map(Number)
  return workdays.includes(weekday(date)) ? profile : { ...profile, workdays: [...workdays, weekday(date)] }
}
function minutes(time) { const [h,m] = String(time).split(':').map(Number); return h * 60 + m }
function paidOverlap(from, to, profile) {
  const range = coverageWindow(from, to, profile)
  return paidShiftOverlap(range.from, range.to, profile)
}

function buildAttendancePreview({ csvText, periodStart, periodEnd }, context) {
  validPeriod(periodStart, periodEnd)
  const records = parseAttendanceCsv(csvText), groups = new Map(), issues = [], scanDates = new Set()
  const byPerson = new Map(context.employees.filter(e => e.person_id).map(e => [e.person_id, e]))
  const byCode = new Map(context.employees.map(e => [String(e.employee_code).toLowerCase(), e]))
  const issueKeys = new Set()
  const addIssue = (code, message) => { if (!issueKeys.has(`${code}:${message}`)) { issues.push({ code, message }); issueKeys.add(`${code}:${message}`) } }
  let firstDate = null, lastDate = null, includedScans = 0
  const restrictToDay = context.payrollScope || 'all'
  for (const r of records) {
    const e = r.identifierType === 'person_id' ? byPerson.get(r.employeeCode) : byCode.get(r.employeeCode.toLowerCase())
    if (context.isTest && (!e || !context.employeeIds.includes(Number(e.id)))) continue
    if (e && !payrollEmployeeIncluded(e, context.profiles, restrictToDay)) continue
    let instant, date
    try { instant = parseManilaTimestamp(r.timestamp); date = manilaDateParts(instant).date }
    catch { addIssue('invalid_timestamp', `Invalid timestamp at source row ${r.sourceRow}`); continue }
    if (!firstDate || date < firstDate) firstDate = date
    if (!lastDate || date > lastDate) lastDate = date
    if (date < periodStart || date > addDays(periodEnd, 1)) continue
    if (!isAttendanceScan(r.eventType) && r.eventType !== null) continue
    if (!e) { if (date <= periodEnd) addIssue('unmapped_id', `Attendance ID ${r.employeeCode} is not mapped to an employee`); continue }
    const previousDate = addDays(date, -1), previousProfile = profileAt(context.profiles, e.id, previousDate) || shiftDefaults(e.shift)
    const previousWorkDate = attendanceWorkDate(instant, previousProfile)
    date = previousWorkDate === previousDate ? previousDate : date
    if (date < periodStart || date > periodEnd) continue
    includedScans += 1; scanDates.add(date)
    if (!employed(e, date)) { addIssue('employment_dates', `Employee ${e.employee_code} has scans outside recorded employment dates`); continue }
    const key = `${e.id}:${date}`, events = groups.get(key) || []
    events.push({ occurredAt: instant, eventType: r.eventType }); groups.set(key, events)
  }
  if (!includedScans) addIssue('file_coverage', 'No recognized scans fall in the selected period. Verify the export and cutoff.')
  if (!firstDate || firstDate > periodStart || lastDate < periodEnd) addIssue('file_coverage', 'The file may not cover the full selected period. Verify its export range.')
  const holidays = new Set(context.holidays.map(h => h.holiday_date)), days = [], emptyDates = new Set()
  for (const e of context.employees) {
    if (context.isTest && !context.employeeIds.includes(Number(e.id))) continue
    if (!payrollEmployeeIncluded(e, context.profiles, restrictToDay)) continue
    if (!['active','on_leave'].includes(String(e.status || 'active').toLowerCase()) && !e.last_working_date) continue
    for (let date = periodStart; date <= periodEnd; date = addDays(date, 1)) {
      if (!employed(e, date)) continue
      const profile = profileAt(context.profiles, e.id, date)
      const workdays = profile?.workdays || [1,2,3,4,5]
      const events = groups.get(`${e.id}:${date}`) || []
      // Days off are never absences. They appear only when the employee scanned in, so HR can decide
      // whether it was paid rest-day work. Leave does not apply to them.
      const restDay = !workdays.map(Number).includes(weekday(date))
      if (restDay && !events.length) continue
      if (holidays.has(date) && !events.length) continue
      const leaveRows = restDay ? [] : context.leaves.filter(l => Number(l.employee_id) === Number(e.id) && l.start_date <= date && l.end_date >= date)
      const approved = leaveRows.filter(l => l.status === 'approved'), pending = leaveRows.some(l => l.status === 'pending')
      const attendance = computeDailyAttendance({ date, events, profile: withWorkday(profile || shiftDefaults(e.shift), date) })
      const codes = []
      if (!e.date_hired) codes.push('missing_hire_date')
      if (!profile || !(Number(profile.monthly_basic_salary) >= MINIMUM_MONTHLY_SALARY)) codes.push('missing_profile')
      if (!e.person_id) codes.push('missing_attendance_id')
      if (profile && scheduleProblem(profile)) codes.push('unsupported_schedule')
      if (pending) codes.push('pending_leave')
      if (approved.length > 1) codes.push('leave_conflict')
      let leaveId = null
      if (approved.length === 1) {
        const leave = approved[0]; leaveId = leave.id
        if (!events.length && Number(leave.day_fraction ?? 1) === 1 && ['paid','unpaid'].includes(leave.leave_pay_type)) {
          attendance.status = leave.leave_pay_type === 'paid' ? 'paid_leave' : 'unpaid_leave'
          attendance.exceptionReason = null; attendance.leaveDeductionFraction = leave.leave_pay_type === 'paid' ? 0 : 1
        } else codes.push('leave_reconciliation')
      }
      if (restDay) codes.push('rest_day_work')
      else {
        if (attendance.status === 'exception') codes.push(events.length ? 'missing_punch' : 'no_record')
        if (Number(attendance.lateMinutes) > 0 || Number(attendance.undertimeMinutes) > 0) codes.push('late_undertime')
        if (!scanDates.has(date) && !holidays.has(date)) emptyDates.add(date)
      }
      const baseHash = fingerprint({ attendance, profile, leaves: leaveRows, employee: e })
      days.push({ employee_id: e.id, employee_code: e.employee_code, employee_name: `${e.first_name} ${e.last_name}`.trim(),
        person_id: e.person_id, work_date: date, status: attendance.status,
        first_scan_at: attendance.firstScanAt, last_scan_at: attendance.lastScanAt, scan_count: attendance.scanCount,
        late_minutes: attendance.lateMinutes, undertime_minutes: attendance.undertimeMinutes,
        exception_reason: attendance.exceptionReason, leave_deduction_fraction: attendance.leaveDeductionFraction ?? 1,
        leave_request_id: leaveId, leaves: leaveRows, profile, issue_codes: [...new Set(codes)],
        // Lateness measured from a complete time-in and time-out is deducted as recorded, like the
        // workbook; HR can still excuse it. Only the other findings need a decision.
        review_state: codes.some(c => c !== 'late_undertime') ? 'pending' : 'clear', base_hash: baseHash,
        overnight: shiftWindow(profile || shiftDefaults(e.shift)).overnight,
        schedule: profile ? `${profile.work_start_time.slice(0,5)}–${profile.work_end_time.slice(0,5)}${shiftWindow(profile).overnight ? ' next day' : ''}` : 'Schedule not configured' })
    }
  }
  if (emptyDates.size) addIssue('file_coverage', `No source scans on scheduled dates: ${[...emptyDates].sort().join(', ')}`)
  const sourceHash = fingerprint(csvText), contextHash = fingerprint(context)
  const summary = { employees: new Set(days.map(d => d.employee_id)).size, employeeDays: days.length,
    flaggedDays: days.filter(d => d.review_state === 'pending').length, sourceRows: records.length,
    lateUndertime: days.filter(d => d.issue_codes.includes('late_undertime')).length,
    missingRecords: days.filter(d => d.issue_codes.includes('no_record')).length,
    missingPunches: days.filter(d => d.issue_codes.includes('missing_punch')).length }
  return { period_start: periodStart, period_end: periodEnd, first_date: firstDate, last_date: lastDate, daily: days,
    issues, summary, isTest:context.isTest === true, employeeIds:context.employeeIds, payroll_scope: context.payrollScope || 'all', source_hash: sourceHash, context_hash: contextHash,
    preview_token: fingerprint({ sourceHash, contextHash, periodStart, periodEnd }), review_state: 'draft' }
}

async function loadContext(db, start, end, requestedScope, settings = {}) {
  const isTest = settings.isTest === true
  assertPracticeAllowed(isTest)
  const scope = normalizePayrollScope(requestedScope)
  const employees = (await db.query(`SELECT e.id,e.employee_code,e.first_name,e.last_name,e.status,e.shift,
    e.date_hired::text,e.last_working_date::text,b.person_id,
    EXISTS(SELECT 1 FROM users ceo_account WHERE ceo_account.employee_id = e.id AND ceo_account.role = 'ceo') AS is_ceo FROM employees e
    LEFT JOIN payroll_biometric_identities b ON b.employee_id=e.id ORDER BY e.id`)).rows
  // Each employee's current salary and schedule apply to the whole period, like the workbook's one salary
  // per person: whatever HR has set is what the next payroll uses. The effective date only records when it
  // was set; approved and closed payrolls keep their own figures.
  const latest=(await db.query(`SELECT DISTINCT ON(p.employee_id) p.id,p.employee_id,p.effective_from::text,p.effective_to::text,
    p.monthly_basic_salary,p.monthly_cola,p.daily_rate_divisor,p.workdays,
    p.work_start_time::text,p.work_end_time::text,p.unpaid_break_minutes
    FROM payroll_employee_profiles p ORDER BY p.employee_id,p.effective_from DESC,p.id DESC`)).rows
  let profiles = latest.map(p=>({...p,source_effective_from:p.effective_from,effective_from:start,effective_to:null}))
  const leaves = (await db.query(`SELECT id,employee_id,start_date::text,end_date::text,status,leave_type_name,
    leave_pay_type,leave_days,paid_days,unpaid_days,day_fraction,coverage_start::text,coverage_end::text
    FROM leave_requests WHERE status IN ('pending','approved') AND start_date <= $2 AND end_date >= $1 ORDER BY id`, [start,end])).rows
  const holidays = (await db.query(`SELECT holiday_date::text FROM philippine_holidays
    WHERE holiday_date BETWEEN $1 AND $2 AND is_working_day=FALSE ORDER BY holiday_date`, [start,addDays(end,1)])).rows
  let employeeIds
  if(isTest) {
    if(!Array.isArray(settings.employeeIds) || !settings.employeeIds.length || settings.employeeIds.length>500 || settings.employeeIds.some(id=>!Number.isSafeInteger(Number(id)) || Number(id)<1)) fail('Select at least one configured employee for practice payroll',400)
    employeeIds=[...new Set(settings.employeeIds.map(Number))].sort((a,b)=>a-b)
    for(const id of employeeIds) {
      const e=employees.find(e=>Number(e.id)===id),p=latest.find(p=>Number(p.employee_id)===id)
      if(!e || !['active','on_leave'].includes(e.status) || !e.person_id || !p || !(Number(p.monthly_basic_salary)>=MINIMUM_MONTHLY_SALARY) || !payrollEmployeeIncluded(e,[p],scope)) fail('Selected employees must have salary, attendance ID, and the selected shift configured',400)
    }
    profiles=profiles.filter(p=>employeeIds.includes(Number(p.employee_id)))
  }
  return { employees,profiles,leaves,holidays, ...(scope !== 'all' ? {payrollScope:scope} : {}), ...(isTest ? {isTest,employeeIds} : {}) }
}
// HR's note is optional; without one, the history records what was decided.
function automaticReason(decision, { restDay = false } = {}) {
  const base = { acknowledge: 'Recorded times accepted', actual_times: `Real times entered: ${decision.timeIn || '?'}–${decision.timeOut || '?'}`,
    absent: 'Did not come to work', verified_work: 'Worked a full day without usable scans', link_leave: 'Approved leave applied',
    not_work: restDay ? 'Rest day — scans not counted as work' : 'Only visited, did not work — counted as an absence',
    excused: 'Counted as a full day · late and undertime excused' }[String(decision.action || '')] || 'Reviewed by HR'
  let work = { dayType: 'regular', overtimeHours: 0 }
  try { work = normalizeApprovedWork(decision) } catch { /* reported by the approved-work check */ }
  return [base, work.dayType === 'special_holiday' ? 'special holiday / rest day' : work.dayType === 'rest_day' ? 'rest day work' : null, work.overtimeHours ? `${work.overtimeHours} h approved OT` : null].filter(Boolean).join(' · ')
}

function reviewDecision(day, decision, context) {
  const restDay = day.issue_codes?.includes('rest_day_work')
  if (restDay && !['acknowledge', 'actual_times', 'verified_work', 'not_work'].includes(String(decision.action || ''))) fail('For a rest day, choose rest-day work or not work', 400)
  if (!restDay && decision.dayType === 'rest_day') fail('Rest-day pay applies only to days outside the employee schedule', 400)
  // "Not work" pays nothing extra; work on a day off is always paid as rest-day work.
  if (decision.action === 'not_work') decision = { ...decision, dayType: 'regular', overtimeHours: 0 }
  else if (restDay) decision = { ...decision, dayType: 'rest_day' }
  const action = String(decision.action || ''), reason = String(decision.reason || '').trim() || automaticReason(decision, { restDay })
  if (reason.length > 500) fail('Keep the note under 500 characters', 400)
  if (day.issue_codes.some(c => ['missing_profile','missing_attendance_id','missing_hire_date','unsupported_schedule','pending_leave','leave_conflict'].includes(c))) fail('Fix employee setup or the pending/conflicting leave before reviewing this day')
  const resolved = { ...day, review_state: 'resolved', correction_reason: reason, review_decision: { ...decision,reason } }
  if (action === 'acknowledge') {
    if (day.status === 'exception' || day.issue_codes.includes('leave_reconciliation')) fail('Resolve missing punches or reconcile leave before acknowledgement')
  } else if (action === 'absent') {
    if (day.leave_request_id || day.first_scan_at || day.last_scan_at) fail('Resolve existing punches/leave before confirming absence')
    Object.assign(resolved,{status:'absent',late_minutes:0,undertime_minutes:0,leave_deduction_fraction:1,exception_reason:null})
  } else if (action === 'actual_times') {
    const officialLeave=context.leaves.find(l=>Number(l.id)===Number(day.leave_request_id))
    if (officialLeave&&Number(officialLeave.day_fraction??1)===1) fail('Full-day leave conflicts with work punches. Correct the official leave record first')
    const first = verifiedShiftTimestamp(day.work_date, decision.timeIn, day.profile), last = verifiedShiftTimestamp(day.work_date, decision.timeOut, day.profile)
    const measured = computeDailyAttendance({date:day.work_date,events:[{occurredAt:first},{occurredAt:last}],profile:withWorkday(day.profile,day.work_date)})
    if (measured.status !== 'present') fail('Provide verified time-in and time-out in order',400)
    Object.assign(resolved,{status:'present',first_scan_at:measured.firstScanAt,last_scan_at:measured.lastScanAt,
      late_minutes:measured.lateMinutes,undertime_minutes:measured.undertimeMinutes,exception_reason:null})
    if(officialLeave){
      const reconciled=reviewDecision(resolved,{...decision,action:'link_leave',leaveId:officialLeave.id},context)
      reconciled.review_decision={...reconciled.review_decision,action:'actual_times',timeIn:decision.timeIn,timeOut:decision.timeOut}
      return reconciled
    }
  } else if (action === 'excused') {
    // Company tasks (lab tests, client visits): the real scans stay, the missed minutes are not deducted.
    if (day.status !== 'present' || !day.first_scan_at || !day.last_scan_at) fail('Counting a full day needs a time-in and time-out. For missing scans, choose that they worked a full day')
    if (day.leave_request_id) fail('Resolve recorded leave before excusing this day')
    Object.assign(resolved,{late_minutes:0,undertime_minutes:0})
  } else if (action === 'not_work') {
    // They came in but did not work (for example, only to pick something up). Stored as not worked, with
    // no scans, so nothing (pay, night differential) is calculated from it. On a scheduled workday that is
    // an absence and one day is deducted; a day off is never deducted, because pay only counts scheduled
    // workdays. (The database only allows a scan-less worked day for verified work.)
    if (day.leave_request_id) fail('This day has recorded leave. Choose the leave instead', 400)
    Object.assign(resolved,{status:'absent',first_scan_at:null,last_scan_at:null,late_minutes:0,undertime_minutes:0,leave_deduction_fraction:1,exception_reason:null})
  } else if (action === 'verified_work') {
    if (day.leave_request_id) fail('Resolve recorded leave before confirming work')
    // Explicit HR evidence of work is retained without inventing biometric punches.
    Object.assign(resolved,{status:'present',first_scan_at:null,last_scan_at:null,late_minutes:0,undertime_minutes:0,exception_reason:null})
  } else if (action === 'link_leave') {
    const leave = context.leaves.find(l => Number(l.id) === Number(decision.leaveId) && l.status === 'approved' && Number(l.employee_id) === Number(day.employee_id) && l.start_date <= day.work_date && l.end_date >= day.work_date)
    if (!leave) fail('Choose an official approved leave covering this employee and date',400)
    const fraction=Number(leave.day_fraction??1)
    const paidFraction=leave.leave_pay_type==='paid'?fraction:leave.leave_pay_type==='unpaid'?0:Number(decision.paidFraction)
    if(!Number.isFinite(paidFraction)||paidFraction<0||paidFraction>fraction||Math.abs(paidFraction*2-Math.round(paidFraction*2))>0.000001)fail('Allocate paid leave for this date as 0, 0.5, or 1 day, within its recorded duration',400)
    resolved.review_decision.paidFraction=paidFraction
    if (Number(leave.day_fraction) < 1) {
      if (!leave.coverage_start || !leave.coverage_end || !day.first_scan_at || !day.last_scan_at) fail('Partial-day leave requires its recorded time coverage and verified work punches')
      const inAt = minutesOnWorkDate(day.first_scan_at, day.work_date), outAt = minutesOnWorkDate(day.last_scan_at, day.work_date)
      const {from:begin,to:end} = coverageWindow(minutes(leave.coverage_start), minutes(leave.coverage_end), day.profile)
      if (begin < outAt && end > inAt) fail('Leave coverage overlaps the recorded work period; correct the source record')
      const allowance = paidFraction/fraction
      const before = paidOverlap(begin,Math.min(end,inAt),day.profile), after = paidOverlap(Math.max(begin,outAt),end,day.profile)
      Object.assign(resolved,{status:'present',late_minutes:Math.max(0,Number(day.late_minutes)-before*allowance),
        undertime_minutes:Math.max(0,Number(day.undertime_minutes)-after*allowance),leave_request_id:leave.id,exception_reason:null})
    } else {
      if (day.first_scan_at || day.last_scan_at) fail('Full-day leave conflicts with punches. Correct the official leave or verified attendance first')
      Object.assign(resolved,{status:paidFraction===1?'paid_leave':paidFraction===0?'unpaid_leave':'partial_leave',leave_request_id:leave.id,
        late_minutes:0,undertime_minutes:0,leave_deduction_fraction:1-paidFraction,exception_reason:null})
    }
  } else fail('Select a valid HR review action',400)
  // Approved overtime and holiday work travel with the verified day, so payroll calculates them.
  const work = normalizeApprovedWork(decision)
  if ((work.dayType !== 'regular' || work.overtimeHours > 0) && resolved.status !== 'present') fail('Overtime and holiday work can only be recorded on a day the employee worked',400)
  resolved.review_decision = { ...resolved.review_decision, dayType: work.dayType, overtimeHours: work.overtimeHours }
  return resolved
}

function createAttendanceReviewService({db}) {
  async function preview(input, queryable=db) {
    validPeriod(input.periodStart,input.periodEnd)
    if(/(?:^|,)Payroll Test Data(?:,|\r?$)/mi.test(input.csvText.split('\n')[0]) && !input.isTest)fail('This CSV contains test data. Enable Practice payroll before importing it',400)
    if(input.employeeIds?.length && !input.isTest)fail('Employee subsets are available only for practice payroll',400)
    return buildAttendancePreview(input,await loadContext(queryable,input.periodStart,input.periodEnd,input.payrollScope,input))
  }
  async function event(tx,id,actor,action,reason,previous,current,day=null) {
    await tx.query(`INSERT INTO payroll_attendance_review_events(batch_id,employee_id,work_date,action,actor_user_id,reason,previous_value,current_value)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,[id,day?.employee_id??null,day?.work_date??null,action,actor.id,reason,JSON.stringify(previous),JSON.stringify(current)])
  }
  async function batchWith(tx,id) {
    const result=(await tx.query('SELECT id,file_name,period_start::text,period_end::text,review_state,review_version,source_hash,context_hash,review_issues,confirmed_by,confirmed_at,row_count,(source_csv IS NULL) AS needs_reimport FROM payroll_attendance_import_batches WHERE id=$1',[id])).rows[0]
    if(!result)return null
    const days=(await tx.query(`SELECT d.*,d.work_date::text,e.employee_code,e.first_name,e.last_name,b.person_id FROM payroll_daily_attendance d
      JOIN employees e ON e.id=d.employee_id LEFT JOIN payroll_biometric_identities b ON b.employee_id=e.id
      WHERE d.batch_id=$1 AND d.review_state<>'excluded' ORDER BY d.work_date,e.last_name,e.first_name`,[id])).rows
    const events=(await tx.query(`SELECT ev.id,ev.batch_id,ev.employee_id,ev.work_date::text AS work_date,ev.action,ev.actor_user_id,ev.reason,ev.created_at,COALESCE(NULLIF(TRIM(CONCAT_WS(' ',e.first_name,e.last_name)),''),u.email,'HR') AS actor_name
      FROM payroll_attendance_review_events ev LEFT JOIN users u ON u.id=ev.actor_user_id LEFT JOIN employees e ON e.id=u.employee_id
      WHERE ev.batch_id=$1 ORDER BY ev.id DESC LIMIT 200`,[id])).rows
    const scope=await attendancePayrollScope(tx,id)
    const settings=await attendanceReviewSettings(tx,id)
    const context=await loadContext(tx,result.period_start,result.period_end,scope,settings)
    return {...result,isTest:context.isTest === true,employeeIds:context.employeeIds,payrollScope:context.payrollScope || 'all',scopeNeedsRefresh:result.context_hash !== fingerprint(context),daily:days.map(d=>({...d,employee_name:`${d.first_name} ${d.last_name}`,
      schedule:(()=>{const p=profileAt(context.profiles,d.employee_id,d.work_date);return p?`${p.work_start_time.slice(0,5)}–${p.work_end_time.slice(0,5)}${shiftWindow(p).overnight ? ' next day' : ''}`:'Not configured'})(),
      overnight:shiftWindow(profileAt(context.profiles,d.employee_id,d.work_date) || {}).overnight,
      scheduled_minutes:scheduledPaidMinutes(profileAt(context.profiles,d.employee_id,d.work_date)),
      leaves:context.leaves.filter(l=>Number(l.employee_id)===Number(d.employee_id)&&l.start_date<=d.work_date&&l.end_date>=d.work_date)})),
      employees:context.employees,issues:result.review_issues,events}
  }
  async function persistDays(tx,id,days,previous=[]) {
    await tx.query("UPDATE payroll_daily_attendance SET review_state='excluded' WHERE batch_id=$1",[id])
    for(let day of days){
      const old=previous.find(d=>Number(d.employee_id)===Number(day.employee_id)&&dateKey(d.work_date)===day.work_date)
      if(old?.base_hash===day.base_hash&&old.review_state==='resolved')day={...day,...old,work_date:day.work_date}
      await tx.query(`INSERT INTO payroll_daily_attendance(batch_id,employee_id,work_date,status,first_scan_at,last_scan_at,scan_count,late_minutes,
        undertime_minutes,exception_reason,leave_deduction_fraction,review_state,issue_codes,base_hash,review_decision,leave_request_id,correction_reason,reviewed_by,reviewed_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb,$16,$17,$18,$19)
        ON CONFLICT(batch_id,employee_id,work_date) DO UPDATE SET status=EXCLUDED.status,first_scan_at=EXCLUDED.first_scan_at,last_scan_at=EXCLUDED.last_scan_at,
        scan_count=EXCLUDED.scan_count,late_minutes=EXCLUDED.late_minutes,undertime_minutes=EXCLUDED.undertime_minutes,exception_reason=EXCLUDED.exception_reason,
        leave_deduction_fraction=EXCLUDED.leave_deduction_fraction,review_state=EXCLUDED.review_state,issue_codes=EXCLUDED.issue_codes,base_hash=EXCLUDED.base_hash,
        review_decision=EXCLUDED.review_decision,leave_request_id=EXCLUDED.leave_request_id,correction_reason=EXCLUDED.correction_reason,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at`,
        [id,day.employee_id,day.work_date,day.status,day.first_scan_at,day.last_scan_at,day.scan_count,day.late_minutes,day.undertime_minutes,
          day.exception_reason,day.leave_deduction_fraction,day.review_state,JSON.stringify(day.issue_codes),day.base_hash,JSON.stringify(day.review_decision||null),
          day.leave_request_id,day.correction_reason||null,day.reviewed_by||null,day.reviewed_at||null])
    }
  }
  async function save(input,actor){return db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    const p=await preview(input,tx)
    if(input.previewToken!==p.preview_token)fail('Employee setup, leave, or the upload changed. Refresh the preview first')
    await tx.query('SELECT pg_advisory_xact_lock($1,hashtext($2))',[62410,p.source_hash+input.periodStart+input.periodEnd+p.payroll_scope])
    const old=(await tx.query("SELECT id FROM payroll_attendance_import_batches WHERE source_hash=$1 AND period_start=$2 AND period_end=$3 AND context_hash=$4 AND review_state='draft'",[p.source_hash,input.periodStart,input.periodEnd,p.context_hash])).rows[0]
    if(old)return batchWith(tx,old.id)
    const b=(await tx.query(`INSERT INTO payroll_attendance_import_batches(file_name,period_start,period_end,imported_by,row_count,
      source_hash,context_hash,source_csv,review_issues) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,
      [input.fileName,input.periodStart,input.periodEnd,actor.id,p.summary.sourceRows,p.source_hash,p.context_hash,input.csvText,JSON.stringify(p.issues)])).rows[0]
    await persistDays(tx,b.id,p.daily)
    await event(tx,b.id,actor,'draft_saved',p.isTest?'TEST ONLY attendance saved for practice':'Attendance saved for HR review',null,{sourceHash:p.source_hash,payrollScope:p.payroll_scope,isTest:p.isTest,employeeIds:p.employeeIds})
    return batchWith(tx,b.id)
  })}
  async function locked(tx,id,version){
    const b=(await tx.query('SELECT * FROM payroll_attendance_import_batches WHERE id=$1 FOR UPDATE',[id])).rows[0]
    if(!b)fail('Attendance batch not found',404)
    if(b.review_state==='confirmed')fail('Confirmed attendance is immutable. Create a replacement review instead')
    if(Number(version)!==Number(b.review_version))fail('Another HR action changed this review. Reload it first')
    if(!b.source_csv)fail('Legacy imports need a new preview from the original CSV')
    return b
  }
  async function refresh(id,version,actor){return db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    const b=await locked(tx,id,version), previous=await batchWith(tx,id)
    const p=await preview({csvText:b.source_csv,periodStart:dateKey(b.period_start),periodEnd:dateKey(b.period_end),payrollScope:previous.payrollScope,isTest:previous.isTest,employeeIds:previous.employeeIds},tx)
    await persistDays(tx,id,p.daily,previous.daily)
    await tx.query('UPDATE payroll_attendance_import_batches SET context_hash=$1,review_issues=$2::jsonb,review_version=review_version+1 WHERE id=$3',[p.context_hash,JSON.stringify(p.issues),id])
    await event(tx,id,actor,'refreshed','Refreshed after employee setup or leave changes',{contextHash:b.context_hash},{contextHash:p.context_hash,payrollScope:p.payroll_scope,isTest:p.isTest,employeeIds:p.employeeIds})
    return batchWith(tx,id)
  })}
  async function resolve(id,version,employeeId,date,decision,actor){return db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    const b=await locked(tx,id,version), context=await loadContext(tx,dateKey(b.period_start),dateKey(b.period_end),await attendancePayrollScope(tx,id),await attendanceReviewSettings(tx,id))
    if(fingerprint(context)!==b.context_hash)fail('Leave or employee setup changed. Refresh attendance before reviewing')
    const p=buildAttendancePreview({csvText:b.source_csv,periodStart:dateKey(b.period_start),periodEnd:dateKey(b.period_end)},context)
    const base=p.daily.find(d=>Number(d.employee_id)===Number(employeeId)&&d.work_date===date)
    if(!base)fail('Scheduled employee-day not found',404)
    const before=(await tx.query('SELECT * FROM payroll_daily_attendance WHERE batch_id=$1 AND employee_id=$2 AND work_date=$3',[id,employeeId,date])).rows[0]
    const after=reviewDecision(base,decision,context);after.reviewed_by=actor.id;after.reviewed_at=new Date().toISOString()
    if(after.leave_request_id)await validateLeaveAllocation(tx,id,context,[after])
    await tx.query(`UPDATE payroll_daily_attendance SET status=$1,first_scan_at=$2,last_scan_at=$3,late_minutes=$4,undertime_minutes=$5,
      exception_reason=$6,leave_deduction_fraction=$7,review_state='resolved',review_decision=$8::jsonb,leave_request_id=$9,
      correction_reason=$10,reviewed_by=$11,reviewed_at=NOW() WHERE id=$12`,
      [after.status,after.first_scan_at,after.last_scan_at,after.late_minutes,after.undertime_minutes,after.exception_reason,after.leave_deduction_fraction,JSON.stringify(after.review_decision),after.leave_request_id,after.correction_reason,actor.id,before.id])
    await tx.query('UPDATE payroll_attendance_import_batches SET review_version=review_version+1 WHERE id=$1',[id])
    await event(tx,id,actor,'day_reviewed',after.correction_reason,before,after,after)
    return batchWith(tx,id)
  })}
  async function confirm(id,version,coverageReason,actor){return db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
    const b=(await tx.query('SELECT * FROM payroll_attendance_import_batches WHERE id=$1 FOR UPDATE',[id])).rows[0]
    if(!b)fail('Attendance batch not found',404)
    if(b.review_state==='confirmed')return batchWith(tx,id)
    await locked(tx,id,version)
    const context=await loadContext(tx,dateKey(b.period_start),dateKey(b.period_end),await attendancePayrollScope(tx,id),await attendanceReviewSettings(tx,id))
    if(fingerprint(context)!==b.context_hash)fail('Leave or employee setup changed. Refresh the review before confirmation')
    const p=buildAttendancePreview({csvText:b.source_csv,periodStart:dateKey(b.period_start),periodEnd:dateKey(b.period_end)},context)
    if(p.issues.some(i=>i.code!=='file_coverage'))fail('Resolve mapping, timestamps, and employment setup before confirmation')
    const batch=await batchWith(tx,id)
    if(!batch.daily.length||batch.daily.some(d=>d.review_state==='pending'||d.status==='exception'))fail('HR must resolve every flagged employee-day before confirming attendance')
    if(p.daily.some(d=>!batch.daily.some(s=>Number(s.employee_id)===Number(d.employee_id)&&s.work_date===d.work_date&&s.base_hash===d.base_hash)))fail('Review population changed. Refresh attendance first')
    await validateLeaveAllocation(tx,id,context,batch.daily)
    await tx.query("UPDATE payroll_attendance_import_batches SET review_state='confirmed',confirmed_by=$1,confirmed_at=NOW(),review_version=review_version+1 WHERE id=$2",[actor.id,id])
    await event(tx,id,actor,'confirmed',String(coverageReason||'').trim()||(p.issues.length?'Confirmed by HR; file coverage warnings accepted':'HR verified all flagged attendance'),null,{contextHash:b.context_hash,payrollScope:context.payrollScope || 'all',isTest:context.isTest === true,employeeIds:context.employeeIds})
    return batchWith(tx,id)
  })}
  async function revokeLeave(id,version,leaveId,reason,actor){return db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
    const b=await locked(tx,id,version),explanation=String(reason||'').trim()||'Incorrect leave cancelled by HR'
    if((await attendanceReviewSettings(tx,id)).isTest)fail('Practice attendance cannot change official leave records',403)
    if(explanation.length>500)fail('Keep the note under 500 characters',400)
    const leave=(await tx.query(`SELECT id,employee_id,start_date::text,end_date::text,status,credits_deducted,leave_type_name
      FROM leave_requests WHERE id=$1 FOR UPDATE`,[leaveId])).rows[0]
    if(!leave||leave.status!=='approved'||leave.start_date>dateKey(b.period_end)||leave.end_date<dateKey(b.period_start))fail('Choose an approved leave inside this attendance review',400)
    const used=await tx.query(`SELECT 1 FROM payroll_runs r JOIN payroll_run_lines l ON l.payroll_run_id=r.id WHERE l.employee_id=$1
      AND COALESCE(r.rule_snapshot->>'isTest','false')<>'true' AND r.status IN ('approved','locked') AND r.period_start <= $2 AND r.period_end >= $3 LIMIT 1`,[leave.employee_id,leave.end_date,leave.start_date])
    if(used.rows.length)fail('This leave is included in finalized payroll. Use an audited future adjustment instead')
    const employee=(await tx.query('SELECT id,leave_credits_reset_year FROM employees WHERE id=$1 FOR UPDATE',[leave.employee_id])).rows[0]
    const previous=await batchWith(tx,id)
    await tx.query("UPDATE leave_requests SET status='cancelled' WHERE id=$1",[leaveId])
    const year=Number(new Date(Date.now()+8*3600000).toISOString().slice(0,4))
    const refunded=Number(leave.start_date.slice(0,4))===year&&Number(employee.leave_credits_reset_year)===year?Number(leave.credits_deducted||0):0
    if(refunded)await tx.query('UPDATE employees SET leave_credits=leave_credits+$1,updated_at=NOW() WHERE id=$2',[refunded,leave.employee_id])
    await tx.query('INSERT INTO audit_logs(user_id,action,target_table,target_id) VALUES($1,$2,$3,$4)',[actor.id,'correct_official_leave','leave_requests',leaveId])
    const p=await preview({csvText:b.source_csv,periodStart:dateKey(b.period_start),periodEnd:dateKey(b.period_end),payrollScope:previous.payrollScope},tx)
    await persistDays(tx,id,p.daily,previous.daily)
    await tx.query('UPDATE payroll_attendance_import_batches SET context_hash=$1,review_issues=$2::jsonb,review_version=review_version+1 WHERE id=$3',[p.context_hash,JSON.stringify(p.issues),id])
    await event(tx,id,actor,'official_leave_corrected',explanation,leave,{id:leaveId,status:'cancelled',currentYearCreditsRefunded:refunded,payrollScope:p.payroll_scope})
    return batchWith(tx,id)
  })}
  async function list(requestedScope){const scope=normalizePayrollScope(requestedScope);return (await db.query(`SELECT b.id,b.file_name,b.period_start::text,b.period_end::text,b.review_state,b.review_version,b.created_at,(b.source_csv IS NULL) AS needs_reimport,
    COUNT(d.id) FILTER(WHERE d.review_state='pending')::integer AS pending_days,
    COALESCE(scope.payroll_scope,'all') AS payroll_scope,COALESCE(scope.is_test,FALSE) AS is_test,
    (COALESCE(scope.payroll_scope,'all') <> $1::text) AS scope_needs_refresh
    FROM payroll_attendance_import_batches b
    LEFT JOIN payroll_daily_attendance d ON d.batch_id=b.id
    LEFT JOIN LATERAL (SELECT ev.current_value->>'payrollScope' AS payroll_scope,(ev.current_value->>'isTest'='true') AS is_test
      FROM payroll_attendance_review_events ev WHERE ev.batch_id=b.id AND ev.current_value ? 'payrollScope'
      ORDER BY ev.id DESC LIMIT 1) scope ON TRUE
    GROUP BY b.id,scope.payroll_scope,scope.is_test ORDER BY b.id DESC LIMIT 100`,[scope])).rows}
  async function validateLeaveAllocation(tx,id,context,changes){
    if(context.isTest)return
    for(const leaveId of new Set(changes.map(d=>d.leave_request_id).filter(Boolean))){
      const leave=context.leaves.find(l=>Number(l.id)===Number(leaveId));if(!leave)fail('Official leave is no longer available')
      const rows=(await tx.query(`SELECT DISTINCT ON(d.work_date) d.*,d.work_date::text FROM payroll_daily_attendance d
        JOIN payroll_attendance_import_batches b ON b.id=d.batch_id
        WHERE d.leave_request_id=$1 AND d.review_state<>'excluded' AND (b.review_state='confirmed' OR b.id=$2)
        AND NOT EXISTS(SELECT 1 FROM payroll_attendance_review_events test_event WHERE test_event.batch_id=b.id AND test_event.current_value->>'isTest'='true')
        AND (b.id=$2 OR NOT EXISTS(SELECT 1 FROM payroll_daily_attendance current_day WHERE current_day.batch_id=$2 AND current_day.employee_id=d.employee_id AND current_day.work_date=d.work_date AND current_day.review_state<>'excluded'))
        ORDER BY d.work_date,(b.id=$2) DESC,b.id DESC`,[leaveId,id])).rows
      const byDate=new Map(rows.map(d=>[d.work_date,d]));for(const d of changes.filter(d=>Number(d.leave_request_id)===Number(leaveId)))byDate.set(d.work_date,d)
      let paid=0,unpaid=0
      for(const d of byDate.values()){
        if(d.review_state==='pending')continue
        const duration=Number(leave.day_fraction??1)
        const part=d.review_decision?.paidFraction??(leave.leave_pay_type==='paid'?duration:leave.leave_pay_type==='unpaid'?0:1-Number(d.leave_deduction_fraction))
        paid+=Number(part);unpaid+=duration-Number(part)
      }
      if(paid>Number(leave.paid_days)+0.000001||unpaid>Number(leave.unpaid_days)+0.000001)fail('This paid/unpaid allocation exceeds the official leave totals. Verify the other reviewed dates before saving')
    }
  }
  return {preview,save,refresh,resolve,confirm,revokeLeave,list,get:id=>batchWith(db,id)}
}
module.exports={createAttendanceReviewService,buildAttendancePreview,reviewDecision,fingerprint,loadContext,paidOverlap}
