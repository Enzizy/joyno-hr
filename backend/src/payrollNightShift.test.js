const test = require('node:test'), assert = require('node:assert/strict')
const { computeDailyAttendance, parseManilaTimestamp, attendanceWorkDate } = require('./services/payrollAttendanceService')
const { buildAttendancePreview, reviewDecision, paidOverlap } = require('./services/attendanceReviewService')
const { calculateNightDifferential, effectiveEarnings } = require('./services/payrollNightDifferentialService')
const { draftNetPay } = require('./services/payrollChargesService')
const { payrollBreakdown } = require('./services/payrollPayslipService')
const profile = { employee_id:1, effective_from:'2026-01-01', monthly_basic_salary:15000, daily_rate_divisor:261,
  work_start_time:'21:00', work_end_time:'06:00', unpaid_break_minutes:60, workdays:[1,2,3,4,5] }
const events = (start='2026-09-25 21:00', end='2026-09-26 06:00') => [
  {occurredAt:parseManilaTimestamp(start),eventType:'in'}, {occurredAt:parseManilaTimestamp(end),eventType:'out'}]
const context = () => ({ employees:[{id:1,employee_code:'N-1',person_id:'00042',first_name:'Night',last_name:'Fixture',status:'active',shift:'night',date_hired:'2026-01-01'}],profiles:[profile],leaves:[],holidays:[] })
const preview = (c=context(), rows=events()) => buildAttendancePreview({periodStart:'2026-09-25',periodEnd:'2026-09-25',csvText:
  'Person ID,Time,Attendance Check Point\n'+rows.map(e=>`00042,${e.occurredAt.toISOString()},${e.eventType==='in'?'Main_Door_Out':'Main_Door_IN'}_Door1_Entrance Card Reader1`).join('\n')},c)

