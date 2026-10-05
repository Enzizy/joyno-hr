<script setup>
import {computed,nextTick,onMounted,ref,watch} from 'vue'
import {standardPeriod,formatWorkRange,coversWorkDates,attendanceSelection} from '@/utils/payrollPeriods'
import {useRoute,useRouter} from 'vue-router'
import {useToastStore} from '@/stores/toastStore'
import {attendanceUpload,listAttendanceReviews,getAttendanceReview,attendanceReviewAction,createHrCalendarEntry,getLeaveTypes,getConfirmedAttendanceExport} from '@/services/api'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import HrCalendarEntryModal from '@/components/leave/HrCalendarEntryModal.vue'

const route=useRoute(),router=useRouter(),toast=useToastStore()
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
const initialPeriod=attendanceSelection(route.query,today.slice(0,7))
const attendanceMonth=ref(initialPeriod.month),cycle=ref(initialPeriod.cycle)
const payrollOrigin=ref(standardPeriod(String(route.query.payrollMonth||''),String(route.query.cutoff||''))?{payrollMonth:String(route.query.payrollMonth),cutoff:String(route.query.cutoff)}:null)
const start=ref(initialPeriod.start),end=ref(initialPeriod.end),file=ref(null),busy=ref(false),error=ref(''),showImport=ref(!route.query.batch)
const fileInputKey=ref(0)
let syncingRange=false
const preview=ref(null),showPreview=ref(false),batch=ref(null),batches=ref([]),search=ref(''),pendingOnly=ref(true)
const reviewing=ref(null),decision=ref({action:'acknowledge',reason:'',timeIn:'',timeOut:'',leaveId:null}),coverageReason=ref('')
const leaveEntry=ref(null),leaveTypes=ref([])
const correctingLeave=ref(null)
const payrollTarget=computed(()=>({path:'/payroll',query:{...(payrollOrigin.value||{payrollMonth:attendanceMonth.value,cutoff:cycle.value==='custom'?(end.value.endsWith('-10')?'first':'second'):cycle.value}),...(batch.value?.review_state==='confirmed'?{attendanceBatch:batch.value.id}:{})}}))
function rangeQuery(){const query={...route.query,...(payrollOrigin.value||{payrollMonth:attendanceMonth.value,cutoff:cycle.value})};if(cycle.value==='custom'){query.firstWorkDate=start.value;query.lastWorkDate=end.value}else{delete query.firstWorkDate;delete query.lastWorkDate}return query}
async function newImport(){batch.value=null;showImport.value=true;file.value=null;fileInputKey.value++;const query=rangeQuery();delete query.batch;await router.replace({query})}
watch([attendanceMonth,cycle],()=>{
 if(syncingRange)return
 payrollOrigin.value=null
 const period=standardPeriod(attendanceMonth.value,cycle.value)
 if(period){start.value=period.start;end.value=period.end}
 batch.value=null;showImport.value=true
 const query=rangeQuery();delete query.batch;router.replace({query})
})
function correctLeave(leave){reviewing.value=null;correctingLeave.value={leave,reason:''}}
async function saveLeaveCorrection(){await run(async()=>{batch.value=await attendanceReviewAction(batch.value.id,'correct-leave',{version:batch.value.review_version,leaveId:correctingLeave.value.leave.id,reason:correctingLeave.value.reason});correctingLeave.value=null;await reload();toast.success('Incorrect leave cancelled with history retained; attendance refreshed')})}
const labels={late_undertime:'Late / undertime',no_record:'No record — verify with HR',missing_punch:'Incomplete punches',pending_leave:'Pending leave',leave_conflict:'Conflicting leave',leave_reconciliation:'Reconcile official leave',missing_profile:'Salary / schedule not configured',missing_attendance_id:'Attendance ID not mapped',missing_hire_date:'Hire date missing',unsupported_schedule:'Schedule needs setup'}
const rows=computed(()=>[...(batch.value?.daily||[])].filter(d=>(!pendingOnly.value||d.review_state==='pending')&&`${d.employee_name} ${d.employee_code} ${d.person_id} ${d.work_date}`.toLowerCase().includes(search.value.toLowerCase())))
const pending=computed(()=>(batch.value?.daily||[]).filter(d=>d.review_state==='pending').length)
const blocking=computed(()=>(batch.value?.issues||[]).filter(i=>i.code!=='file_coverage'))
const hasCoverageIssue=computed(()=>(batch.value?.issues||[]).some(i=>i.code==='file_coverage'))
const needsSetup=computed(()=>reviewing.value?.issue_codes?.some(c=>['missing_profile','missing_attendance_id','missing_hire_date','unsupported_schedule'].includes(c)))
const stamp=value=>value?new Date(value).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:false}):'—'
watch([start,end,file],()=>{preview.value=null;showPreview.value=false})
watch([start,end],()=>{if(!syncingRange&&cycle.value==='custom')router.replace({query:rangeQuery()})})
async function run(fn){busy.value=true;error.value='';try{return await fn()}catch(e){error.value=e.message;toast.error(e.message)}finally{busy.value=false}}
async function reload(){batches.value=await listAttendanceReviews()}
async function open(id){await run(async()=>{
 const loaded=await getAttendanceReview(id);if(!loaded)throw Error('Attendance review not found')
 file.value=null;fileInputKey.value++
 const originatingPeriod=payrollOrigin.value&&standardPeriod(payrollOrigin.value.payrollMonth,payrollOrigin.value.cutoff)
 if(originatingPeriod&&!coversWorkDates(loaded,originatingPeriod.start,originatingPeriod.end))payrollOrigin.value=null
 syncingRange=true
 attendanceMonth.value=loaded.period_end.slice(0,7)
 const type=loaded.period_end.endsWith('-10')?'first':'second',period=standardPeriod(attendanceMonth.value,type)
 cycle.value=period?.start===loaded.period_start&&period?.end===loaded.period_end?type:'custom'
 start.value=loaded.period_start;end.value=loaded.period_end
 await nextTick();syncingRange=false
 batch.value=loaded;showImport.value=Boolean(loaded.needs_reimport);coverageReason.value=''
 await router.replace({query:{...rangeQuery(),batch:id}})
})}
async function analyse(){await run(async()=>{preview.value=await attendanceUpload('preview',file.value,start.value,end.value);showPreview.value=true})}
async function save(alsoConfirm=false){await run(async()=>{
 batch.value=await attendanceUpload('drafts',file.value,start.value,end.value,preview.value.preview_token)
 showPreview.value=false;preview.value=null;showImport.value=false;router.replace({query:{...rangeQuery(),batch:batch.value.id}})
 if(alsoConfirm)batch.value=await attendanceReviewAction(batch.value.id,'confirm',{version:batch.value.review_version})
 await reload();toast.success(alsoConfirm?'Attendance confirmed':'Saved for HR review')
})}
async function refresh(){await run(async()=>{batch.value=await attendanceReviewAction(batch.value.id,'refresh',{version:batch.value.review_version});await reload();toast.success('Review refreshed from employee setup and official leave')})}
function review(day){reviewing.value=day;decision.value={action:day.status==='exception'?'actual_times':day.issue_codes?.includes('leave_reconciliation')?'link_leave':'acknowledge',reason:'',timeIn:day.first_scan_at?stamp(day.first_scan_at):'',timeOut:day.last_scan_at?stamp(day.last_scan_at):'',leaveId:day.leave_request_id}}
async function resolve(){await run(async()=>{
 batch.value=await attendanceReviewAction(batch.value.id,'review',{version:batch.value.review_version,employeeId:reviewing.value.employee_id,date:reviewing.value.work_date,decision:decision.value})
 reviewing.value=null;await reload();toast.success('HR verification saved')
})}
async function confirm(){await run(async()=>{batch.value=await attendanceReviewAction(batch.value.id,'confirm',{version:batch.value.review_version,coverageReason:coverageReason.value});await reload();toast.success('Attendance confirmed for payroll')})}
async function exportDtr(){await run(async()=>{const url=URL.createObjectURL(await getConfirmedAttendanceExport(batch.value.id));const a=document.createElement('a');a.href=url;a.download=`attendance-${batch.value.id}-confirmed.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})}
function recordLeave(day){reviewing.value=null;leaveEntry.value={entry_type:'leave',employee_id:day.employee_id,start_date:day.work_date,end_date:day.work_date,coverage_start:day.overnight?'02:00':'14:00',coverage_end:day.overnight?'06:00':'18:00'}}
async function saveLeave(entry){await run(async()=>{await createHrCalendarEntry(entry);leaveEntry.value=null;batch.value=await attendanceReviewAction(batch.value.id,'refresh',{version:batch.value.review_version});await reload();toast.success('Official leave recorded; attendance refreshed')})}
onMounted(()=>run(async()=>{await reload();leaveTypes.value=await getLeaveTypes();if(route.query.batch)await open(route.query.batch)}))
watch(()=>route.query.batch,id=>{if(id&&String(batch.value?.id)!==String(id)&&!busy.value)open(id)})
</script>

<template>
 <div class="space-y-6">
  <PageHeader title="Attendance" description="Check the biometric export, resolve missing scans and leave, then confirm it for payroll." eyebrow="HR workspace"><template #actions><AppButton v-if="batch" variant="secondary" size="sm" @click="newImport">New import</AppButton><RouterLink v-if="route.query.payrollMonth" :to="payrollTarget" class="text-sm font-semibold text-primary-300 hover:underline">Back to payroll →</RouterLink></template></PageHeader>
  <p v-if="error" role="alert" class="rounded-xl border border-red-800 bg-red-950/20 p-4 text-red-200">{{error}}</p>
  <section v-if="showImport" class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
   <div class="border-b border-gray-800 px-5 py-4"><h2 class="font-semibold text-gray-100">{{batch?.needs_reimport?'Re-upload the original attendance file':'Import biometric attendance'}}</h2><p class="mt-1 text-sm text-gray-400">{{batch?.needs_reimport?'The older import needs a fresh HR review. Its work dates are already selected below.':'Choose the payroll cutoff that this export belongs to.'}}</p></div>
   <div class="grid gap-6 p-5 lg:grid-cols-2">
    <div class="space-y-4">
     <div class="grid gap-4 sm:grid-cols-2"><label class="text-sm text-gray-300">Payroll month<input v-model="attendanceMonth" type="month" class="form-control mt-2"></label><label class="text-sm text-gray-300">Payroll cutoff<select v-model="cycle" class="form-control mt-2"><option value="first">15th payday</option><option value="second">Month-end payday</option><option value="custom">Other work dates</option></select></label></div>
     <div class="rounded-lg border border-primary-800/40 bg-primary-950/20 p-4"><p class="text-xs font-semibold uppercase tracking-wide text-primary-300">Work dates to check</p><p class="mt-2 font-semibold text-gray-100">{{formatWorkRange(start,end)}}</p><p class="mt-2 text-xs leading-5 text-gray-400">The first and last work dates included in this attendance review. Missing scans and leave are checked within this range, including employees absent from the file.</p></div>
     <div v-if="cycle==='custom'" class="grid gap-3 sm:grid-cols-2"><label class="text-sm text-gray-300">First work date<input v-model="start" type="date" class="form-control mt-2"></label><label class="text-sm text-gray-300">Last work date<input v-model="end" type="date" :min="start" class="form-control mt-2"></label></div>
     <p v-else class="text-xs text-gray-500">For the {{cycle==='first'?'15th payday, work dates run from the previous month’s 26th through this month’s 10th.':'month-end payday, work dates run from the 11th through the 25th.'}}</p>
    </div>
    <div class="flex flex-col justify-between gap-4 rounded-lg border border-dashed border-gray-700 bg-gray-950/30 p-5">
     <div><h3 class="text-sm font-semibold text-gray-100">Biometric export</h3><p class="mt-2 text-sm leading-6 text-gray-400">Export all employees for the work dates shown. For night shifts, include the following morning’s clock-outs after the last work date.</p><label class="mt-4 block text-sm text-gray-300">Biometric CSV<input :key="fileInputKey" type="file" accept=".csv" class="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-3 file:py-2 file:text-gray-200" @change="file=$event.target.files?.[0]||null"></label><p v-if="file" class="mt-3 break-all text-xs text-gray-400">Selected: {{file.name}}</p></div>
     <div><AppButton class="w-full" :disabled="!file||!start||!end||end<start" :loading="busy" @click="analyse">Preview &amp; check attendance →</AppButton><p class="mt-2 text-xs leading-5 text-gray-500">Preview first. No attendance is saved until HR confirms the next step.</p></div>
    </div>
   </div>
   <details class="border-t border-gray-800 px-5 py-3 text-xs text-gray-500"><summary class="cursor-pointer">How biometric scans are interpreted</summary><p class="mt-2 leading-5">Main Door Out is time-in; Main Door IN is time-out. New Bio can supply the first or last scan. Intermediate scans are ignored. Attendance IDs are mapped separately from Employee IDs. Night shifts use the date they start; morning clock-outs belong to the previous night.</p></details>
  </section>
  <section v-if="batch && !batch.needs_reimport" class="rounded-xl border border-gray-800 p-5">
   <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-semibold text-gray-100">{{batch.review_state==='confirmed'?'Attendance confirmed':'Review attendance'}}</h2><p class="mt-1 text-sm text-gray-400">{{formatWorkRange(batch.period_start,batch.period_end)}} · {{pending}} employee-days need verification</p></div><AppButton v-if="batch.review_state!=='confirmed' && !batch.needs_reimport" variant="secondary" :loading="busy" @click="refresh">Refresh setup and leave</AppButton></div>
   <p v-if="batch.needs_reimport" class="mt-4 rounded-lg border border-amber-800/50 p-3 text-sm text-amber-200">This legacy import predates the review workflow. Upload its original CSV above to create a complete preview. It cannot be used for payroll until a new review is confirmed.</p>
   <p v-if="batch.review_state==='confirmed'" class="mt-4 rounded-lg bg-emerald-950/30 p-3 text-sm text-emerald-200">Confirmed attendance is retained as reviewed. Use a new preview for later changes. <RouterLink :to="payrollTarget" class="underline">Continue to payroll →</RouterLink><button class="ml-4 underline" :disabled="busy" @click="exportDtr">Export confirmed DTR</button></p>
   <div v-if="batch.issues?.length" class="mt-4 rounded-lg border border-amber-800/50 p-3 text-sm text-amber-200"><p v-for="i in batch.issues" :key="i.message">{{i.message}}</p></div>
   <div class="my-4 flex flex-wrap items-center gap-4"><input v-model="search" aria-label="Search attendance" placeholder="Employee, either ID, or date" class="form-control max-w-sm"><label class="text-sm"><input v-model="pendingOnly" type="checkbox"> Needs verification only</label></div>
   <div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead class="text-xs text-gray-400"><tr><th class="p-3">Employee / IDs</th><th class="p-3">Date / schedule</th><th class="p-3">Time-in / out</th><th class="p-3">Late / undertime</th><th class="p-3">Finding / decision</th><th class="p-3">Action</th></tr></thead><tbody>
    <tr v-for="d in rows" :key="`${d.employee_id}:${d.work_date}`" class="border-t border-gray-800"><td class="p-3"><p class="font-medium">{{d.employee_name}}</p><p class="text-xs text-gray-400">Employee ID: {{d.employee_code}}</p><p class="text-xs text-gray-400">Attendance ID: {{d.person_id||'Not mapped'}}</p></td><td class="p-3">{{d.work_date}}<p class="text-xs text-gray-400">{{d.schedule}}</p></td><td class="p-3 whitespace-nowrap">{{stamp(d.first_scan_at)}} / {{stamp(d.last_scan_at)}}</td><td class="p-3">{{Number(d.late_minutes)}} / {{Number(d.undertime_minutes)}} min</td><td class="p-3"><span :class="d.review_state==='pending'?'text-amber-300':'text-emerald-300'">{{d.review_state==='pending'?'Needs verification':d.review_state==='resolved'?'HR verified':'Clear'}} · {{d.status}}</span><p v-for="c in d.issue_codes" :key="c" class="text-xs text-gray-400">{{labels[c]||c}}</p><p v-if="d.correction_reason" class="mt-1 text-xs">{{d.correction_reason}}</p></td><td class="p-3"><AppButton v-if="batch.review_state!=='confirmed' && !batch.needs_reimport" size="sm" variant="secondary" :disabled="busy" @click="review(d)">Verify</AppButton></td></tr>
   </tbody></table><p v-if="!rows.length" class="p-4 text-sm text-gray-400">No employee-days match this filter.</p></div>
   <details v-if="batch.events?.length" class="mt-4 rounded-lg border border-gray-800 p-3"><summary class="cursor-pointer text-sm font-semibold">Review history (latest 200 events)</summary><div class="max-h-72 overflow-auto"><div v-for="event in batch.events" :key="event.id" class="mt-3 text-xs"><p>{{event.action}} · User {{event.actor_user_id}} · {{new Date(event.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}}</p><p>{{event.work_date?.slice(0,10)}} {{event.reason}}</p></div></div></details>
   <template v-if="batch.review_state!=='confirmed' && !batch.needs_reimport"><label v-if="hasCoverageIssue" class="mt-4 block text-sm">File coverage verification<input v-model="coverageReason" maxlength="500" class="form-control mt-1" placeholder="Record how you verified the export covers the entire period"></label><div class="mt-5 flex flex-wrap items-center gap-3"><AppButton :loading="busy" :disabled="pending>0||blocking.length>0||!batch.daily?.length||(hasCoverageIssue&&coverageReason.trim().length<3)" @click="confirm">Confirm attendance for payroll</AppButton><span class="text-xs text-gray-500">Every flagged day needs an HR decision. Payroll cannot use an unfinished review.</span></div></template>
  </section>
  <details class="rounded-xl border border-gray-800 bg-gray-950/20 p-5"><summary class="cursor-pointer text-sm font-semibold text-gray-300">Previous attendance imports <span class="ml-2 font-normal text-gray-500">{{batches.length}}</span></summary>
   <div class="mt-4 space-y-2"><button v-for="b in batches" :key="b.id" class="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm" :class="batch?.id===b.id?'border-primary-500':'border-gray-800 hover:border-gray-600'" @click="open(b.id)"><span><span class="block font-medium text-gray-200">{{formatWorkRange(b.period_start,b.period_end)}}</span><span class="mt-1 block text-xs text-gray-500">{{b.file_name||`Import ${b.id}`}}</span></span><span class="text-xs" :class="b.review_state==='confirmed'?'text-emerald-300':'text-amber-300'">{{b.needs_reimport?'Original CSV needed':b.review_state==='confirmed'?'Confirmed':`${b.pending_days} days to verify`}} →</span></button><p v-if="!batches.length" class="text-sm text-gray-500">No attendance imported yet.</p></div>
  </details>
  <AppModal :show="showPreview" title="Review attendance before confirming" size="xl" @close="showPreview=false">
   <div v-if="preview" class="space-y-4"><p class="text-sm">{{preview.period_start}} – {{preview.period_end}} · {{preview.summary.employees}} employees · {{preview.summary.employeeDays}} scheduled employee-days</p><div class="grid grid-cols-3 gap-3"><div class="rounded-lg border border-gray-700 p-3"><p class="text-2xl font-semibold">{{preview.summary.lateUndertime}}</p><p class="text-xs">Late / undertime days</p></div><div class="rounded-lg border border-gray-700 p-3"><p class="text-2xl font-semibold">{{preview.summary.missingRecords}}</p><p class="text-xs">No record — verify</p></div><div class="rounded-lg border border-gray-700 p-3"><p class="text-2xl font-semibold">{{preview.summary.missingPunches}}</p><p class="text-xs">Incomplete punch days</p></div></div><p class="text-sm text-amber-200">{{preview.summary.flaggedDays}} employee-days need verification. Categories can overlap. Missing records are not confirmed absences.</p><p v-for="i in preview.issues" :key="i.message" class="text-sm text-amber-200">{{i.message}}</p><div class="max-h-64 overflow-auto"><div v-for="d in preview.daily.filter(d=>d.review_state==='pending').slice(0,20)" :key="`${d.employee_id}:${d.work_date}`" class="border-t border-gray-800 py-2 text-sm"><span class="font-medium">{{d.employee_name}} · {{d.work_date}}</span><p class="text-xs text-gray-400">{{d.issue_codes.map(c=>labels[c]||c).join(' · ')}}</p></div></div><p class="text-xs text-gray-400">Save the review to investigate all employee-days. Cancelling this preview does not import attendance or create deductions.</p></div>
   <template #footer><AppButton variant="secondary" @click="showPreview=false">Cancel</AppButton><AppButton variant="secondary" :loading="busy" @click="save(false)">Save for HR review</AppButton><AppButton :loading="busy" :disabled="!preview||preview.summary.flaggedDays>0||preview.issues.length>0||!preview.daily.length" @click="save(true)">Confirm attendance</AppButton></template>
  </AppModal>
  <AppModal :show="Boolean(reviewing)" title="Verify employee attendance" size="lg" @close="reviewing=null">
   <div v-if="reviewing" class="space-y-4"><p class="font-medium">{{reviewing.employee_name}} · {{reviewing.work_date}}</p><p class="text-sm text-gray-400">{{reviewing.issue_codes.map(c=>labels[c]||c).join(' · ')}}</p>
    <div v-if="needsSetup" class="text-sm"><p>Complete employee dates, salary, schedule, and ID mapping first. Refresh this review afterward.</p><RouterLink :to="{path:'/compensation',query:{employee:reviewing.employee_id}}" class="text-primary-300 underline">Open employee pay setup</RouterLink><RouterLink to="/employees" class="ml-4 text-primary-300 underline">Employee records</RouterLink></div>
    <template v-else><label class="block text-sm">HR decision<select v-model="decision.action" class="form-control mt-1"><option value="acknowledge">Confirm measured lateness / undertime</option><option value="actual_times">Correct verified actual punches</option><option value="absent">Confirm unpaid absence</option><option value="verified_work">Verify work without biometric evidence</option><option value="link_leave">Reconcile official approved leave</option></select></label>
     <div v-if="decision.action==='actual_times'" class="grid grid-cols-2 gap-3"><label class="text-sm">Actual time-in<input v-model="decision.timeIn" type="time" class="form-control mt-1"></label><label class="text-sm">Actual time-out{{reviewing.overnight?' (next day for morning hours)':''}}<input v-model="decision.timeOut" type="time" class="form-control mt-1"></label></div>
     <label v-if="decision.action==='link_leave'" class="block text-sm">Official approved leave<select v-model="decision.leaveId" class="form-control mt-1"><option :value="null">Choose a record</option><option v-for="l in reviewing.leaves?.filter(l=>l.status==='approved')" :key="l.id" :value="l.id">{{l.leave_type_name}} · {{l.start_date}} – {{l.end_date}} · {{l.leave_pay_type}}</option></select></label>
     <label v-if="['link_leave','actual_times'].includes(decision.action) && reviewing.leaves?.find(l=>Number(l.id)===Number(decision.leaveId))?.leave_pay_type==='partial_paid'" class="block text-sm">Paid portion for this date (days)<select v-model.number="decision.paidFraction" class="form-control mt-1"><option :value="undefined">Choose paid portion</option><option :value="0">0 — unpaid</option><option :value="0.5">0.5 — half paid</option><option :value="1">1 — fully paid</option></select><span class="text-xs text-gray-400">All allocations must match the official leave's paid and unpaid totals. Credits are deducted by the leave record only.</span></label>
     <label class="block text-sm">Verification reason / evidence<textarea v-model="decision.reason" rows="3" maxlength="500" class="form-control mt-1" placeholder="Record who verified the situation and the supporting reference" /></label>
     <p class="text-xs text-gray-400">Authorizing early departure alone does not make it paid. Leave must follow the official policy and available credits.</p>
     <AppButton variant="secondary" @click="recordLeave(reviewing)">Record leave received by HR</AppButton><RouterLink v-if="reviewing.issue_codes.includes('pending_leave')" to="/leave-approvals" class="ml-3 text-sm text-primary-300 underline">Resolve pending leave</RouterLink>
     <div v-if="reviewing.leaves?.some(l=>l.status==='approved')" class="space-y-2 text-sm"><p class="text-gray-400">If the official record is incorrect, cancel it with a reason and record the correct leave. Finalized payroll cannot be changed.</p><button v-for="l in reviewing.leaves.filter(l=>l.status==='approved')" :key="l.id" class="block text-amber-300 underline" @click="correctLeave(l)">Correct official {{l.leave_type_name}} · {{l.start_date}} – {{l.end_date}}</button></div>
    </template>
   </div>
   <template #footer><AppButton variant="secondary" @click="reviewing=null">Cancel</AppButton><AppButton :loading="busy" :disabled="needsSetup||decision.reason.trim().length<3" @click="resolve">Save HR verification</AppButton></template>
  </AppModal>
  <AppModal :show="Boolean(correctingLeave)" title="Correct an incorrect official leave" @close="correctingLeave=null"><div v-if="correctingLeave" class="space-y-4"><p>{{correctingLeave.leave.leave_type_name}} · {{correctingLeave.leave.start_date}} – {{correctingLeave.leave.end_date}}</p><p class="text-sm text-gray-400">This cancels the incorrect leave while retaining its history, refunds credits for the current credit year where applicable, and refreshes attendance. Record the correct leave afterward. The action is blocked if the leave affects finalized payroll.</p><label class="block text-sm">Correction reason<textarea v-model="correctingLeave.reason" rows="3" maxlength="500" class="form-control mt-1" /></label></div><template #footer><AppButton variant="secondary" @click="correctingLeave=null">Keep leave</AppButton><AppButton :loading="busy" :disabled="correctingLeave?.reason.trim().length<3" @click="saveLeaveCorrection">Cancel incorrect leave</AppButton></template></AppModal>
  <HrCalendarEntryModal :show="Boolean(leaveEntry)" :entry="leaveEntry" :employees="batch?.employees||[]" :leave-types="leaveTypes" :saving="busy" @close="leaveEntry=null" @save="saveLeave" />
 </div>
</template>
