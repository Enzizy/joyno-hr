<script setup>
import PayrollShiftTabs from '@/components/payroll/PayrollShiftTabs.vue'
import {payrollShift,reviewScope,shiftLabel} from '@/utils/payrollScope'
import {computed,nextTick,onMounted,ref,watch} from 'vue'
import {standardPeriod,formatWorkRange,coversWorkDates,attendanceSelection} from '@/utils/payrollPeriods'
import {useRoute,useRouter} from 'vue-router'
import {useToastStore} from '@/stores/toastStore'
import {attendanceUpload,listAttendanceReviews,getAttendanceReview,attendanceReviewAction,createHrCalendarEntry,getLeaveTypes,getConfirmedAttendanceExport} from '@/services/api'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import HrCalendarEntryModal from '@/components/leave/HrCalendarEntryModal.vue'
import PayRunNextStep from '@/components/payroll/PayRunNextStep.vue'
import MoreMenu from '@/components/ui/MoreMenu.vue'
import {profileReady} from '@/utils/payRun'
import {getPayrollProfiles} from '@/services/backendService'

// Embedded inside a pay run: the run owns shift, practice mode and work dates, so their pickers are hidden.
const props=defineProps({embedded:Boolean,payCalculated:Boolean})
const emit=defineEmits(['changed','continue'])
const route=useRoute(),router=useRouter(),toast=useToastStore()
const shift=ref(payrollShift(route.query.shift))
watch(()=>route.query.shift,value=>{if(value!==undefined)shift.value=payrollShift(value)})
const shiftName=computed(()=>shiftLabel(shift.value))
const practiceMode=ref(route.query.practice==='true'),configuredProfiles=ref([]),selectedEmployees=ref([])
const readyEmployees=computed(()=>configuredProfiles.value.filter(profileReady))
const practiceOptions=()=>practiceMode.value?{isTest:true,employeeIds:selectedEmployees.value}:{}
const previewGroups=computed(()=>{
 const groups=new Map()
 for(const day of preview.value?.daily||[]){if(day.review_state!=='pending')continue;let group=groups.get(day.employee_id);if(!group){group={id:day.employee_id,name:day.employee_name,days:0,findings:new Set()};groups.set(day.employee_id,group)}group.days++;day.issue_codes.forEach(c=>group.findings.add(labels[c]||c))}
 return [...groups.values()].map(g=>({...g,findings:[...g.findings]}))
})
const previewSetupCount=computed(()=>(preview.value?.daily||[]).filter(d=>d.issue_codes.some(c=>['missing_profile','missing_attendance_id','missing_hire_date','unsupported_schedule'].includes(c))).length)
watch([practiceMode,selectedEmployees],()=>{preview.value=null;showPreview.value=false},{deep:true})
// Inside a pay run, list only the other files for these work dates; the open one is already on screen.
const visibleBatches=computed(()=>batches.value.filter(b=>reviewScope(b)===shift.value&&(!props.embedded||(Boolean(b.is_test)===practiceMode.value&&coversWorkDates(b,start.value,end.value)&&b.id!==batch.value?.id))))
watch(shift,async()=>{await newImport();await reload()})
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
const initialPeriod=attendanceSelection(route.query,today.slice(0,7))
const attendanceMonth=ref(initialPeriod.month),cycle=ref(initialPeriod.cycle)
const payrollOrigin=ref(standardPeriod(String(route.query.payrollMonth||''),String(route.query.cutoff||''))?{payrollMonth:String(route.query.payrollMonth),cutoff:String(route.query.cutoff)}:null)
const start=ref(initialPeriod.start),end=ref(initialPeriod.end),files=ref([]),busy=ref(false),error=ref(''),showImport=ref(!route.query.batch)
const fileInputKey=ref(0)
// Files are added one pick at a time (the device exports one month per file); the same file is not added twice.
function addFiles(event){const picked=[...(event.target.files||[])];files.value=[...files.value,...picked.filter(f=>!files.value.some(g=>g.name===f.name&&g.size===f.size))];fileInputKey.value++}
function removeFile(index){files.value=files.value.filter((_,i)=>i!==index)}
const monthName=key=>new Intl.DateTimeFormat('en-PH',{month:'long',timeZone:'UTC'}).format(new Date(`${key}T00:00:00Z`))
// The 15th payday's work dates (26th to 10th) cross two months, and the device exports one month at a time.
const spansMonths=computed(()=>Boolean(start.value&&end.value)&&start.value.slice(0,7)!==end.value.slice(0,7))
let syncingRange=false
const preview=ref(null),showPreview=ref(false),batch=ref(null),batches=ref([]),search=ref(''),showAllDays=ref(false)
const reviewing=ref(null),decision=ref({action:'acknowledge',reason:'',timeIn:'',timeOut:'',leaveId:null}),coverageReason=ref('')
const leaveEntry=ref(null),leaveTypes=ref([])
const correctingLeave=ref(null)
const payrollTarget=computed(()=>({path:'/payroll',query:{shift:shift.value,practice:String(batch.value?.isTest??practiceMode.value),...(payrollOrigin.value||{payrollMonth:attendanceMonth.value,cutoff:cycle.value==='custom'?(end.value.endsWith('-10')?'first':'second'):cycle.value}),...(batch.value?.review_state==='confirmed'?{attendanceBatch:batch.value.id}:{})}}))
function rangeQuery(){const query={...route.query,shift:shift.value,practice:String(practiceMode.value),...(payrollOrigin.value||{payrollMonth:attendanceMonth.value,cutoff:cycle.value})};if(cycle.value==='custom'){query.firstWorkDate=start.value;query.lastWorkDate=end.value}else{delete query.firstWorkDate;delete query.lastWorkDate}return query}
// The review that was open before "Upload a different file", so HR can go back to it.
const returnBatch=ref(null)
async function newImport(){returnBatch.value=props.embedded?batch.value?.id??null:null;batch.value=null;showImport.value=true;files.value=[];fileInputKey.value++;preview.value=null;showPreview.value=false;error.value='';coverageReason.value='';const query=rangeQuery();delete query.batch;await router.replace({query})}
watch([attendanceMonth,cycle],()=>{
 if(syncingRange)return
 payrollOrigin.value=null
 const period=standardPeriod(attendanceMonth.value,cycle.value)
 if(period){start.value=period.start;end.value=period.end}
 batch.value=null;showImport.value=true
 const query=rangeQuery();delete query.batch;router.replace({query})
})
function correctLeave(leave){reviewing.value=null;correctingLeave.value={leave,reason:''}}
async function saveLeaveCorrection(){await run(async()=>{batch.value=await attendanceReviewAction(batch.value.id,'correct-leave',{version:batch.value.review_version,leaveId:correctingLeave.value.leave.id,reason:correctingLeave.value.reason});correctingLeave.value=null;await reloadChanged();toast.success('Incorrect leave cancelled with history retained; attendance refreshed')})}
const labels={rest_day_work:'Scans on a rest day',late_undertime:'Late / undertime',no_record:'No scans',missing_punch:'Missing time-in or time-out',pending_leave:'Pending leave',leave_conflict:'Conflicting leave',leave_reconciliation:'Reconcile official leave',missing_profile:'Salary / schedule not configured',missing_attendance_id:'Attendance ID not mapped',missing_hire_date:'Hire date missing',unsupported_schedule:'Schedule needs setup'}
const missedMinutes=d=>Number(d.late_minutes||0)+Number(d.undertime_minutes||0)
const dayLabel=date=>new Intl.DateTimeFormat('en-PH',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`))
// Days worth listing under an employee: anything decided, deducted, or still open.
const notable=d=>d.review_state!=='clear'||missedMinutes(d)>0||d.status!=='present'||Boolean(approvedWorkLabel(d))
// One group per employee, employees with open decisions first.
const groups=computed(()=>{
 const q=search.value.trim().toLowerCase(),byEmployee=new Map()
 for(const d of batch.value?.daily||[]){
  if(q&&!`${d.employee_name} ${d.employee_code} ${d.person_id} ${d.work_date}`.toLowerCase().includes(q))continue
  let g=byEmployee.get(d.employee_id)
  if(!g){g={id:d.employee_id,name:d.employee_name,code:d.employee_code,personId:d.person_id,days:[],pending:0,late:0,undertime:0,absent:0,overtime:0,fullDays:0};byEmployee.set(d.employee_id,g)}
  g.days.push(d)
  if(d.review_state==='pending')g.pending++
  g.late+=Number(d.late_minutes||0);g.undertime+=Number(d.undertime_minutes||0);g.overtime+=Number(d.review_decision?.overtimeHours||0)
  // A day off marked as not worked is not an absence.
  if(['absent','unpaid_leave'].includes(d.status)&&!d.issue_codes?.includes('rest_day_work'))g.absent++
  if(['excused','verified_work'].includes(d.review_decision?.action))g.fullDays++
 }
 return [...byEmployee.values()].map(g=>({...g,shown:showAllDays.value?g.days:g.days.filter(notable)}))
  .sort((a,b)=>(b.pending>0)-(a.pending>0)||(b.shown.length>0)-(a.shown.length>0)||a.name.localeCompare(b.name))
})
const groupSummary=g=>[g.late?`${g.late} min late`:null,g.undertime?`${g.undertime} min undertime`:null,g.absent?`${g.absent} absent`:null,g.fullDays?`${g.fullDays} counted as full day`:null,g.overtime?`${g.overtime} h OT`:null].filter(Boolean).join(' · ')||'No deductions'
const reviewTotals=computed(()=>{
 const daily=batch.value?.daily||[]
 return {employees:new Set(daily.map(d=>d.employee_id)).size,absent:daily.filter(d=>['absent','unpaid_leave'].includes(d.status)&&!d.issue_codes?.includes('rest_day_work')).length,
  fullDays:daily.filter(d=>['excused','verified_work'].includes(d.review_decision?.action)).length,
  late:daily.reduce((sum,d)=>sum+missedMinutes(d),0),overtime:daily.reduce((sum,d)=>sum+Number(d.review_decision?.overtimeHours||0),0)}
})
const totalsText=computed(()=>{const t=reviewTotals.value;return [`${t.employees} employees`,t.absent?`${t.absent} absent`:null,t.fullDays?`${t.fullDays} counted as full day`:null,t.late?`${t.late} min late / undertime`:null,t.overtime?`${t.overtime} h OT`:null].filter(Boolean).join(' · ')})
const isConfirmed=computed(()=>batch.value?.review_state==='confirmed')
const showHistory=ref(false)
const moreItems=computed(()=>[
 ...(isConfirmed.value?[{label:'Download confirmed DTR (CSV)',onSelect:exportDtr}]:[{label:'Reload employee setup and leave',onSelect:refresh}]),
 ...(batch.value?.events?.length?[{label:'View change history',onSelect:()=>{showHistory.value=true}}]:[]),
 {label:'Upload a different file',onSelect:newImport,danger:true},
])
const employeeNames=computed(()=>new Map((batch.value?.daily||[]).map(d=>[Number(d.employee_id),d.employee_name])))
function eventText(event){
 const date=event.work_date?dayLabel(String(event.work_date).slice(0,10)):''
 if(event.action==='day_reviewed')return `${employeeNames.value.get(Number(event.employee_id))||'Employee'} · ${date} — ${event.reason}`
 return {draft_saved:'Attendance file saved for review',refreshed:'Employee setup and leave reloaded',confirmed:'Attendance confirmed',official_leave_corrected:`Official leave cancelled — ${event.reason}`}[event.action]||event.reason||event.action
}
const toggled=ref(new Set())
const isOpen=g=>Boolean(search.value.trim())||((g.pending>0)!==toggled.value.has(g.id))
function toggleGroup(id){const next=new Set(toggled.value);next.has(id)?next.delete(id):next.add(id);toggled.value=next}
const pending=computed(()=>(batch.value?.daily||[]).filter(d=>d.review_state==='pending').length)
const blocking=computed(()=>(batch.value?.issues||[]).filter(i=>i.code!=='file_coverage'))
const hasCoverageIssue=computed(()=>(batch.value?.issues||[]).some(i=>i.code==='file_coverage'))
const needsSetup=computed(()=>reviewing.value?.issue_codes?.some(c=>['missing_profile','missing_attendance_id','missing_hire_date','unsupported_schedule'].includes(c)))
const stamp=value=>value?new Date(value).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:false}):'—'
watch([start,end,files],()=>{preview.value=null;showPreview.value=false})
watch([start,end],()=>{if(!syncingRange&&cycle.value==='custom')router.replace({query:rangeQuery()})})
async function run(fn){busy.value=true;error.value='';try{return await fn()}catch(e){error.value=e.message;toast.error(e.message)}finally{busy.value=false}}
async function reload(){const selectedShift=shift.value;const [loaded,profileResult]=await Promise.all([listAttendanceReviews(selectedShift),getPayrollProfiles(selectedShift)]);if(selectedShift===shift.value){batches.value=loaded;configuredProfiles.value=Array.isArray(profileResult)?profileResult:profileResult.profiles||[];selectedEmployees.value=selectedEmployees.value.filter(id=>readyEmployees.value.some(p=>Number(p.employee_id)===id));if(!selectedEmployees.value.length)selectedEmployees.value=readyEmployees.value.map(p=>Number(p.employee_id))}}
async function reloadChanged(){await reload();emit('changed')}
async function open(id){await run(async()=>{
 const loaded=await getAttendanceReview(id);if(!loaded)throw Error('Attendance review not found')
 if(reviewScope(loaded)!==shift.value)throw Error('This review belongs to a different shift. Select its shift first.')
 files.value=[];fileInputKey.value++
 const originatingPeriod=payrollOrigin.value&&standardPeriod(payrollOrigin.value.payrollMonth,payrollOrigin.value.cutoff)
 if(originatingPeriod&&!coversWorkDates(loaded,originatingPeriod.start,originatingPeriod.end))payrollOrigin.value=null
 syncingRange=true
 attendanceMonth.value=loaded.period_end.slice(0,7)
 const type=loaded.period_end.endsWith('-10')?'first':'second',period=standardPeriod(attendanceMonth.value,type)
 cycle.value=period?.start===loaded.period_start&&period?.end===loaded.period_end?type:'custom'
 start.value=loaded.period_start;end.value=loaded.period_end
 await nextTick();syncingRange=false
 practiceMode.value=loaded.isTest===true;if(loaded.employeeIds)selectedEmployees.value=loaded.employeeIds;batch.value=loaded;showImport.value=Boolean(loaded.needs_reimport);coverageReason.value=''
 await router.replace({query:{...rangeQuery(),batch:id}})
})}
async function analyse(){await run(async()=>{preview.value=await attendanceUpload('preview',files.value,start.value,end.value,'',shift.value,practiceOptions());showPreview.value=true})}
async function save(alsoConfirm=false){await run(async()=>{
 batch.value=await attendanceUpload('drafts',files.value,start.value,end.value,preview.value.preview_token,shift.value,practiceOptions())
 showPreview.value=false;preview.value=null;showImport.value=false;router.replace({query:{...rangeQuery(),batch:batch.value.id}})
 if(alsoConfirm)batch.value=await attendanceReviewAction(batch.value.id,'confirm',{version:batch.value.review_version})
 await reloadChanged();toast.success(alsoConfirm?'Attendance confirmed':'Saved for HR review')
})}
async function refresh(){await run(async()=>{batch.value=await attendanceReviewAction(batch.value.id,'refresh',{version:batch.value.review_version});await reloadChanged();toast.success('Review refreshed from employee setup and official leave')})}
// HR answers "what happened on this day?". Only the answers the review accepts for this kind of day are offered.
const decisionOptions=computed(()=>{
 const d=reviewing.value;if(!d)return []
 const noScans=!d.first_scan_at&&!d.last_scan_at,missed=Number(d.late_minutes||0)+Number(d.undertime_minutes||0)
 // An excused day stores zero minutes, so the original lateness is only known to the server.
 const excused=d.review_decision?.action==='excused'
 const all={
  acknowledge:{title:missed?`Deduct the ${missed} late / undertime minutes`:excused?'Deduct the late / undertime as recorded':'Keep the recorded times',hint:missed||excused?'As recorded by the biometrics.':'Nothing is deducted.'},
  excused:{title:'Count as a full day (no deduction)',hint:'For company tasks such as lab tests, client visits or errands, or an approved late arrival. The real scans are kept.'},
  actual_times:{title:noScans?'They worked: enter their real times':'Enter the real time-in and time-out',hint:'Use this if they forgot to scan, used the wrong door, or worked offsite (for example a company event). Deductions are recalculated from the times you enter.'},
  absent:{title:'They did not come to work',hint:'Unpaid absence. One day of pay is deducted.'},
  verified_work:{title:noScans?'They worked a full day but have no scans':'They worked a full day but the scans are incomplete',hint:'Counted as a full day with no deduction. Write who confirmed it in the reason.'},
  link_leave:{title:'They were on approved leave',hint:'Uses the official leave record, paid or unpaid as approved.'},
  not_work:{title:'They didn’t work (only visited)',hint:'For example, they came in to pick something up. Counted as an absence: one day’s pay is deducted, and the scans are ignored.'},
 }
 if(d.issue_codes?.includes('rest_day_work')){
  const paidHours=Math.round(Math.max(0,480-missed)/60*100)/100
  Object.assign(all,{
   acknowledge:{title:'They worked their rest day',hint:noScans?'Paid 130% of the daily rate for the hours worked.':`Paid 130% of the daily rate for ${paidHours} h worked (${stamp(d.first_scan_at)}–${stamp(d.last_scan_at)}). Add overtime below for hours past a normal day.`},
   verified_work:{title:'They worked a full rest day, but the scans are incomplete',hint:'Paid as a full rest day: 130% of the daily rate.'},
   not_work:{title:'Not work: don’t pay',hint:'For example, they only came in to pick something up.'},
  })
  return (d.status==='exception'?['actual_times','verified_work','not_work']:['acknowledge','actual_times','not_work']).map(value=>({value,...all[value]}))
 }
 const keys=d.status==='exception'?(noScans?['absent','verified_work','actual_times']:['actual_times','verified_work'])
  :d.issue_codes?.includes('leave_reconciliation')?['actual_times']:(missed||excused)&&!d.leave_request_id?['acknowledge','excused','actual_times']:['acknowledge','actual_times']
 // Scans on a workday without leave can still be a visit, not work.
 if(!noScans&&!d.leave_request_id&&!d.issue_codes?.includes('leave_reconciliation'))keys.push('not_work')
 if(d.leaves?.some(l=>l.status==='approved'))keys.push('link_leave')
 return keys.map(value=>({value,...all[value]}))
})
const recordedSummary=computed(()=>{const d=reviewing.value;if(!d)return '';if(!d.first_scan_at&&!d.last_scan_at)return 'No scans recorded';return `Recorded: in ${stamp(d.first_scan_at)} · out ${stamp(d.last_scan_at)} · ${Number(d.late_minutes||0)} min late · ${Number(d.undertime_minutes||0)} min undertime`})
const allowsApprovedWork=computed(()=>['acknowledge','excused','actual_times','verified_work'].includes(decision.value.action))
function review(day){reviewing.value=day;const noScans=!day.first_scan_at&&!day.last_scan_at;const restDay=day.issue_codes?.includes('rest_day_work');decision.value={action:restDay?(day.review_decision?.action||(day.status==='exception'?'':'acknowledge')):day.review_decision?.action==='excused'?'excused':day.status==='exception'?(noScans?'':'actual_times'):day.issue_codes?.includes('leave_reconciliation')?(day.leaves?.some(l=>l.status==='approved')?'link_leave':'actual_times'):'acknowledge',reason:'',timeIn:day.first_scan_at?stamp(day.first_scan_at):'',timeOut:day.last_scan_at?stamp(day.last_scan_at):'',leaveId:day.leave_request_id,dayType:restDay?'rest_day':day.review_decision?.dayType||'regular',overtimeHours:Number(day.review_decision?.overtimeHours||0)}}
const approvedWorkLabel=d=>{const ot=Number(d.review_decision?.overtimeHours||0),type=d.review_decision?.dayType,special=type==='special_holiday'||type==='rest_day';return special||ot?[type==='rest_day'?'Rest day work (130%)':special?'Special holiday / rest day':null,ot?`OT ${ot} h`:null].filter(Boolean).join(' · '):''}
async function resolve(){await run(async()=>{
 batch.value=await attendanceReviewAction(batch.value.id,'review',{version:batch.value.review_version,employeeId:reviewing.value.employee_id,date:reviewing.value.work_date,decision:decision.value})
 reviewing.value=null;await reloadChanged();toast.success('HR verification saved')
})}
async function confirm(){await run(async()=>{batch.value=await attendanceReviewAction(batch.value.id,'confirm',{version:batch.value.review_version,coverageReason:coverageReason.value});await reloadChanged();toast.success('Attendance confirmed for payroll')})}
async function exportDtr(){await run(async()=>{const url=URL.createObjectURL(await getConfirmedAttendanceExport(batch.value.id));const a=document.createElement('a');a.href=url;a.download=`${batch.value.isTest?'TEST-ONLY-':''}attendance-${reviewScope(batch.value)}-${batch.value.id}-confirmed.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})}
function recordLeave(day){reviewing.value=null;leaveEntry.value={entry_type:'leave',employee_id:day.employee_id,start_date:day.work_date,end_date:day.work_date,coverage_start:day.overnight?'02:00':'14:00',coverage_end:day.overnight?'06:00':'18:00'}}
async function saveLeave(entry){await run(async()=>{await createHrCalendarEntry(entry);leaveEntry.value=null;batch.value=await attendanceReviewAction(batch.value.id,'refresh',{version:batch.value.review_version});await reloadChanged();toast.success('Official leave recorded; attendance refreshed')})}
onMounted(()=>run(async()=>{await reload();leaveTypes.value=await getLeaveTypes();if(route.query.batch)await open(route.query.batch)}))
watch(()=>route.query.batch,id=>{if(id&&String(batch.value?.id)!==String(id)&&!busy.value)open(id)})
</script>

