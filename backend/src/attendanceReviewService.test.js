const test=require('node:test'),assert=require('node:assert/strict')
const {buildAttendancePreview,reviewDecision}=require('./services/attendanceReviewService')
const context=()=>({employees:[{id:1,employee_code:'EMP-1',first_name:'Sample',last_name:'Employee',status:'active',date_hired:'2026-01-01',last_working_date:null,person_id:'00042'}],profiles:[{id:1,employee_id:1,effective_from:'2026-01-01',effective_to:null,monthly_basic_salary:15000,workdays:[1,2,3,4,5],work_start_time:'09:00:00',work_end_time:'18:00:00',unpaid_break_minutes:60}],leaves:[],holidays:[]})
const csv=(rows=[['00042','09/21/26 09:10','Main_Door_Out_Door1_Entrance Card Reader1'],['00042','09/21/26 17:30','Main_Door_IN_Door1_Entrance Card Reader1']])=>'Person ID,Time,Attendance Check Point\n'+rows.map(r=>r.join(',')).join('\n')
const preview=(c=context(),text=csv(),start='2026-09-21',end='2026-09-21')=>buildAttendancePreview({csvText:text,periodStart:start,periodEnd:end},c)
test('late and undertime need explicit review although the punches are complete',()=>{
 const day=preview().daily[0];assert.equal(day.status,'present');assert.equal(day.review_state,'pending');assert.equal(day.late_minutes,10);assert.equal(day.undertime_minutes,30)
 const checked=reviewDecision(day,{action:'acknowledge',reason:'Verified actual punches'},context());assert.equal(checked.review_state,'resolved');assert.equal(checked.undertime_minutes,30)
})
test('employees with no rows in the CSV are included without being inferred absent',()=>{
 const c=context();c.employees.push({...c.employees[0],id:2,employee_code:'EMP-2',person_id:'00043'});c.profiles.push({...c.profiles[0],id:2,employee_id:2})
 const day=preview(c).daily.find(d=>d.employee_id===2);assert.equal(day.status,'exception');assert.ok(day.issue_codes.includes('no_record'))
 assert.throws(()=>reviewDecision(day,{action:'acknowledge',reason:'checked'},c),/Resolve missing/)
 assert.equal(reviewDecision(day,{action:'absent',reason:'HR confirmed unpaid absence'},c).status,'absent')
})
test('rest days and days outside employment are excluded',()=>{
 const c=context();c.employees[0].date_hired='2026-09-22';c.employees[0].last_working_date='2026-09-23'
 const result=preview(c,csv(),'2026-09-19','2026-09-25');assert.deepEqual(result.daily.map(d=>d.work_date),['2026-09-22','2026-09-23'])
})
test('missing profiles stay visible and cannot be dismissed with an HR reason',()=>{
 const c=context();c.profiles=[];const day=preview(c).daily[0];assert.ok(day.issue_codes.includes('missing_profile'));assert.throws(()=>reviewDecision(day,{action:'acknowledge',reason:'Checked'},c),/Fix employee setup/)
})
test('approved official leave supplies a no-scan day; pending leave does not',()=>{
 const c=context();c.leaves=[{id:7,employee_id:1,start_date:'2026-09-21',end_date:'2026-09-21',status:'approved',leave_pay_type:'paid',day_fraction:1}]
 const text=csv([['00043','09/21/26 09:00','New Bio_New Office Biometrics_Entrance Card Reader1']])
 assert.equal(preview(c,text).daily[0].status,'paid_leave');assert.equal(preview(c,text).daily[0].leave_request_id,7)
 c.leaves[0].status='pending';const day=preview(c,text).daily[0];assert.equal(day.status,'exception');assert.ok(day.issue_codes.includes('pending_leave'))
})
test('official half-day paid leave covers only missed time and leaves other lateness intact',()=>{
 const c=context();c.leaves=[{id:7,employee_id:1,start_date:'2026-09-21',end_date:'2026-09-21',status:'approved',leave_pay_type:'paid',day_fraction:.5,coverage_start:'14:00',coverage_end:'18:00'}]
 const day=preview(c,csv([['00042','09/21/26 09:10','Main_Door_Out_Door1_Entrance Card Reader1'],['00042','09/21/26 13:00','Main_Door_IN_Door1_Entrance Card Reader1']])).daily[0]
 const fixed=reviewDecision(day,{action:'link_leave',leaveId:7,reason:'Paper afternoon leave verified'},c)
 assert.equal(fixed.late_minutes,10);assert.equal(fixed.undertime_minutes,0);assert.equal(fixed.status,'present')
 c.leaves[0].leave_pay_type='unpaid';assert.equal(reviewDecision(day,{action:'link_leave',leaveId:7,reason:'Verified unpaid afternoon'},c).undertime_minutes,240)
})
test('a payroll-only paid-leave label is not an available review action',()=>{
 assert.throws(()=>reviewDecision(preview().daily[0],{action:'paid_leave',reason:'paid leave'},context()),/valid HR review action/)
})
test('verified work uses explicit evidence without fabricating punches',()=>{
 const c=context(),day=preview(c,csv([])).daily[0];const fixed=reviewDecision(day,{action:'verified_work',reason:'Supervisor confirmed client-site work'},c)
 assert.equal(fixed.status,'present');assert.equal(fixed.first_scan_at,null);assert.equal(fixed.last_scan_at,null)
})
test('preview fingerprint changes when source, identity, salary or leave changes',()=>{
 const a=preview(),c=context();c.profiles[0].monthly_basic_salary=18000;assert.notEqual(preview(c).preview_token,a.preview_token)
 assert.notEqual(preview(context(),csv()+ '\n00042,09/21/26 12:00,New Bio_New Office Biometrics_Entrance Card Reader1').preview_token,a.preview_token)
})
test('an incomplete whole-file date is a coverage issue, never a mass absence result',()=>{
 const p=preview(context(),csv(),'2026-09-21','2026-09-22');assert.ok(p.issues.some(i=>i.code==='file_coverage'));assert.equal(p.daily[1].status,'exception')
})

