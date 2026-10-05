const test=require('node:test'),assert=require('node:assert/strict'),express=require('express')
const {createAttendanceReviewRouter}=require('./routes/attendanceReviewRoutes')
const {createPayrollRouter}=require('./routes/payrollRoutes')
const {csvRows}=require('./services/hrmsCsvService')
async function serverFor(router,callback){const app=express();app.use(express.json(),router);const server=app.listen(0);try{await callback(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise(r=>server.close(r))}}
const authRequired=(req,res,next)=>{req.user={id:1,role:req.headers['x-test-role']||'hr'};next()}
const requireRole=roles=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({message:'Forbidden'})
test('attendance rejects employee access and invalid IDs/versions before touching review data',async()=>{
 let calls=0;const service={list:async()=>{calls++;return []},resolve:async()=>{calls++;return {}}}
 await serverFor(createAttendanceReviewRouter({service,authRequired,requireRole}),async url=>{
  assert.equal((await fetch(url+'/api/attendance/batches',{headers:{'x-test-role':'employee'}})).status,403)
  assert.equal((await fetch(url+'/api/attendance/batches/nope')).status,400)
  assert.equal((await fetch(url+'/api/attendance/batches/1/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:0,employeeId:1,date:'2026-09-21',decision:{action:'absent'}})})).status,400)
  assert.equal(calls,0)
  for(const role of ['hr','admin','ceo'])assert.equal((await fetch(url+'/api/attendance/batches',{headers:{'x-test-role':role}})).status,200)
  assert.equal(calls,3)
 })
})
test('DTR export requires confirmation and escapes spreadsheet formulas',async()=>{
 let confirmed=false
 const service={get:async()=>({id:1,review_state:confirmed?'confirmed':'draft',daily:[{employee_code:'=EVIL()',person_id:'00041',employee_name:'Fixture',work_date:'2026-09-21',status:'present',late_minutes:0,undertime_minutes:0,first_scan_at:null,last_scan_at:null}]})}
 await serverFor(createAttendanceReviewRouter({service,authRequired,requireRole}),async url=>{
  assert.equal((await fetch(url+'/api/attendance/batches/1/export')).status,409)
  confirmed=true;const response=await fetch(url+'/api/attendance/batches/1/export');assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(await response.text(),/'=EVIL\(\)/)
 })
 assert.match(csvRows(['Name'],[[' \t+CMD()']]),/' \t\+CMD/)
})
test('legacy direct attendance import and payroll-only leave correction are rejected',async()=>{
 const service=new Proxy({},{get(){return()=>{throw Error('Legacy write must not run')}}})
 await serverFor(createPayrollRouter({db:{},payrollService:service,authRequired,requireRole}),async url=>{
  assert.equal((await fetch(url+'/api/payroll/attendance/import',{method:'POST'})).status,409)
  assert.equal((await fetch(url+'/api/payroll/attendance/days/1',{method:'PATCH'})).status,409)
 })
})
test('payroll register retains separate signed basic adjustments, earnings and deductions',async()=>{
 const payrollService={getRun:async()=>({status:'draft',payday:'2026-09-30',lines:[{employee_code:'EMP-1',employee_name:'Fixture',details:{charges:[{type:'basic_pay_adjustment',amount:-300},{type:'other_non_taxable_earning',amount:100},{type:'tax_withholding',amount:50}],manualEarnings:[{type:'night_differential',amount:120}]},net_pay:7370}]})}
 await serverFor(createPayrollRouter({db:{},payrollService,authRequired,requireRole}),async url=>{
  assert.equal((await fetch(url+'/api/payroll/runs/1/export/register',{headers:{'x-test-role':'employee'}})).status,403)
  const response=await fetch(url+'/api/payroll/runs/1/export/register');assert.equal(response.status,200)
  const text=await response.text();assert.match(text,/'?draft/);assert.match(text,/"120","50","-300","100"/)
 })
})
