const express=require('express')
const multer=require('multer')
const {MANAGEMENT_ROLES}=require('../constants/roles')
const {decodeAttendanceCsv,mergeAttendanceCsvs}=require('../services/payrollAttendanceService')
const {csvRows}=require('../services/hrmsCsvService')

function createAttendanceReviewRouter({service,authRequired,requireRole}){
 const MAX_FILES=4
 const router=express.Router(), upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:MAX_FILES}})
 router.use('/api/attendance',authRequired,requireRole(MANAGEMENT_ROLES))
 router.param('id',(req,res,next,value)=>Number.isSafeInteger(Number(value))&&Number(value)>0?next():res.status(400).json({message:'Invalid attendance batch ID'}))
 router.use('/api/attendance/batches/:id',(req,res,next)=>{
  if(req.method==='POST'&&(!Number.isSafeInteger(Number(req.body?.version))||Number(req.body.version)<1))return res.status(400).json({message:'A valid review version is required'})
  next()
 })
 const handler=fn=>async(req,res)=>{
  try{res.json(await fn(req))}catch(e){
   if(e.code==='40001')return res.status(409).json({message:'Attendance changed during this operation. Reload and try again.'})
   if(e.code==='23505')return res.status(409).json({message:'Another HR session saved a matching attendance review. Reload the saved reviews.'})
   const validation=e instanceof TypeError||e instanceof RangeError||/invalid|required|valid/i.test(e.message)
   if(!e.statusCode&&!validation)console.error('[attendance] unexpected error:',e)
   res.status(e.statusCode||(validation?400:500)).json({message:e.statusCode||validation?e.message:'Attendance operation failed'})
  }
 }
 // One or more biometric exports ("file" or "files"); several are merged into one review, for example
 // the September and October exports for the 15th payday's Sep 26 – Oct 10 work dates.
 const file=(req,res,next)=>upload.fields([{name:'file',maxCount:1},{name:'files',maxCount:MAX_FILES}])(req,res,error=>{
  if(error)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({message:`Upload up to ${MAX_FILES} CSV files, each up to 10 MB`})
  const files=[...(req.files?.file||[]),...(req.files?.files||[])]
  if(!files.length||files.some(f=>!f.originalname.toLowerCase().endsWith('.csv')||f.buffer.includes(0)))return res.status(415).json({message:'Upload valid CSV files'})
  let employeeIds,csvText
  try{employeeIds=req.body.employeeIds ? JSON.parse(req.body.employeeIds) : undefined}catch{return res.status(400).json({message:'Choose valid employees'})}
  try{csvText=mergeAttendanceCsvs(files.map(f=>decodeAttendanceCsv(f.buffer)))}catch(e){return res.status(400).json({message:e.message})}
  req.attendanceInput={fileName:files.map(f=>f.originalname).join(' + ').slice(0,255),csvText,periodStart:req.body.periodStart,periodEnd:req.body.periodEnd,previewToken:req.body.previewToken,payrollScope:req.body.shift,isTest:req.body.isTest==='true',employeeIds}
  next()
 })
 router.post('/api/attendance/preview',file,handler(req=>service.preview(req.attendanceInput)))
 router.post('/api/attendance/drafts',file,handler(req=>service.save(req.attendanceInput,req.user)))
 router.get('/api/attendance/batches',handler(req=>service.list(req.query.shift)))
 router.get('/api/attendance/batches/:id',handler(req=>service.get(req.params.id)))
 router.get('/api/attendance/batches/:id/export',async(req,res)=>{
  try{
   const batch=await service.get(req.params.id)
   if(!batch)return res.status(404).json({message:'Attendance batch not found'})
   if(batch.review_state!=='confirmed')return res.status(409).json({message:'Confirm attendance before exporting official DTR'})
   const local=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',hour12:false}):''
   res.set('Cache-Control','private, no-store').type('text/csv').attachment(`${batch.isTest?'TEST-ONLY-':''}attendance-${batch.id}-confirmed.csv`).send(csvRows(
    ['Practice data','Review ID','Employee ID','Attendance ID','Employee','Work date','Status','Time in (Manila)','Time out (Manila)','Late minutes','Undertime minutes','Leave record ID','Day type','Approved OT hours','Verification reason'],
    batch.daily.map(d=>[batch.isTest?'TEST ONLY':'',batch.id,d.employee_code,d.person_id,d.employee_name,d.work_date,d.status,local(d.first_scan_at),local(d.last_scan_at),d.late_minutes,d.undertime_minutes,d.leave_request_id,d.review_decision?.dayType==='special_holiday'?'Special holiday / rest day':d.review_decision?.dayType==='rest_day'?'Rest day':'Regular',Number(d.review_decision?.overtimeHours||0),d.correction_reason])))
  }catch(e){res.status(500).json({message:'Unable to export attendance'})}
 })
 router.post('/api/attendance/batches/:id/refresh',handler(req=>service.refresh(req.params.id,req.body.version,req.user)))
 router.post('/api/attendance/batches/:id/review',(req,res,next)=>{
  if(!Number.isSafeInteger(Number(req.body?.employeeId))||Number(req.body.employeeId)<1||!/^\d{4}-\d{2}-\d{2}$/.test(req.body.date||'')||!req.body.decision||typeof req.body.decision!=='object'||Array.isArray(req.body.decision))return res.status(400).json({message:'A valid employee, date, and HR decision are required'})
  next()
 },handler(req=>service.resolve(req.params.id,req.body.version,req.body.employeeId,req.body.date,req.body.decision,req.user)))
 router.post('/api/attendance/batches/:id/confirm',handler(req=>service.confirm(req.params.id,req.body.version,req.body.coverageReason,req.user)))
 router.post('/api/attendance/batches/:id/correct-leave',(req,res,next)=>Number.isSafeInteger(Number(req.body?.leaveId))&&Number(req.body.leaveId)>0?next():res.status(400).json({message:'Choose a valid official leave record'}),handler(req=>service.revokeLeave(req.params.id,req.body.version,req.body.leaveId,req.body.reason,req.user)))
 return router
}
module.exports={createAttendanceReviewRouter}