test('invalid calendar dates and unsupported non-eight-hour schedules are rejected before payroll',()=>{
 assert.throws(()=>preview(context(),csv(),'2026-99-01','2026-99-02'),/valid YYYY-MM-DD/)
 const c=context();c.profiles[0].work_end_time='17:00:00'
 assert.ok(preview(c).daily[0].issue_codes.includes('unsupported_schedule'))
})

test('mixed paid and unpaid official leave needs an explicit bounded date allocation',()=>{
 const c=context();c.leaves=[{id:8,employee_id:1,start_date:'2026-09-21',end_date:'2026-09-22',status:'approved',leave_pay_type:'partial_paid',day_fraction:1,paid_days:1,unpaid_days:1}]
 const day=preview(c,csv([['00043','09/21/26 09:00','New Bio_New Office Biometrics_Entrance Card Reader1']])).daily[0]
 assert.throws(()=>reviewDecision(day,{action:'link_leave',leaveId:8,reason:'Verified leave'},c),/Allocate paid/)
 const resolved=reviewDecision(day,{action:'link_leave',leaveId:8,paidFraction:.5,reason:'Verified allocation'},c)
 assert.equal(resolved.status,'partial_leave');assert.equal(resolved.leave_deduction_fraction,.5)
 assert.throws(()=>reviewDecision(day,{action:'link_leave',leaveId:8,paidFraction:1.5,reason:'Verified allocation'},c),/Allocate paid/)
})
test('verified missing punches can be corrected and reconciled with the same official half-day leave',()=>{
 const c=context();c.leaves=[{id:9,employee_id:1,start_date:'2026-09-21',end_date:'2026-09-21',status:'approved',leave_pay_type:'paid',day_fraction:.5,coverage_start:'14:00',coverage_end:'18:00'}]
 const day=preview(c,csv([['00042','09/21/26 09:10','Main_Door_Out_Door1_Entrance Card Reader1']])).daily[0]
 const fixed=reviewDecision(day,{action:'actual_times',timeIn:'09:10',timeOut:'13:00',reason:'Supervisor verified missing departure'},c)
 assert.equal(fixed.late_minutes,10);assert.equal(fixed.undertime_minutes,0)
 assert.equal(fixed.leave_request_id,9);assert.equal(fixed.review_decision.action,'actual_times');assert.equal(fixed.review_decision.paidFraction,.5)
})
