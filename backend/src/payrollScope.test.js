const test=require('node:test'),assert=require('node:assert/strict'),express=require('express')
const {payrollEmployeeIncluded}=require('./services/payrollScopeService')
const {buildAttendancePreview,fingerprint}=require('./services/attendanceReviewService')
const {createPayrollService}=require('./services/payrollService')
const {createPayrollRouter}=require('./routes/payrollRoutes')
const day={id:1,employee_id:1,employee_code:'DAY-1',first_name:'Day',last_name:'Fixture',shift:'day',status:'active',person_id:'00001',date_hired:'2026-01-01'}
const night={...day,id:2,employee_id:2,employee_code:'NIGHT-2',first_name:'Night',shift:'Night',person_id:'00002'}
const profile={employee_id:1,effective_from:'2026-01-01',monthly_basic_salary:15000,work_start_time:'09:00',work_end_time:'18:00',unpaid_break_minutes:60,workdays:[1,2,3,4,5]}
const context=()=>({employees:[day,night],profiles:[profile],leaves:[],holidays:[],payrollScope:'day'})
const csv='Person ID,Time,Attendance Check Point\n00001,2026-09-21 09:00,Main_Door_Out_Door1_Entrance Card Reader1\n00001,2026-09-21 18:00,Main_Door_IN_Door1_Entrance Card Reader1'
const preview=(c=context(),text=csv)=>buildAttendancePreview({csvText:text,periodStart:'2026-09-21',periodEnd:'2026-09-21'},c)

test('temporary day scope hides night classification and overnight profiles, without hiding unconfigured day staff',()=>{
 assert.equal(payrollEmployeeIncluded(night,[],true),false)
 assert.equal(payrollEmployeeIncluded({...day,work_start_time:'21:00',work_end_time:'06:00'},[],true),false)
 assert.equal(payrollEmployeeIncluded(day,[{...profile,work_start_time:'21:00',work_end_time:'06:00'}],true),false)
 assert.equal(payrollEmployeeIncluded(day,[],true),true)
 assert.equal(payrollEmployeeIncluded(night,[],false),true)
})
test('day DTR creates no missing-punch or salary-setup blockers for excluded night staff',()=>{
 const p=preview();assert.equal(p.daily.length,1);assert.equal(p.daily[0].employee_id,1)
 assert.equal(p.summary.flaggedDays,0);assert.equal(p.summary.missingRecords,0)
})
test('mapped night source rows are ignored even if their timestamps are invalid; unknown IDs still need mapping',()=>{
 const p=preview(context(),csv+'\n00002,invalid timestamp,Main_Door_Out_Door1_Entrance Card Reader1')
 assert.equal(p.daily.length,1);assert.equal(p.issues.length,0)
 assert.ok(preview(context(),csv+'\n00003,2026-09-21 09:00,Main_Door_Out_Door1_Entrance Card Reader1').issues.some(i=>i.code==='unmapped_id'))
})
test('day staff absent from a day export remain flagged for HR; filtering does not infer absence',()=>{
 const c=context();c.employees.push({...day,id:3,employee_id:3,employee_code:'DAY-3',person_id:'00003'})
 const d=preview(c).daily.find(d=>d.employee_id===3)
 assert.equal(d.status,'exception');assert.ok(d.issue_codes.includes('no_record'))
})
test('scope changes invalidate prior confirmations and previews without mutating the employee roster',()=>{
 const c=context(),before=JSON.stringify(c),scoped=preview(c)
 const all={...c};delete all.payrollScope
 assert.notEqual(scoped.context_hash,fingerprint(all));assert.notEqual(scoped.preview_token,preview(all).preview_token)
 assert.equal(JSON.stringify(c),before)
})
test('pay setup API excludes night employees while the flag is on and restores them when switched off',async()=>{
 const previous=process.env.PAYROLL_DAY_SHIFT_ONLY
 const service=createPayrollService({db:{query:async()=>({rows:[day,night]})}})
 try {
  process.env.PAYROLL_DAY_SHIFT_ONLY='true';assert.deepEqual((await service.listProfiles()).map(p=>p.employee_id),[1])
  process.env.PAYROLL_DAY_SHIFT_ONLY='false';assert.deepEqual((await service.listProfiles()).map(p=>p.employee_id),[1,2])
 }finally{if(previous===undefined)delete process.env.PAYROLL_DAY_SHIFT_ONLY;else process.env.PAYROLL_DAY_SHIFT_ONLY=previous}
})
test('night employee cannot bypass day-only testing by posting directly to the no-save payroll endpoint',async()=>{
 const previous=process.env.PAYROLL_DAY_SHIFT_ONLY;process.env.PAYROLL_DAY_SHIFT_ONLY='true'
 const queries=[],app=express();app.use(createPayrollRouter({db:{query:async sql=>{queries.push(sql);return {rows:[night]}}},payrollService:{},authRequired:(req,res,next)=>{req.user={id:1,role:'hr'};next()},requireRole:()=> (req,res,next)=>next()}))
 const server=app.listen(0)
 try {
  const body=new FormData();body.append('file',new Blob([csv]),'day.csv')
  for(const [key,value] of Object.entries({employeeId:2,biometricPersonId:'00002',monthlyBasicSalary:15000,periodStart:'2026-09-11',periodEnd:'2026-09-25',payday:'2026-09-30',cutoff:'second'}))body.append(key,String(value))
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/payroll/test/employee-preview`,{method:'POST',body})
  assert.equal(response.status,409);assert.match((await response.json()).message,/temporarily hidden/)
  assert.equal(queries.length,1)
 }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.PAYROLL_DAY_SHIFT_ONLY;else process.env.PAYROLL_DAY_SHIFT_ONLY=previous}
})
