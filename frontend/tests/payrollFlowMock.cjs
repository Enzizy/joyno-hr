// Isolated, in-memory API for browser verification. No database or email connection.
// Run alongside a separate Vite instance with VITE_API_BASE_URL=http://127.0.0.1:3301.
const http = require('node:http')
const PDFDocument = require('node:module').createRequire(require('node:path').resolve(__dirname,'../../backend/package.json'))('pdfkit')
const actor = {id:1,role:'hr',email:'ui-fixture@example.test',name:'UI Fixture HR'}
const profiles = [1,2].map(id=>({employee_id:id,employee_code:`FIX-${id}`,first_name:'Sample',last_name:id===1?'Alpha':'Beta',
  monthly_basic_salary:15000,monthly_cola:0,biometric_person_id:`000${id}`,work_start_time:'09:00:00',work_end_time:'18:00:00',
  workdays:[1,2,3,4,5],effective_from:'2026-01-01',unpaid_break_minutes:60,daily_rate_divisor:261,shift:'day',contribution_settings:{sss:true,philhealth:true,pagibig:true}}))
const batch={id:1,file_name:'UI fixture attendance.csv',period_start:'2026-09-11',period_end:'2026-09-25',review_state:'draft',review_version:1,
  payroll_scope:'day',payrollScope:'day',isTest:false,is_test:false,scopeNeedsRefresh:false,issues:[],events:[],employees:profiles.map(p=>({...p,id:p.employee_id})),
  daily:profiles.map((p,i)=>({id:i+1,employee_id:p.employee_id,employee_code:p.employee_code,employee_name:`${p.first_name} ${p.last_name}`,person_id:p.biometric_person_id,
    work_date:'2026-09-11',status:i===0?'exception':'present',review_state:i===0?'pending':'clear',issue_codes:i===0?['no_record']:[],
    first_scan_at:i===0?null:'2026-09-11T01:00:00Z',last_scan_at:i===0?null:'2026-09-11T10:00:00Z',scan_count:i===0?0:2,
    late_minutes:0,undertime_minutes:0,leaves:[],schedule:'09:00–18:00',scheduled_minutes:480}))}
let run=null,calculateAttempts=0,failEmail=true
const accounts=[{id:1,email:'fixture-1@example.test',role:'employee',employee_id:1}]
const emails=new Map(),failures=new Map(),calls=[]
function lines(){return profiles.map((p,i)=>({id:i+1,employee_id:p.employee_id,employee_code:p.employee_code,employee_name:`${p.first_name} ${p.last_name}`,
  monthly_basic_salary:15000,gross_salary:7500,cola_pay:0,daily_rate:689.66,hourly_rate:86.21,
  absence_deduction:batch.daily[i].status==='absent'?689.66:0,late_deduction:0,undertime_deduction:0,
  employee_sss:750,employee_philhealth:375,employee_pagibig:200,employer_sss:1500,employer_ec:30,employer_philhealth:375,employer_pagibig:200,
  net_pay:7500-(batch.daily[i].status==='absent'?689.66:0)-1325,
  details:{manualEarnings:[],charges:[],attendance:[batch.daily[i]],contributionSettings:p.contribution_settings,
    sssAssessment:{firstCutoffPay:7500,firstCutoffSource:'assumed-half-basic',secondCutoffNetBasic:7500-(batch.daily[i].status==='absent'?689.66:0),monthlyCompensation:15000}}}))}