test('Friday-night attendance includes Saturday checkout after the cutoff and last employment date', () => {
  const c=context();c.employees[0].last_working_date='2026-09-25'
  const p=preview(c),day=p.daily[0]
  assert.equal(p.daily.length,1);assert.equal(day.status,'present');assert.equal(day.review_state,'clear')
  assert.equal(day.late_minutes,0);assert.equal(day.undertime_minutes,0);assert.equal(day.overnight,true)
  assert.match(day.schedule,/next day/);assert.equal(p.issues.length,0)
})
test('night arrivals and departures are assigned once, including early arrivals and late departures', () => {
  assert.equal(attendanceWorkDate(parseManilaTimestamp('2026-09-26 07:00'),profile),'2026-09-25')
  assert.equal(attendanceWorkDate(parseManilaTimestamp('2026-09-26 20:30'),profile),'2026-09-26')
  const all=[...events(),...events('2026-09-28 20:30','2026-09-29 07:00')]
  assert.equal(computeDailyAttendance({date:'2026-09-25',events:all,profile}).scanCount,2)
})
test('overnight New Bio endpoints and interior scans retain first arrival and final checkout', () => {
  const scans=events();scans[0].eventType='boundary';scans[1].eventType='boundary'
  scans.push({occurredAt:parseManilaTimestamp('2026-09-26 02:30'),eventType:'boundary'})
  const day=computeDailyAttendance({date:'2026-09-25',events:scans,profile})
  assert.equal(day.status,'present');assert.equal(day.scanCount,3);assert.equal(day.undertimeMinutes,0)
})
test('late and undertime deduct paid minutes across midnight while skipping 1–2 AM', () => {
  const day=computeDailyAttendance({date:'2026-09-25',events:events('2026-09-26 01:30','2026-09-26 05:00'),profile})
  assert.equal(day.lateMinutes,240);assert.equal(day.undertimeMinutes,60)
})
test('complete 9 PM–6 AM shift earns seven night hours, based on full precision basic rate', () => {
  const day=computeDailyAttendance({date:'2026-09-25',events:events(),profile})
  const result=calculateNightDifferential({attendance:[day],fallbackProfile:profile})
  assert.equal(result.nightDifferential.paidMinutes,420);assert.equal(result.nightDifferential.amount,60.34)
  assert.equal(result.nightDifferential.reviewRequired,false)
})
test('night differential only includes actual paid work and uses each date’s effective salary', () => {
  const day=computeDailyAttendance({date:'2026-09-25',events:events('2026-09-25 23:00','2026-09-26 04:00'),profile})
  const result=calculateNightDifferential({attendance:[day],employeeId:1,profiles:[{...profile,effective_from:'2026-09-25',monthly_basic_salary:20000}],fallbackProfile:profile})
  assert.equal(result.nightDifferential.paidMinutes,240);assert.equal(result.nightDifferential.amount,45.98)
})
test('paid leave, absence and incomplete punches do not invent night differential', () => {
  for(const status of ['paid_leave','unpaid_leave','absent','exception']) {
    assert.equal(calculateNightDifferential({attendance:[{date:'2026-09-25',status}],fallbackProfile:profile}).nightDifferential.amount,0)
  }
  const result=calculateNightDifferential({attendance:[{date:'2026-09-25',status:'present'}],fallbackProfile:profile})
  assert.equal(result.nightDifferential.reviewRequired,true);assert.match(result.nightDifferential.review[0].reason,/without actual punches/)
})
test('holiday after midnight requires an HR multiplier review; ordinary Friday shift is clear', () => {
  const day=computeDailyAttendance({date:'2026-09-25',events:events(),profile})
  const result=calculateNightDifferential({attendance:[day],fallbackProfile:profile,holidays:[{holiday_date:'2026-09-26'}]})
  assert.equal(result.nightDifferential.reviewRequired,true);assert.equal(result.nightDifferential.days[0].holidayMinutes,300)
})
test('night overtime outside a day schedule requires manual verification instead of silent omission', () => {
  const dayProfile={...profile,work_start_time:'09:00',work_end_time:'18:00'}
  const day=computeDailyAttendance({date:'2026-09-25',events:events('2026-09-25 09:00','2026-09-25 23:00'),profile:dayProfile})
  const result=calculateNightDifferential({attendance:[day],fallbackProfile:dayProfile})
  assert.equal(result.nightDifferential.reviewRequired,true);assert.equal(result.nightDifferential.amount,0)
})
test('HR corrected morning punches use next day and retain actual night eligibility', () => {
  const p=preview(context(),[events()[0]]),day=p.daily[0]
  const corrected=reviewDecision(day,{action:'actual_times',timeIn:'21:00',timeOut:'06:00',reason:'Verified supervisor times'},context())
  assert.equal(corrected.status,'present');assert.equal(corrected.undertime_minutes,0)
  assert.equal(corrected.last_scan_at,parseManilaTimestamp('2026-09-26 06:00').toISOString())
})
test('half-day leave coverage crosses midnight and reimburses only covered missed paid minutes', () => {
  assert.equal(paidOverlap(21*60,60,profile),240);assert.equal(paidOverlap(120,360,profile),240)
  const c=context();c.leaves=[{id:7,employee_id:1,start_date:'2026-09-25',end_date:'2026-09-25',status:'approved',day_fraction:0.5,leave_pay_type:'paid',coverage_start:'21:00',coverage_end:'01:00'}]
  const day=preview(c,events('2026-09-26 02:00','2026-09-26 06:00')).daily[0]
  const corrected=reviewDecision(day,{action:'link_leave',leaveId:7,reason:'Verified first half paper leave'},c)
  assert.equal(corrected.late_minutes,0)
  assert.equal(calculateNightDifferential({attendance:[corrected],fallbackProfile:profile}).nightDifferential.paidMinutes,240)
})
test('salary setup remains mandatory; Employee Management night shift prevents day defaults in previews', () => {
  const c=context();c.profiles=[]
  const day=preview(c).daily[0]
  assert.equal(day.status,'present');assert.equal(day.late_minutes,0);assert.ok(day.issue_codes.includes('missing_profile'))
  assert.throws(()=>reviewDecision(day,{action:'acknowledge',reason:'Verified punches'},c),/Fix employee setup/)
})
test('automatic earnings reach net pay and PDF totals; one manual override replaces them, including zero', () => {
  const details={automaticEarnings:[{type:'night_differential',amount:60.34,note:'7h at 10%'}],manualEarnings:[]}
  const line={gross_salary:7500,cola_pay:0,details}
  assert.equal(draftNetPay(line),7560.34);assert.equal(payrollBreakdown(line).totalEarnings,7560.34)
  details.manualEarnings=[{type:'night_differential',amount:100,note:'Verified total including holiday multiplier'}]
  assert.equal(effectiveEarnings(details).length,1);assert.equal(draftNetPay(line),7600);assert.equal(payrollBreakdown(line).totalEarnings,7600)
  details.manualEarnings[0].amount=0;assert.equal(draftNetPay(line),7500)
})

test('SSS workbook compensation includes effective night pay once and excludes COLA/holiday premium', () => {
  const {calculateSssAssessablePay,calculateContributions}=require('./services/payrollCalculationService')
  const details={automaticEarnings:[{type:'night_differential',amount:603.45}],manualEarnings:[{type:'holiday_premium',amount:100}]}
  let assessed=calculateSssAssessablePay({firstCutoffPay:7500,grossSalary:7500,manualEarnings:effectiveEarnings(details)})
  assert.equal(assessed.monthlyCompensation,15603.45);assert.equal(assessed.nightDifferentialPay,603.45)
  assert.equal(calculateContributions(15000,{sssCompensation:assessed.monthlyCompensation}).sssEmployee,775)
  details.manualEarnings.push({type:'night_differential',amount:700,note:'Verified override'})
  assessed=calculateSssAssessablePay({firstCutoffPay:7500,grossSalary:7500,manualEarnings:effectiveEarnings(details)})
  assert.equal(assessed.monthlyCompensation,15700)
})

test('a blank night override cannot silently suppress automatic earnings as zero', async () => {
  const {createPayrollService}=require('./services/payrollService')
  const service=createPayrollService({db:{query(){throw Error('Invalid input must not reach the database')}}})
  await assert.rejects(service.updateManualEarnings(1,1,[{type:'night_differential',amount:'',note:'Verified override reason'}]),/explicit zero/)
})