<template>
 <div class="space-y-6">
  <PageHeader v-if="!embedded" title="Attendance"><template #actions><AppButton v-if="batch" variant="secondary" size="sm" @click="newImport">New import</AppButton><RouterLink v-if="route.query.payrollMonth" :to="payrollTarget" class="text-sm font-semibold text-primary-300 hover:underline">Back to payroll →</RouterLink></template></PageHeader>
  <PayrollShiftTabs v-if="!embedded" v-model="shift" :disabled="busy" />
  <p v-if="batch?.isTest && !embedded" class="rounded-xl border border-sky-700/40 bg-sky-950/20 p-4 text-sm text-sky-200"><strong>Practice attendance · TEST ONLY</strong> — selected employees only. This review uses current salaries as test values.</p>
  <p v-if="error" role="alert" class="rounded-xl border border-red-800 bg-red-950/20 p-4 text-red-200">{{error}}</p>
  <section v-if="showImport" class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
   <div class="border-b border-gray-800 px-5 py-4"><button v-if="returnBatch" type="button" class="mb-2 text-sm font-semibold text-primary-300 hover:underline" :disabled="busy" @click="open(returnBatch)">← Back to the current review</button><h2 class="font-semibold text-gray-100">{{batch?.needs_reimport?'Re-upload the original attendance file':'Import biometric attendance'}}</h2><p class="mt-1 text-sm text-gray-400">{{batch?.needs_reimport?'The older import needs a fresh HR review. Its work dates are already selected below.':embedded?'Upload the biometric export for this payday’s work dates.':'Choose the payroll cutoff that this export belongs to.'}}</p></div>
   <div v-if="!embedded||practiceMode" class="border-b border-gray-800 p-5">
    <p v-if="embedded" class="text-sm font-semibold text-gray-100">Employees in this practice run</p><label v-else class="flex cursor-pointer items-center gap-3 text-sm font-semibold"><input v-model="practiceMode" type="checkbox" class="h-4 w-4" :disabled="busy">Practice payroll with selected employees</label>
    <div v-if="practiceMode" class="mt-3 space-y-3"><p class="text-xs leading-5 text-sky-200">TEST ONLY. Use current configured salaries for these dates, even if their effective date is later. Other employees are excluded. Only the people you tick can receive the test payslips.</p><div class="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{{selectedEmployees.length}} of {{readyEmployees.length}} configured employees selected</span><div class="flex gap-3"><button class="text-primary-300 underline" :disabled="busy" @click="selectedEmployees=readyEmployees.map(p=>Number(p.employee_id))">Select all</button><button class="text-gray-400 underline" :disabled="busy" @click="selectedEmployees=[]">Clear</button></div></div><div class="max-h-52 overflow-auto rounded-lg border border-gray-800 divide-y divide-gray-800"><label v-for="p in readyEmployees" :key="p.employee_id" class="flex cursor-pointer items-center gap-3 p-3 text-sm"><input v-model="selectedEmployees" type="checkbox" :value="Number(p.employee_id)" :disabled="busy"><span class="min-w-0 flex-1">{{p.first_name}} {{p.last_name}}<span class="block text-xs text-gray-500">Employee {{p.employee_code}} · Attendance {{p.biometric_person_id}} · Effective {{String(p.effective_from).slice(0,10)}}</span></span><span :class="Number(p.monthly_basic_salary)<1?'text-amber-300':'text-gray-300'">₱{{Number(p.monthly_basic_salary).toLocaleString('en-PH')}} / month<span v-if="Number(p.monthly_basic_salary)<1" class="block text-xs">Verify this test salary</span></span></label><p v-if="!readyEmployees.length" class="p-3 text-sm text-gray-400">Set a salary and Attendance ID in Pay &amp; schedules first.</p></div></div>
   </div>
   <div class="grid gap-6 p-5" :class="embedded ? '' : 'lg:grid-cols-2'">
    <!-- Inside a pay run the work dates are already in the page header, so only the upload is shown. -->
    <div v-if="!embedded" class="space-y-4">
     <div v-if="!embedded" class="grid gap-4 sm:grid-cols-2"><label class="text-sm text-gray-300">Payroll month<input v-model="attendanceMonth" type="month" class="form-control mt-2"></label><label class="text-sm text-gray-300">Payday<select v-model="cycle" class="form-control mt-2"><option value="first">15th payday</option><option value="second">Month-end payday</option><option value="custom">Other work dates</option></select></label></div>
     <div class="rounded-lg border border-primary-800/40 bg-primary-950/20 p-4"><p class="text-xs font-semibold uppercase tracking-wide text-primary-300">Work dates to check</p><p class="mt-2 font-semibold text-gray-100">{{formatWorkRange(start,end)}}</p><p class="mt-2 text-xs leading-5 text-gray-400">The first and last work dates included in this attendance review. Missing scans and leave are checked within this range, including employees absent from the file.</p></div>
     <div v-if="!embedded&&cycle==='custom'" class="grid gap-3 sm:grid-cols-2"><label class="text-sm text-gray-300">First work date<input v-model="start" type="date" class="form-control mt-2"></label><label class="text-sm text-gray-300">Last work date<input v-model="end" type="date" :min="start" class="form-control mt-2"></label></div>
     <p v-else-if="!embedded" class="text-xs text-gray-500">For the {{cycle==='first'?'15th payday, work dates run from the previous month’s 26th through this month’s 10th.':'month-end payday, work dates run from the 11th through the 25th.'}}</p>
    </div>
    <div class="flex flex-col justify-between gap-4 rounded-lg border border-dashed border-gray-700 bg-gray-950/30 p-5">
     <div><h3 class="text-sm font-semibold text-gray-100">{{shiftName}} export</h3><p class="mt-2 text-sm leading-6 text-gray-400">{{shift==='night'?'Upload the Night shift export, including the morning clock-outs after the last work date.':'Upload the Day shift export for the work dates shown.'}}</p><p v-if="spansMonths" class="mt-3 rounded-lg border border-sky-800/50 bg-sky-950/20 p-3 text-xs leading-5 text-sky-200">These work dates cross two months. If the device exports one month at a time, add the {{monthName(start)}} and {{monthName(end)}} files; they are checked as one.</p>
      <label class="mt-4 block text-sm text-gray-300">{{files.length?'Add another file':'Biometric CSV'}}<input :key="fileInputKey" type="file" accept=".csv" multiple class="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-3 file:py-2 file:text-gray-200" @change="addFiles"></label>
      <ul v-if="files.length" class="mt-3 space-y-1.5"><li v-for="(picked,index) in files" :key="picked.name+picked.size" class="flex items-center justify-between gap-3 rounded-lg border border-gray-800 px-3 py-2 text-xs"><span class="min-w-0 break-all text-gray-300">{{picked.name}}</span><button type="button" class="shrink-0 rounded px-1.5 text-gray-500 hover:bg-red-950/30 hover:text-red-300" :aria-label="`Remove ${picked.name}`" :disabled="busy" @click="removeFile(index)">✕</button></li></ul></div>
     <div><AppButton class="w-full" :disabled="!files.length||!start||!end||end<start||(practiceMode&&!selectedEmployees.length)" :loading="busy" @click="analyse">Preview &amp; check attendance →</AppButton><p class="mt-2 text-xs leading-5 text-gray-500">Preview first. No attendance is saved until HR confirms the next step.</p></div>
    </div>
   </div>
   <details class="border-t border-gray-800 px-5 py-3 text-xs text-gray-500"><summary class="cursor-pointer">How biometric scans are interpreted</summary><p class="mt-2 leading-5">Main Door Out is time-in; Main Door IN is time-out. New Bio can supply the first or last scan. Intermediate scans are ignored. Attendance IDs are mapped separately from Employee IDs. Night shifts use the date they start; morning clock-outs belong to the previous night.</p></details>
  </section>
  <section v-if="batch && !batch.needs_reimport" class="rounded-xl border border-gray-800 p-5">
   <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="font-semibold text-gray-100">{{isConfirmed?'Attendance':'Review attendance'}}</h2><p class="mt-1 text-sm text-gray-400">{{formatWorkRange(batch.period_start,batch.period_end)}} · {{batch.file_name}}</p></div><MoreMenu :items="moreItems" /></div>
   <div v-if="batch.issues?.length && !isConfirmed" class="mt-4 rounded-lg border border-amber-800/50 p-3 text-sm text-amber-200"><p v-for="i in batch.issues" :key="i.message">{{i.message}}</p></div>
   <div class="my-4 flex flex-wrap items-center gap-4"><input v-model="search" aria-label="Search attendance" placeholder="Search employee, ID or date" class="form-control max-w-sm"><label class="text-sm"><input v-model="showAllDays" type="checkbox"> Show days without issues</label><span v-if="!isConfirmed" class="text-xs text-gray-500">Turn this on to add overtime or holiday work on a normal day.</span></div>
   <div class="divide-y divide-gray-800 rounded-lg border border-gray-800">
    <div v-for="g in groups" :key="g.id">
     <button type="button" class="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left hover:bg-gray-900/60" :aria-expanded="isOpen(g)" @click="toggleGroup(g.id)">
      <span class="flex min-w-0 items-start gap-3"><span class="mt-0.5 text-gray-500" aria-hidden="true">{{isOpen(g)?'▾':'▸'}}</span><span class="min-w-0"><span class="block font-semibold text-gray-100">{{g.name}}</span><span class="block text-xs text-gray-500">Employee ID {{g.code}} · Attendance ID {{g.personId||'Not mapped'}}</span></span></span>
      <span class="flex flex-wrap items-center gap-3 text-xs"><span class="text-gray-400">{{groupSummary(g)}}</span><span v-if="g.pending" class="rounded-full border border-amber-700/60 px-2 py-0.5 font-semibold text-amber-300">{{g.pending}} to decide</span><span v-else-if="!isConfirmed" class="font-semibold text-emerald-300">✓ Nothing to decide</span></span>
     </button>
     <div v-if="isOpen(g)" class="overflow-x-auto border-t border-gray-800 bg-gray-950/30">
      <table v-if="g.shown.length" class="w-full text-left text-sm"><thead class="text-xs text-gray-500"><tr><th class="px-4 py-2 pl-10">Date</th><th class="px-4 py-2">In / out</th><th class="px-4 py-2">Late / undertime</th><th class="px-4 py-2">What happens</th><th class="px-4 py-2"></th></tr></thead><tbody>
       <tr v-for="d in g.shown" :key="d.work_date" class="border-t border-gray-800/70">
        <td class="px-4 py-2 pl-10 whitespace-nowrap">{{dayLabel(d.work_date)}}<p class="text-xs text-gray-500">{{d.schedule}}</p></td>
        <td class="px-4 py-2 whitespace-nowrap">{{stamp(d.first_scan_at)}} / {{stamp(d.last_scan_at)}}</td>
        <td class="px-4 py-2 whitespace-nowrap">{{Number(d.late_minutes)}} / {{Number(d.undertime_minutes)}} min</td>
        <td class="px-4 py-2">
         <template v-if="d.review_state==='pending'"><span class="text-amber-300">Needs a decision</span><p class="text-xs text-gray-400">{{d.issue_codes.map(c=>labels[c]||c).join(' · ')}}</p></template>
         <template v-else-if="d.review_state==='resolved'"><span class="text-emerald-300">Decided</span><p class="text-xs text-gray-400">{{d.correction_reason}}</p></template>
         <span v-else-if="missedMinutes(d)" class="text-gray-300">Deducted as recorded</span>
         <span v-else class="text-gray-500">Clear</span>
         <p v-if="approvedWorkLabel(d)" class="mt-1 text-xs font-semibold text-sky-300">{{approvedWorkLabel(d)}}</p>
        </td>
        <td class="px-4 py-2 text-right"><AppButton v-if="batch.review_state!=='confirmed' && !batch.needs_reimport" size="sm" :variant="d.review_state==='pending'?'primary':'secondary'" :disabled="busy" @click="review(d)">{{d.review_state==='pending'?'Verify':'Edit'}}</AppButton></td>
       </tr>
      </tbody></table>
      <p v-else class="px-4 py-3 pl-10 text-sm text-gray-500">Every day matches the schedule.{{isConfirmed?'':' Turn on “Show days without issues” to add overtime.'}}</p>
     </div>
    </div>
    <p v-if="!groups.length" class="p-4 text-sm text-gray-400">No employees match this search.</p>
   </div>
  </section>
  <template v-if="batch && !batch.needs_reimport && !showImport">
   <PayRunNextStep v-if="isConfirmed" tone="done" title="✓ Attendance confirmed" :detail="totalsText">
    <AppButton v-if="embedded && payCalculated" @click="emit('continue',{calculate:false})">Review pay →</AppButton><AppButton v-else-if="embedded" @click="emit('continue',{calculate:true})">Calculate pay</AppButton><AppButton v-else @click="router.push(payrollTarget)">Continue to payroll →</AppButton>
   </PayRunNextStep>
   <PayRunNextStep v-else-if="blocking.length" tone="waiting" title="Fix the problems listed above before confirming" detail="Map the missing Attendance IDs or correct the file, then reload employee setup.">
    <AppButton variant="secondary" :loading="busy" @click="refresh">Reload employee setup</AppButton>
   </PayRunNextStep>
   <PayRunNextStep v-else-if="batch.scopeNeedsRefresh" title="Employee setup or leave changed" detail="Reload so this review uses the latest salaries, schedules and leave. Your decisions are kept.">
    <AppButton :loading="busy" @click="refresh">Reload</AppButton>
   </PayRunNextStep>
   <PayRunNextStep v-else-if="pending" :title="`${pending} ${pending===1?'day needs':'days need'} a decision`" detail="Open each employee marked “to decide”. Late days with both scans are already deducted as recorded.">
    <AppButton disabled>Confirm attendance</AppButton>
   </PayRunNextStep>
   <PayRunNextStep v-else title="All days are decided" :detail="hasCoverageIssue?`${totalsText} · The file may not cover every date; confirming accepts it as complete.`:totalsText">
    <AppButton :loading="busy" :disabled="!batch.daily?.length" @click="confirm">Confirm attendance</AppButton>
   </PayRunNextStep>
  </template>
  <details v-if="!embedded || visibleBatches.length" class="rounded-xl border border-gray-800 bg-gray-950/20 p-5"><summary class="cursor-pointer text-sm font-semibold text-gray-300">{{embedded?'Other files for these work dates':'Previous attendance imports'}} <span class="ml-2 font-normal text-gray-500">{{visibleBatches.length}}</span></summary>
   <div class="mt-4 space-y-2"><button v-for="b in visibleBatches" :key="b.id" class="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm" :class="batch?.id===b.id?'border-primary-500':'border-gray-800 hover:border-gray-600'" @click="open(b.id)"><span><span class="block font-medium text-gray-200">{{formatWorkRange(b.period_start,b.period_end)}}</span><span class="mt-1 block text-xs text-gray-500">{{b.file_name||`Import ${b.id}`}}</span></span><span class="text-xs" :class="b.review_state==='confirmed'?'text-emerald-300':'text-amber-300'">{{b.needs_reimport?'Original CSV needed':b.review_state==='confirmed'?'Confirmed':`${b.pending_days} days to verify`}} →</span></button><p v-if="!visibleBatches.length" class="text-sm text-gray-500">No attendance imported yet.</p></div>
  </details>
  <AppModal :show="showHistory" title="Change history" size="lg" @close="showHistory=false">
   <ol v-if="batch" class="max-h-[60vh] divide-y divide-gray-800 overflow-auto">
    <li v-for="event in batch.events" :key="event.id" class="py-2.5 text-sm"><p class="text-gray-200">{{eventText(event)}}</p><p class="mt-0.5 text-xs text-gray-500">{{event.actor_name}} · {{new Date(event.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})}}</p></li>
   </ol>
   <template #footer><AppButton variant="secondary" @click="showHistory=false">Close</AppButton></template>
  </AppModal>
  <AppModal :show="showPreview" title="Check attendance import" size="xl" @close="showPreview=false">
   <div v-if="preview" class="space-y-5">
    <div><p v-if="preview.isTest" class="mb-2 text-xs font-bold uppercase tracking-wide text-sky-300">Practice import · TEST ONLY</p><h2 class="text-lg font-semibold">{{preview.summary.employees}} employees included</h2><p class="mt-1 text-sm text-gray-400">{{formatWorkRange(preview.period_start,preview.period_end)}} · {{preview.summary.employeeDays}} workdays checked across these employees</p></div>
    <div v-if="previewSetupCount" class="rounded-lg border border-amber-700/40 bg-amber-950/20 p-4"><p class="text-sm font-semibold text-amber-200">Employee setup blocks {{previewSetupCount}} daily checks</p><p class="mt-1 text-xs leading-5 text-gray-400">Complete their salary, schedule and Attendance ID, or cancel and enable Practice payroll to select only configured employees.</p></div>
    <div class="grid gap-3 sm:grid-cols-3"><div class="rounded-lg border border-amber-700/40 bg-amber-950/10 p-4"><p class="text-2xl font-semibold text-amber-200">{{preview.summary.lateUndertime}}</p><p class="mt-1 text-sm">Late / early departure</p><p class="mt-1 text-xs text-gray-400">Deducted as recorded. Excuse company tasks after saving.</p></div><div class="rounded-lg border border-red-700/40 bg-red-950/10 p-4"><p class="text-2xl font-semibold text-red-200">{{preview.summary.missingRecords}}</p><p class="mt-1 text-sm">No scans found</p><p class="mt-1 text-xs text-gray-400">Check work, absence or paper leave.</p></div><div class="rounded-lg border border-sky-700/40 bg-sky-950/10 p-4"><p class="text-2xl font-semibold text-sky-200">{{preview.summary.missingPunches}}</p><p class="mt-1 text-sm">Missing in or out</p><p class="mt-1 text-xs text-gray-400">Verify the missing time.</p></div></div>
    <p class="text-xs leading-5 text-gray-400">Counts are workdays, not people: one employee can have several flagged dates. A day can appear in more than one category. Missing scans do not automatically count as absence.</p>
    <p v-for="i in preview.issues" :key="i.message" class="text-sm text-amber-200">{{i.message}}</p>
    <div v-if="previewGroups.length"><div class="mb-2 flex items-center justify-between text-sm"><h3 class="font-semibold">{{previewGroups.length}} employees need review</h3><span class="text-gray-400">{{preview.summary.flaggedDays}} dates to verify</span></div><div class="rounded-lg border border-gray-800 divide-y divide-gray-800"><div v-for="g in previewGroups" :key="g.id" class="flex items-start justify-between gap-4 p-3 text-sm"><div><p class="font-medium">{{g.name}}</p><p class="mt-1 text-xs text-gray-400">{{g.findings.join(' · ')}}</p></div><span class="shrink-0 text-xs text-amber-200">{{g.days}} {{g.days===1?'date':'dates'}}</span></div></div></div>
    <p v-else class="rounded-lg bg-emerald-950/20 p-4 text-sm text-emerald-200">All scheduled dates are clear. You can confirm this attendance.</p>
    <p class="text-xs text-gray-400">{{preview.summary.flaggedDays?'Save and review opens every date that needs a decision. Payroll stays blocked until they are decided.':preview.summary.lateUndertime?'Nothing needs a decision. Save and review to excuse any late days before confirming.':'No payroll deductions are created by this preview.'}}</p>
   </div>
   <template #footer><AppButton variant="secondary" :disabled="busy" @click="showPreview=false">Back to import</AppButton><AppButton v-if="preview?.summary.flaggedDays||preview?.issues.length||preview?.summary.lateUndertime" :loading="busy" @click="save(false)">Save &amp; review dates →</AppButton><AppButton v-else :loading="busy" :disabled="!preview?.daily.length" @click="save(true)">Confirm attendance →</AppButton></template>
  </AppModal>
  <AppModal :show="Boolean(reviewing)" title="Verify employee attendance" size="lg" @close="reviewing=null">
   <div v-if="reviewing" class="space-y-4"><p class="font-medium">{{reviewing.employee_name}} · {{reviewing.work_date}}</p><p class="text-sm text-gray-400">{{reviewing.issue_codes.map(c=>labels[c]||c).join(' · ')}}</p>
    <div v-if="needsSetup" class="text-sm"><p>Complete employee dates, salary, schedule, and ID mapping first. Refresh this review afterward.</p><RouterLink :to="{path:'/compensation',query:{employee:reviewing.employee_id,shift}}" class="text-primary-300 underline">Open employee pay setup</RouterLink><RouterLink to="/employees" class="ml-4 text-primary-300 underline">Employee records</RouterLink></div>
    <template v-else><p class="rounded-lg bg-gray-950/60 px-3 py-2 text-sm text-gray-300">{{recordedSummary}}</p><fieldset><legend class="text-sm font-semibold text-gray-100">What happened on this day?</legend><div class="mt-2 space-y-2"><label v-for="option in decisionOptions" :key="option.value" class="flex cursor-pointer gap-3 rounded-lg border p-3" :class="decision.action===option.value?'border-primary-500 bg-primary-950/20':'border-gray-800 hover:border-gray-600'"><input v-model="decision.action" type="radio" name="attendance-decision" :value="option.value" class="mt-1"><span><span class="block text-sm font-medium text-gray-100">{{option.title}}</span><span class="mt-0.5 block text-xs leading-5 text-gray-400">{{option.hint}}</span></span></label></div></fieldset>
     <div v-if="decision.action==='actual_times'" class="grid grid-cols-2 gap-3"><label class="text-sm">Actual time-in<input v-model="decision.timeIn" type="time" class="form-control mt-1"></label><label class="text-sm">Actual time-out{{reviewing.overnight?' (next day for morning hours)':''}}<input v-model="decision.timeOut" type="time" class="form-control mt-1"></label></div>
     <label v-if="decision.action==='link_leave'" class="block text-sm">Official approved leave<select v-model="decision.leaveId" class="form-control mt-1"><option :value="null">Choose a record</option><option v-for="l in reviewing.leaves?.filter(l=>l.status==='approved')" :key="l.id" :value="l.id">{{l.leave_type_name}} · {{l.start_date}} – {{l.end_date}} · {{l.leave_pay_type}}</option></select></label>
     <label v-if="['link_leave','actual_times'].includes(decision.action) && reviewing.leaves?.find(l=>Number(l.id)===Number(decision.leaveId))?.leave_pay_type==='partial_paid'" class="block text-sm">Paid portion for this date (days)<select v-model.number="decision.paidFraction" class="form-control mt-1"><option :value="undefined">Choose paid portion</option><option :value="0">0 — unpaid</option><option :value="0.5">0.5 — half paid</option><option :value="1">1 — fully paid</option></select><span class="text-xs text-gray-400">All allocations must match the official leave's paid and unpaid totals. Credits are deducted by the leave record only.</span></label>
     <fieldset v-if="allowsApprovedWork" class="rounded-lg border border-gray-800 p-3"><legend class="px-1 text-sm font-semibold text-gray-200">{{decision.dayType==='rest_day'?'Overtime on the rest day (optional)':'Overtime or holiday work (optional)'}}</legend><div class="grid gap-3 sm:grid-cols-2"><label v-if="decision.dayType!=='rest_day'" class="text-sm">Day type<select v-model="decision.dayType" class="form-control mt-1"><option value="regular">Regular workday</option><option value="special_holiday">Special holiday / rest day (WSH/RD)</option></select></label><label class="text-sm">Approved overtime hours<input v-model.number="decision.overtimeHours" type="number" min="0" max="16" step="0.25" class="form-control mt-1"></label></div><p class="mt-2 text-xs leading-5 text-gray-400">{{decision.dayType==='rest_day'?'Rest-day overtime is paid at 169%.':decision.dayType==='special_holiday'?'Adds 30% of the day’s pay, and overtime is paid at 169%.':'Overtime is paid at 125%.'}}</p></fieldset>
          <p v-if="decision.action==='link_leave'" class="text-xs text-gray-400">Leave follows the official policy and available credits. Allowing someone to leave early does not by itself make the time paid.</p>
     <AppButton v-if="!batch?.isTest" variant="secondary" @click="recordLeave(reviewing)">Record a leave filed directly with HR</AppButton><RouterLink v-if="reviewing.issue_codes.includes('pending_leave')" to="/leave-approvals" class="ml-3 text-sm text-primary-300 underline">Resolve pending leave</RouterLink>
     <div v-if="!batch?.isTest && reviewing.leaves?.some(l=>l.status==='approved')" class="space-y-2 text-sm"><p class="text-gray-400">If the official record is incorrect, cancel it and record the correct leave. Finalized payroll cannot be changed.</p><button v-for="l in reviewing.leaves.filter(l=>l.status==='approved')" :key="l.id" class="block text-amber-300 underline" @click="correctLeave(l)">Correct official {{l.leave_type_name}} · {{l.start_date}} – {{l.end_date}}</button></div>
    </template>
   </div>
   <template #footer><AppButton variant="secondary" @click="reviewing=null">Cancel</AppButton><AppButton :loading="busy" :disabled="needsSetup||!decision.action" @click="resolve">Save</AppButton></template>
  </AppModal>
  <AppModal :show="Boolean(correctingLeave)" title="Correct an incorrect official leave" @close="correctingLeave=null"><div v-if="correctingLeave" class="space-y-4"><p>{{correctingLeave.leave.leave_type_name}} · {{correctingLeave.leave.start_date}} – {{correctingLeave.leave.end_date}}</p><p class="text-sm text-gray-400">This cancels the incorrect leave while retaining its history, refunds credits for the current credit year where applicable, and refreshes attendance. Record the correct leave afterward. The action is blocked if the leave affects finalized payroll.</p></div><template #footer><AppButton variant="secondary" @click="correctingLeave=null">Keep leave</AppButton><AppButton :loading="busy" @click="saveLeaveCorrection">Cancel incorrect leave</AppButton></template></AppModal>
  <HrCalendarEntryModal :show="Boolean(leaveEntry)" :entry="leaveEntry" :employees="batch?.employees||[]" :leave-types="leaveTypes" :saving="busy" @close="leaveEntry=null" @save="saveLeave" />
 </div>
</template>