function recalc(line){line.net_pay=line.gross_salary-line.absence_deduction-1325+(line.details.manualEarnings||[]).reduce((s,x)=>s+Number(x.amount),0)+(line.details.charges||[]).reduce((s,x)=>s+(x.type==='other_non_taxable_earning'||x.type==='basic_pay_adjustment'?Number(x.amount):-Number(x.amount)),0)}
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value))}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5175');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,OPTIONS')
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
 const u=new URL(req.url,'http://127.0.0.1:3301'),path=u.pathname
 let raw='';for await(const part of req)raw+=part
 let body={};try{body=raw?JSON.parse(raw):{}}catch{}
 calls.push({method:req.method,path,body})
 if(path==='/health')return json(res,{status:'ok'})
 if(path==='/api/auth/me')return json(res,{user:actor})
 if(path==='/api/payroll/profiles')return json(res,u.searchParams.get('shift')==='night'?[]:profiles)
 if(path==='/api/attendance/batches')return json(res,[{...batch,pending_days:batch.daily.filter(d=>d.review_state==='pending').length}])
 if(path==='/api/attendance/batches/1')return json(res,batch)
 if(path==='/api/attendance/batches/1/review'){
   const d=batch.daily.find(d=>Number(d.employee_id)===Number(body.employeeId));if(!d)return json(res,{message:'Fixture employee missing'},404)
   d.review_state='resolved';d.status=body.decision?.action==='absent'?'absent':'present';d.review_decision=body.decision;batch.review_version++
   return json(res,batch)
 }
 if(path==='/api/attendance/batches/1/confirm'){
   if(batch.daily.some(d=>d.review_state==='pending'))return json(res,{message:'Fixture still has an undecided date'},409)
   batch.review_state='confirmed';batch.review_version++;return json(res,batch)
 }
 if(path==='/api/attendance/batches/1/reopen'){batch.review_state='draft';batch.review_version++;return json(res,batch)}
 if(path==='/api/attendance/batches/1/refresh'){batch.scopeNeedsRefresh=false;batch.review_version++;return json(res,batch)}
 if(path==='/api/payroll/runs')return json(res,run?[{...run,total_net_pay:run.lines.reduce((s,x)=>s+x.net_pay,0),has_payment:Boolean(run.payment)}]:[])
 if(path==='/api/payroll/runs/preview'){
   calculateAttempts++
   if(calculateAttempts===1)return json(res,{message:'Simulated calculation outage. Attendance remains confirmed.'},503)
   if(batch.review_state!=='confirmed'||batch.scopeNeedsRefresh)return json(res,{message:'Attendance not ready'},409)
   const saved=run?.lines
   run={id:1,period_start:batch.period_start,period_end:batch.period_end,payday:'2026-09-30',cutoff:'second',include_contributions:true,status:'draft',attendance_batch_id:1,
    rule_snapshot:{payrollScope:'day',attendanceReviewVersion:batch.review_version},lines:saved||lines()};return json(res,run)
 }
 if(path==='/api/payroll/runs/1')return json(res,run||{},run?200:404)
 if(path==='/api/payroll/runs/1/approve'){if(!run||batch.scopeNeedsRefresh)return json(res,{message:'Fixture not ready'},409);run.status='approved';run.approved_at=new Date().toISOString();run.approved_by=1;return json(res,run)}
 if(path==='/api/payroll/runs/1/undo-approval'){if(!run||run.status!=='approved'||run.payment||emails.size)return json(res,{message:'Approval cannot be undone after payment or email'},409);run.status='draft';run.approved_at=null;run.approved_by=null;return json(res,run)}
 if(path==='/api/payroll/runs/1/payment'){if(run.status!=='approved')return json(res,{message:'Approve first'},409);run.payment={reference:body.reference||'UI-FIXTURE',paid_on:body.paidOn};return json(res,run)}
 if(path==='/api/payroll/runs/1/lock'){if(!run.payment)return json(res,{message:'Record payment first'},409);run.status='locked';run.locked_at=new Date().toISOString();return json(res,run)}
 const change=path.match(/^\/api\/payroll\/runs\/1\/lines\/(\d+)\/(charges|earnings|first-cutoff-pay)$/)
 if(change){const line=run.lines.find(x=>x.id===Number(change[1]));if(change[2]==='charges')line.details.charges=body.charges;if(change[2]==='earnings')line.details.manualEarnings=body.earnings;if(change[2]==='first-cutoff-pay')line.details.sssAssessment={...line.details.sssAssessment,firstCutoffPay:body.firstCutoffPay,firstCutoffSource:'hr-override'};recalc(line);return json(res,line)}
 if(path==='/api/payroll/runs/1/payslip-deliveries')return json(res,{lines:run.lines.map(line=>({lineId:line.id,email:`fixture-${line.id}@example.test`,sentAt:emails.get(line.id)||null,failed:failures.get(line.id)||null})),testPayslipsRemovedAt:null})
 if(path.match(/\/payslips\/\d+\/send$/)){
   const id=Number(path.split('/').at(-2));if(emails.has(id))return json(res,{status:'already_sent'})
   if(id===2&&failEmail){failEmail=false;failures.set(id,'Simulated email failure');return json(res,{message:'Simulated email failure'},503)}
   emails.set(id,new Date().toISOString());failures.delete(id);return json(res,{status:'sent'})
 }
 if(path.endsWith('.pdf')){
   res.writeHead(200,{'Content-Type':'application/pdf'});const pdf=new PDFDocument({size:'LEGAL'});pdf.pipe(res);pdf.fontSize(16).text('UI FIXTURE - NOT A REAL PAYSLIP').moveDown().fontSize(12).text(`Format: ${u.searchParams.get('copies')||'1'} copies. Sample data only.`);pdf.end();return
 }
 // Employees, logins and pay profiles for the employee profile page.
 const employeeRow=p=>({id:p.employee_id,employee_code:p.employee_code,first_name:p.first_name,last_name:p.last_name,department:p.department||'Marketing',position:p.position||'Specialist',shift:p.shift,status:p.status||'active',date_hired:'2025-01-06',last_working_date:null,leave_credits:5,leave_balance_breakdown:{year:2026,balances:[{id:'sick_leave',name:'Sick leave',eligible:true,remaining:4,used:1,annual_allowance:5},{id:'vacation_leave',name:'Vacation leave',eligible:true,remaining:3,used:0,annual_allowance:3}]}})
 if(path==='/api/employees'&&req.method==='GET')return json(res,profiles.map(employeeRow))
 const employeeMatch=path.match(/^\/api\/employees\/(\d+)$/)
 if(employeeMatch){const p=profiles.find(x=>x.employee_id===Number(employeeMatch[1]));if(!p)return json(res,{message:'Employee not found'},404)
   if(req.method==='PUT')Object.assign(p,{employee_code:body.employee_code,first_name:body.first_name,last_name:body.last_name,department:body.department,position:body.position,shift:body.shift,status:body.status})
   return json(res,employeeRow(p))}
 if(path==='/api/users'&&req.method==='GET')return json(res,accounts)
 if(path==='/api/users'&&req.method==='POST'){accounts.push({id:accounts.length+10,email:body.email,role:body.role,employee_id:body.employee_id});return json(res,accounts.at(-1))}
 const profileMatch=path.match(/^\/api\/payroll\/profiles\/(\d+)(\/history)?$/)
 if(profileMatch){const p=profiles.find(x=>x.employee_id===Number(profileMatch[1]));if(!p)return json(res,{message:'Employee not found'},404)
   if(profileMatch[2])return json(res,p.history||[])
   if(req.method==='PUT'){Object.assign(p,{monthly_basic_salary:body.monthlyBasicSalary,monthly_cola:body.monthlyCola,biometric_person_id:body.biometricPersonId,work_start_time:`${body.workStartTime}:00`,work_end_time:`${body.workEndTime}:00`,workdays:body.workdays,contribution_settings:body.contributionSettings})
     p.history=[{id:Date.now(),effective_from:body.effectiveFrom,effective_to:null,monthly_basic_salary:body.monthlyBasicSalary,monthly_cola:body.monthlyCola,work_start_time:p.work_start_time,work_end_time:p.work_end_time,contribution_settings:p.contribution_settings},...(p.history||[])]
     return json(res,p)}}
 if(path==='/fixture/state')return json(res,{run,batch,calls,calculateAttempts,emails:[...emails.keys()]})
 if(path==='/api/leave-types'||path.includes('/notifications'))return json(res,[])
 return req.method==='GET'?json(res,[],200):json(res,{message:`Unsupported fixture action ${path}`},501)
})
server.listen(3301,'127.0.0.1',()=>process.stdout.write('UI fixture API: 127.0.0.1:3301; in-memory only\n'))
