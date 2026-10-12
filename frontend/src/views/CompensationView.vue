<script setup>
import {computed,onMounted,ref,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import PayrollShiftTabs from '@/components/payroll/PayrollShiftTabs.vue'
import {payrollShift} from '@/utils/payrollScope'
import {profileGaps,profileReady} from '@/utils/payRun'
import {getPayrollProfiles,getPayrollProfileHistory,updatePayrollProfile} from '@/services/api'
import {useToastStore} from '@/stores/toastStore'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import EmployeeWorkspaceNav from '@/components/employees/EmployeeWorkspaceNav.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
const route=useRoute(),toast=useToastStore(),profiles=ref([]),selected=ref(null),history=ref([]),search=ref(''),busy=ref(false),error=ref('')
const router=useRouter(),shift=ref(payrollShift(route.query.shift))
watch(()=>route.query.shift,value=>{if(value!==undefined)shift.value=payrollShift(value)})
watch(shift,async()=>{selected.value=null;history.value=[];profiles.value=[];await router.replace({query:{...route.query,shift:shift.value}});await load()})
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
const contributionOptions=[{key:'sss',label:'SSS'},{key:'philhealth',label:'PhilHealth'},{key:'pagibig',label:'Pag-IBIG'}]
const contributionSettings=p=>({sss:p?.contribution_settings?.sss??true,philhealth:p?.contribution_settings?.philhealth??true,pagibig:p?.contribution_settings?.pagibig??true})
const contributionSummary=p=>contributionOptions.filter(option=>contributionSettings(p)[option.key]).map(option=>option.label).join(', ')||'All IDs pending'
const form=ref({monthlyBasicSalary:'',monthlyCola:0,biometricPersonId:'',effectiveFrom:today,workStartTime:'09:00',workEndTime:'18:00',workdays:[1,2,3,4,5],contributionSettings:contributionSettings()})
const overnight=computed(()=>form.value.workEndTime<form.value.workStartTime)
const clock=t=>{const [h,m]=String(t||'').split(':').map(Number);return h*60+m}
const timeLabel=m=>{m%=1440;const h=Math.floor(m/60),mm=m%60;return `${h%12||12}${mm?':'+String(mm).padStart(2,'0'):''} ${h<12?'AM':'PM'}`}
// Same rule as the server: 4 to 8 paid hours; an 8-hour day keeps the one-hour unpaid lunch (1–2 PM, or 1–2 AM overnight).
const schedule=computed(()=>{const start=clock(form.value.workStartTime);let end=clock(form.value.workEndTime);if(!Number.isFinite(start)||!Number.isFinite(end)||start===end)return null;if(end<start)end+=1440;let lunch=end>1440?60:780;if(end>1440&&lunch<start)lunch+=1440;const lunchMinutes=Math.max(0,Math.min(end,lunch+60)-Math.max(start,lunch)),paid=end-start-lunchMinutes;return {hours:Math.round(paid/6)/10,lunch:lunchMinutes>0?`unpaid lunch ${timeLabel(lunch)}–${timeLabel(lunch+60)}`:'no unpaid lunch',problem:paid<240||paid>480?'Use a schedule with 4 to 8 paid hours.':paid===480&&lunchMinutes!==60?'An 8-hour day needs its one-hour unpaid lunch inside the shift.':''}})
const nightEmployee=computed(()=>String(selected.value?.shift).toLowerCase()==='night')
// Employee Management decides the shift; the saved hours here should match it.
const shiftMismatch=computed(()=>Boolean(selected.value)&&nightEmployee.value!==overnight.value)
function useEmployeeShift(){const night=nightEmployee.value;form.value.workStartTime=night?'21:00':'09:00';form.value.workEndTime=night?'06:00':'18:00'}
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const setupFilter=ref('all')
const filtered=computed(()=>profiles.value.filter(p=>`${p.first_name} ${p.last_name} ${p.employee_code} ${p.biometric_person_id}`.toLowerCase().includes(search.value.toLowerCase()) && (setupFilter.value==='all' || profileReady(p)===(setupFilter.value==='ready'))))
async function load(){const selectedShift=shift.value;try{const people=await getPayrollProfiles(selectedShift);if(selectedShift===shift.value)profiles.value=people}catch(e){error.value=e.message}}
async function choose(p){error.value='';history.value=[];selected.value=p;form.value={monthlyBasicSalary:p.monthly_basic_salary??'',monthlyCola:p.monthly_cola??0,biometricPersonId:p.biometric_person_id||'',effectiveFrom:today,workStartTime:String(p.work_start_time||(String(p.shift).toLowerCase()==='night'?'21:00':'09:00')).slice(0,5),workEndTime:String(p.work_end_time||(String(p.shift).toLowerCase()==='night'?'06:00':'18:00')).slice(0,5),workdays:[...(p.workdays||[1,2,3,4,5])],contributionSettings:contributionSettings(p)};try{history.value=await getPayrollProfileHistory(p.employee_id)}catch(e){error.value=e.message}}
async function save(){busy.value=true;error.value='';try{await updatePayrollProfile(selected.value.employee_id,{...form.value,unpaidBreakMinutes:60,dailyRateDivisor:261});await load();const updated=profiles.value.find(p=>p.employee_id===selected.value.employee_id);if(updated)await choose(updated);else{selected.value=null;history.value=[]}toast.success('Pay & schedule saved')}catch(e){error.value=e.message}finally{busy.value=false}}
onMounted(async()=>{try{await load();if(route.query.employee){const p=profiles.value.find(p=>String(p.employee_id)===String(route.query.employee));if(p)await choose(p)}}catch(e){error.value=e.message}})
</script>
<template>
  <div class="space-y-6">
    <PageHeader title="Pay & schedules"><template v-if="String(route.query.returnTo||'').startsWith('/payroll')" #actions><AppButton variant="outline" @click="router.push(String(route.query.returnTo))">{{String(route.query.returnTo)==='/payroll'?'Back to Payroll':'Back to pay run'}} →</AppButton></template></PageHeader>
    <EmployeeWorkspaceNav />
    <p v-if="error" role="alert" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)">{{error}}</p>
    <div class="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <section class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900" aria-label="Choose an employee">
        <div class="space-y-3 border-b border-gray-800 p-4">
          <PayrollShiftTabs v-model="shift" :disabled="busy" />
          <input v-model="search" class="form-control" placeholder="Name or employee / attendance ID" aria-label="Search pay profiles">
          <label class="block text-xs font-medium text-gray-400">Setup status<select v-model="setupFilter" class="form-control mt-1.5"><option value="all">All employees</option><option value="needs">Needs setup</option><option value="ready">Ready for payroll</option></select></label>
          <p class="text-xs text-gray-500">{{filtered.length}} employees</p>
        </div>
        <div class="max-h-72 overflow-y-auto p-2 lg:max-h-[calc(100dvh-25rem)]">
          <button v-for="p in filtered" :key="p.employee_id" type="button" class="employee-picker__item" :class="{'employee-picker__item--active':selected?.employee_id===p.employee_id}" :aria-pressed="selected?.employee_id===p.employee_id" @click="choose(p)">
            <span class="block text-sm font-semibold text-gray-100">{{p.first_name}} {{p.last_name}}</span><span class="mt-1 block text-xs text-gray-500">Employee {{p.employee_code}} · Attendance {{p.biometric_person_id||'Not mapped'}}</span>
            <span class="mt-2 inline-flex items-center gap-1.5 text-xs" :style="{color:profileReady(p)?'var(--success-text)':'var(--warning-text)'}"><span class="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />{{profileReady(p)?'Ready for payroll':`Needs ${profileGaps(p).map(gap=>gap==='Attendance ID'?gap:gap.toLowerCase()).join(', ')}`}}</span>
          </button>
          <p v-if="!filtered.length" class="p-5 text-center text-sm text-gray-500">No employees match your filters.</p>
        </div>
      </section>
      <section v-if="selected" class="min-w-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-5 py-4"><div><h2 class="text-lg font-semibold text-gray-100">{{selected.first_name}} {{selected.last_name}}</h2><p class="mt-1 text-xs text-gray-500">Employee {{selected.employee_code}}</p></div><span class="rounded-full border border-gray-800 bg-gray-950 px-3 py-1 text-xs font-semibold text-gray-300">{{nightEmployee?'Night':'Day'}} shift</span></header>
        <form @submit.prevent="save">
          <div class="space-y-6 p-5">
            <section><h3 class="mb-4 text-sm font-semibold text-gray-100">Salary & attendance mapping</h3><div class="grid gap-4 sm:grid-cols-2">
              <label class="text-xs font-medium text-gray-400">Monthly basic salary<input v-model.number="form.monthlyBasicSalary" type="number" min="0.01" step="0.01" required class="form-control mt-1.5"></label>
              <label class="text-xs font-medium text-gray-400">Monthly COLA<input v-model.number="form.monthlyCola" type="number" min="0" step="0.01" class="form-control mt-1.5"></label>
              <label class="text-xs font-medium text-gray-400">Biometric Attendance ID<input v-model="form.biometricPersonId" class="form-control mt-1.5" maxlength="80" placeholder="Preserve leading zeroes"></label>
              <label class="text-xs font-medium text-gray-400">Effective from<input v-model="form.effectiveFrom" type="date" required class="form-control mt-1.5"></label>
            </div></section>
            <fieldset class="border-t border-gray-800 pt-5">
              <legend class="float-left mb-2 w-full text-sm font-semibold text-gray-100">Government contributions</legend>
              <p id="contribution-help" class="clear-both mb-4 text-xs text-gray-500">Check each ID that is ready. Pending IDs are excluded from month-end contributions.</p>
              <div class="grid gap-3 sm:grid-cols-3">
                <label v-for="option in contributionOptions" :key="option.key" class="flex cursor-pointer items-start gap-3 rounded-lg border p-3" :style="{borderColor:form.contributionSettings[option.key]?'var(--success-border)':'var(--warning-border)',background:form.contributionSettings[option.key]?'var(--success-bg)':'var(--warning-bg)'}">
                  <input v-model="form.contributionSettings[option.key]" type="checkbox" class="mt-1" :aria-label="`${option.label} ID ready`" aria-describedby="contribution-help">
                  <span><span class="block text-sm font-semibold text-gray-100">{{option.label}}</span><span class="mt-1 block text-xs" :style="{color:form.contributionSettings[option.key]?'var(--success-text)':'var(--warning-text)'}">{{form.contributionSettings[option.key]?'ID ready':'ID pending'}}</span></span>
                </label>
              </div>
            </fieldset>
            <section class="border-t border-gray-800 pt-5"><h3 class="mb-4 text-sm font-semibold text-gray-100">Work schedule</h3><div class="grid gap-4 sm:grid-cols-2">
              <label class="text-xs font-medium text-gray-400">Work starts<input v-model="form.workStartTime" type="time" required class="form-control mt-1.5"></label><label class="text-xs font-medium text-gray-400">Work ends{{overnight?' · next day':''}}<input v-model="form.workEndTime" type="time" required class="form-control mt-1.5"></label>
              <fieldset class="sm:col-span-2"><legend class="text-xs font-medium text-gray-400">Scheduled workdays</legend><div class="mt-2 flex flex-wrap gap-2"><label v-for="(day,index) in days" :key="day" class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-800 px-2.5 py-2 text-sm"><input v-model="form.workdays" type="checkbox" :value="index">{{day}}</label></div></fieldset>
            </div><p v-if="schedule" class="mt-4 text-xs text-gray-500">{{schedule.hours}} paid hours · {{schedule.lunch}}</p>
            <div v-if="shiftMismatch || schedule?.problem" class="mt-4 rounded-lg border p-3 text-sm" style="color:var(--warning-text);background:var(--warning-bg);border-color:var(--warning-border)">
              <template v-if="shiftMismatch"><p>{{overnight?'Overnight':'Daytime'}} hours are entered for a {{nightEmployee?'night':'day'}}-shift employee.</p><button type="button" class="mt-1 font-semibold underline" @click="useEmployeeShift">Use {{nightEmployee?'9 PM – 6 AM':'9 AM – 6 PM'}}</button></template><p v-if="schedule?.problem" role="alert" class="mt-2 font-medium">{{schedule.problem}}</p>
            </div></section>
          </div>
          <footer class="flex justify-end border-t border-gray-800 bg-gray-950/40 px-5 py-4"><AppButton type="submit" :loading="busy" :disabled="!!schedule?.problem">Save pay & schedule</AppButton></footer>
        </form>
        <details class="border-t border-gray-800 p-5">
          <summary class="cursor-pointer text-sm font-semibold text-gray-300">Pay & schedule history <span class="ml-1 text-xs font-normal text-gray-500">{{history.length}} records</span></summary>
          <div class="mt-4 overflow-auto">
            <table v-if="history.length" class="w-full text-left text-sm">
              <thead><tr><th class="table-heading">Saved dates</th><th class="table-heading">Monthly basic</th><th class="table-heading">COLA</th><th class="table-heading">Schedule</th><th class="table-heading">Contributions</th></tr></thead>
              <tbody><tr v-for="p in history" :key="p.id" class="border-t border-gray-800"><td class="table-cell whitespace-nowrap">{{p.effective_from}} – {{p.effective_to||'Current'}}</td><td class="table-cell">{{Number(p.monthly_basic_salary).toFixed(2)}}</td><td class="table-cell">{{Number(p.monthly_cola).toFixed(2)}}</td><td class="table-cell whitespace-nowrap">{{timeLabel(clock(p.work_start_time))}} – {{timeLabel(clock(p.work_end_time))}}</td><td class="table-cell">{{contributionSummary(p)}}</td></tr></tbody>
            </table>
            <p v-else class="text-sm text-gray-500">No saved pay setup yet.</p>
          </div>
        </details>
      </section>
      <EmptyState v-else title="Choose an employee" description="Select a name to review their salary, attendance ID and schedule." />
    </div>
  </div>
</template>
