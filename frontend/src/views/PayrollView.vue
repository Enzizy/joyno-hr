<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import {
  approvePayrollRun,
  getMyPayrollLines,
  getPayrollAttendanceBatch,
  getPayrollRun,
  getPayrollProfiles,
  getPayrollRuns,
  importPayrollAttendance,
  lockPayrollRun,
  previewPayrollRun,
  updatePayrollAttendanceDay,
  updatePayrollProfile,
} from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PayrollAttendanceAdjustmentModal from '@/components/payroll/PayrollAttendanceAdjustmentModal.vue'
import { isManagementRole } from '@/utils/roles'

const auth = useAuthStore()
const toast = useToastStore()
const canManage = computed(() => isManagementRole(auth.role))
const isEmployee = computed(() => auth.role === 'employee')
const busy = ref(false)
const loadingRun = ref(false)
const loading = ref(true)
const profiles = ref([])
const runs = ref([])
const myLines = ref([])
const preview = ref(null)
const attendanceResult = ref(null)
const selectedFile = ref(null)
const attendanceStart = ref('')
const attendanceEnd = ref('')
const cutoffStart = ref('')
const cutoffEnd = ref('')
const payDate = ref('')
const runAttendanceBatch = ref('')
const cutoffType = ref('second')
const editingProfile = ref(null)
const savingProfile = ref('')
const savingAttendanceDay = ref('')
const activeRun = ref(null)
const editingAttendanceDay = ref(null)
const workspaceTab = ref('payroll')
const workflowStep = ref(1)

const workflowSteps = [
  { id: 1, label: 'Pay profiles' },
  { id: 2, label: 'Attendance' },
  { id: 3, label: 'Preview' },
  { id: 4, label: 'Approve' },
]

function listFrom(result, key) {
  if (Array.isArray(result)) return result
  return result?.[key] || result?.data?.[key] || []
}

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
}

function displayName(row) {
  return row.employee_name || row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || `Employee ${row.employee_id ?? ''}`
}

onMounted(loadWorkspace)

async function loadWorkspace() {
  loading.value = true
  const tasks = []
  if (canManage.value) {
    tasks.push(getPayrollProfiles().then((data) => { profiles.value = listFrom(data, 'items') }))
    tasks.push(getPayrollRuns().then((data) => { runs.value = listFrom(data, 'items') }))
  }
  if (isEmployee.value) tasks.push(getMyPayrollLines().then((data) => { myLines.value = listFrom(data, 'items') }))
  const results = await Promise.allSettled(tasks)
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) toast.error(failed.reason?.message || 'Some payroll information could not be loaded.')
  loading.value = false
}

function onFileChange(event) {
  selectedFile.value = event.target.files?.[0] || null
  attendanceResult.value = null
}

async function importAttendance() {
  if (!selectedFile.value || !attendanceStart.value || !attendanceEnd.value || attendanceStart.value > attendanceEnd.value) {
    toast.error('Choose a CSV and a valid attendance date range.')
    return
  }
  busy.value = true
  try {
    const result = await importPayrollAttendance(selectedFile.value, attendanceStart.value, attendanceEnd.value)
    attendanceResult.value = normalizeBatch(result.batch || result)
    runAttendanceBatch.value = attendanceResult.value.id || ''
    workflowStep.value = 2
    toast.success('Attendance imported. Review daily records and exceptions before previewing payroll.')
  } catch (error) {
    toast.error(error.message || 'Attendance import failed.')
  } finally {
    busy.value = false
  }
}

function normalizeBatch(batch) {
  const days = (batch.daily || batch.days || []).map(normalizeDay)
  const exceptions = [
    ...(batch.exceptions || []),
    ...days.filter((day) => String(day.status || '').toLowerCase() === 'exception'),
  ]
  const errors = batch.errors || []
  return {
    ...batch,
    exception_count: batch.exception_count ?? exceptions.length + errors.length,
    errors,
    daily: days,
    exceptions: exceptions.map((item) => ({
      ...normalizeDay(item),
      reason: item.reason || item.exception_reason || '',
    })),
  }
}

function timeValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 5)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

function normalizeDay(day) {
  return {
    ...day,
    employee_name: day.employee_name || [day.first_name, day.last_name].filter(Boolean).join(' '),
    work_date: String(day.work_date || day.date || '').slice(0, 10),
    timeIn: timeValue(day.timeIn ?? day.time_in ?? day.first_scan_at),
    timeOut: timeValue(day.timeOut ?? day.time_out ?? day.last_scan_at),
    status: day.status || 'present',
  }
}

function beginProfileEdit(profile) {
  editingProfile.value = {
    id: profile.employee_id ?? profile.id,
    employee_name: displayName(profile),
    monthly_basic: Number(profile.monthly_basic ?? profile.monthly_basic_salary ?? profile.monthlyBasicSalary ?? profile.monthly_salary ?? 15000),
    daily_fare: Number(profile.daily_fare ?? profile.daily_fare_rate ?? profile.dailyFareRate ?? profile.daily_travel_allowance ?? 0),
  }
}

async function saveProfile() {
  if (!editingProfile.value) return
  const profile = editingProfile.value
  if (!profile.id || profile.monthly_basic < 0 || profile.daily_fare < 0) {
    toast.error('Enter a valid employee and non-negative pay amounts.')
    return
  }
  savingProfile.value = String(profile.id)
  try {
    const result = await updatePayrollProfile(profile.id, {
      monthlyBasicSalary: Number(profile.monthly_basic),
      dailyFareRate: Number(profile.daily_fare),
      effectiveFrom: new Date().toISOString().slice(0, 10),
    })
    const saved = result.profile || result
    profiles.value = profiles.value.map((row) => String(row.employee_id ?? row.id) === String(profile.id)
      ? { ...row, ...saved, monthly_basic: Number(saved.monthly_basic ?? saved.monthly_basic_salary ?? saved.monthlyBasicSalary ?? profile.monthly_basic), daily_fare: Number(saved.daily_fare ?? saved.daily_fare_rate ?? saved.dailyFareRate ?? profile.daily_fare) }
      : row)
    editingProfile.value = null
    toast.success('Pay profile saved.')
  } catch (error) {
    toast.error(error.message || 'Unable to save pay profile.')
  } finally {
    savingProfile.value = ''
  }
}

async function saveAttendanceAdjustment(payload) {
  const day = editingAttendanceDay.value
  if (!day?.id) return
  savingAttendanceDay.value = String(day.id)
  try {
    await updatePayrollAttendanceDay(day.id, payload)
    if (attendanceResult.value?.id) {
      attendanceResult.value = normalizeBatch(await getPayrollAttendanceBatch(attendanceResult.value.id))
    }
    editingAttendanceDay.value = null
    toast.success('Attendance adjustment saved. Recreate any draft payroll preview to use the updated values.')
  } catch (error) {
    toast.error(error.message || 'Unable to save attendance adjustment.')
  } finally {
    savingAttendanceDay.value = ''
  }
}

async function createPreview() {
  if (!cutoffStart.value || !cutoffEnd.value || !payDate.value || cutoffStart.value > cutoffEnd.value) {
    toast.error('Enter a valid pay period and pay date.')
    return
  }
  busy.value = true
  try {
    const result = await previewPayrollRun({
      periodStart: cutoffStart.value,
      periodEnd: cutoffEnd.value,
      payday: payDate.value,
      cutoff: cutoffType.value,
      includeContributions: cutoffType.value === 'second',
      attendanceBatchId: runAttendanceBatch.value || null,
    })
    preview.value = result.run || result
    activeRun.value = preview.value
    workflowStep.value = 4
    toast.success('Payroll preview is ready. Review every exception and amount before approval.')
    await refreshRuns()
  } catch (error) {
    toast.error(error.message || 'Unable to create payroll preview.')
  } finally {
    busy.value = false
  }
}

async function refreshRuns() {
  try {
    runs.value = listFrom(await getPayrollRuns(), 'items')
  } catch (error) {
    toast.error(error.message || 'Unable to refresh payroll runs.')
  }
}

async function changeRunState(action, run) {
  busy.value = true
  try {
    const result = action === 'approve' ? await approvePayrollRun(run.id) : await lockPayrollRun(run.id)
    const updated = result.run || result
    preview.value = updated
    activeRun.value = updated
    toast.success(action === 'approve' ? 'Payroll approved.' : 'Payroll locked.')
    await refreshRuns()
  } catch (error) {
    toast.error(error.message || `Unable to ${action} payroll.`)
  } finally {
    busy.value = false
  }
}

async function selectRun(run) {
  if (!run?.id) return
  loadingRun.value = true
  try {
    const result = await getPayrollRun(run.id)
    const detail = result.run || result
    activeRun.value = detail
    preview.value = detail
  } catch (error) {
    toast.error(error.message || 'Unable to load payroll run details.')
  } finally {
    loadingRun.value = false
  }
}

const currentLines = computed(() => activeRun.value?.lines || activeRun.value?.items || [])
const totalNet = computed(() => Number(activeRun.value?.totals?.net_pay ?? currentLines.value.reduce((sum, line) => sum + Number(line.net_pay || 0), 0)))
const attendanceDays = computed(() => attendanceResult.value?.daily || [])
const fareWeeks = computed(() => attendanceResult.value?.fare_weeks || [])
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Payroll" description="Prepare semi-monthly payroll, reconcile attendance, and review your own payslips." eyebrow="People operations" />

    <div v-if="loading" class="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400" role="status">Loading payroll workspace…</div>

    <template v-else-if="isEmployee">
      <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="mb-4"><h2 class="font-semibold text-gray-100">My payslips</h2><p class="mt-1 text-sm text-gray-400">Only your payroll results are shown here.</p></div>
        <EmptyState v-if="!myLines.length" title="No payslips yet" description="Your approved payroll results will appear here after HR completes a payroll run." />
        <div v-else class="space-y-3">
          <article v-for="line in myLines" :key="line.id || `${line.period_start}-${line.pay_date}`" class="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold text-gray-100">{{ line.period_label || `${line.period_start} - ${line.period_end}` }}</h3><p class="mt-1 text-xs text-gray-500">Pay date: {{ line.pay_date || '-' }}</p></div><p class="text-xl font-semibold text-emerald-300">{{ money(line.net_pay) }}</p></div>
            <dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5"><div><dt class="text-xs text-gray-500">Gross salary</dt><dd class="mt-1 text-gray-200">{{ money(line.gross_salary ?? line.grossSalary ?? line.basic_pay) }}</dd></div><div><dt class="text-xs text-gray-500">SSS</dt><dd class="mt-1 text-gray-200">{{ money(line.employee_sss ?? line.sss_employee ?? line.sss_deduction) }}</dd></div><div><dt class="text-xs text-gray-500">PhilHealth</dt><dd class="mt-1 text-gray-200">{{ money(line.employee_philhealth ?? line.phic_employee ?? line.phic_deduction) }}</dd></div><div><dt class="text-xs text-gray-500">Pag-IBIG</dt><dd class="mt-1 text-gray-200">{{ money(line.employee_pagibig ?? line.pagibig_employee ?? line.pagibig_deduction) }}</dd></div><div><dt class="text-xs text-gray-500">13th-month accrual</dt><dd class="mt-1 text-gray-200">{{ money(line.thirteenth_month_accrual ?? line.thirteenthMonthAccrual) }}</dd></div></dl>
            <p class="mt-3 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-gray-400">Weekly fare is paid separately and is not included in this net salary. Period fare record: {{ money(line.weekly_fare_allowance ?? line.weeklyFareAllowance ?? line.fare_allowance) }}.</p>
            <p v-if="line.status" class="mt-3 text-xs text-gray-500">Status: {{ line.status }}</p>
          </article>
        </div>
      </section>
    </template>

    <template v-else-if="canManage">
      <div class="flex gap-2 rounded-xl border border-gray-800 bg-gray-900 p-2">
        <button type="button" class="rounded-lg px-4 py-2 text-sm font-medium" :class="workspaceTab === 'payroll' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-800'" @click="workspaceTab = 'payroll'">Salary payroll</button>
        <button type="button" class="rounded-lg px-4 py-2 text-sm font-medium" :class="workspaceTab === 'fare' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-800'" @click="workspaceTab = 'fare'">Weekly fare</button>
      </div>

      <section v-if="workspaceTab === 'fare'" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="mb-4"><h2 class="font-semibold text-gray-100">Weekly fare report</h2><p class="mt-1 text-sm text-gray-400">Paid separately from salary. Each attended day receives its configured fare less ₱5 per late minute, capped at zero.</p></div>
        <EmptyState v-if="!fareWeeks.length" compact title="No weekly fare calculated" description="Import attendance in Salary payroll step 2 to generate the weekly fare report." />
        <div v-else class="overflow-x-auto rounded-lg border border-gray-800"><table class="w-full min-w-[560px] text-left text-sm"><thead class="border-b border-gray-800 text-xs uppercase text-gray-500"><tr><th class="px-3 py-2">Week</th><th class="px-3 py-2">Employee</th><th class="px-3 py-2 text-right">Fare payable</th></tr></thead><tbody class="divide-y divide-gray-800"><tr v-for="week in fareWeeks" :key="`${week.week_start}-${week.employee_id}`"><td class="px-3 py-3 text-gray-400">{{ week.week_start }} – {{ week.week_end }}</td><td class="px-3 py-3 text-gray-200">{{ week.employee_name || week.employee_code }}</td><td class="px-3 py-3 text-right font-semibold text-emerald-300">{{ money(week.amount) }}</td></tr></tbody></table></div>
      </section>

      <template v-else>
        <nav class="grid grid-cols-2 gap-2 rounded-xl border border-gray-800 bg-gray-900 p-2 sm:grid-cols-4" aria-label="Payroll workflow">
          <button v-for="step in workflowSteps" :key="step.id" type="button" class="rounded-lg px-3 py-2.5 text-left text-sm transition" :class="workflowStep === step.id ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-800'" @click="workflowStep = step.id"><span class="mr-2 text-xs opacity-70">{{ step.id }}</span>{{ step.label }}</button>
        </nav>

        <section v-if="workflowStep === 1" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 class="font-semibold text-gray-100">1. Confirm pay profiles</h2><p class="mt-1 text-sm text-gray-400">Set each employee’s monthly basic salary and separately paid daily fare.</p></div><span class="text-xs text-gray-500">{{ profiles.length }} employees</span></div>
          <EmptyState v-if="!profiles.length" compact title="No pay profiles loaded" description="Add employees first, then return here to configure payroll." />
          <div v-else class="space-y-2">
            <div v-for="profile in profiles" :key="profile.employee_id ?? profile.id" class="flex flex-col gap-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0"><p class="font-medium text-gray-100">{{ displayName(profile) }}</p><p class="mt-0.5 text-xs text-gray-500">{{ profile.employee_code || `ID ${profile.employee_id ?? profile.id}` }}</p></div>
              <template v-if="editingProfile && String(editingProfile.id) === String(profile.employee_id ?? profile.id)"><div class="grid flex-1 gap-2 sm:max-w-lg sm:grid-cols-2"><label class="text-xs text-gray-500">Monthly basic<input v-model.number="editingProfile.monthly_basic" type="number" min="0" step="0.01" class="form-control mt-1"></label><label class="text-xs text-gray-500">Daily fare<input v-model.number="editingProfile.daily_fare" type="number" min="0" step="0.01" class="form-control mt-1"></label></div><div class="flex gap-2"><AppButton size="sm" :loading="savingProfile === String(editingProfile.id)" @click="saveProfile">Save</AppButton><AppButton size="sm" variant="secondary" @click="editingProfile = null">Cancel</AppButton></div></template>
              <template v-else><div class="flex items-center gap-5 text-sm"><span><span class="block text-[10px] uppercase text-gray-500">Monthly basic</span><strong class="text-gray-200">{{ money(profile.monthly_basic ?? profile.monthly_basic_salary ?? profile.monthly_salary) }}</strong></span><span><span class="block text-[10px] uppercase text-gray-500">Daily fare</span><strong class="text-gray-200">{{ money(profile.daily_fare ?? profile.daily_fare_rate ?? profile.daily_travel_allowance) }}</strong></span><AppButton size="sm" variant="secondary" @click="beginProfileEdit(profile)">Edit</AppButton></div></template>
            </div>
          </div>
          <div class="mt-5 text-right"><AppButton @click="workflowStep = 2">Continue to attendance</AppButton></div>
        </section>

        <section v-if="workflowStep === 2" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div class="mb-4"><h2 class="font-semibold text-gray-100">2. Import and adjust attendance</h2><p class="mt-1 text-sm text-gray-400">Import facial-recognition scans, then record direct-to-management undertime or half-day adjustments.</p></div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label class="block text-xs font-medium text-gray-400">Period start<input v-model="attendanceStart" type="date" class="form-control mt-1.5"></label>
            <label class="block text-xs font-medium text-gray-400">Period end<input v-model="attendanceEnd" type="date" class="form-control mt-1.5"></label>
            <label class="block text-xs font-medium text-gray-400">CSV file<input type="file" accept=".csv,text/csv" class="mt-1.5 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-200" @change="onFileChange"></label>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-3"><AppButton :loading="busy" :disabled="!selectedFile" @click="importAttendance">Import attendance</AppButton><span class="text-xs text-gray-500">Expected columns: employee_code and timestamp.</span></div>

          <div v-if="attendanceResult" class="mt-5 space-y-4">
            <div class="rounded-lg border border-gray-800 bg-gray-950/50 p-3"><p class="font-medium text-gray-200">Batch {{ attendanceResult.id }}</p><div class="mt-2 flex flex-wrap gap-3 text-xs text-gray-400"><span>{{ attendanceResult.row_count ?? 0 }} scan records</span><span :class="attendanceResult.exceptions?.length ? 'text-amber-300' : 'text-emerald-300'">{{ attendanceResult.exceptions?.length ?? 0 }} unresolved scan exceptions</span><span :class="attendanceResult.errors?.length ? 'text-red-300' : 'text-emerald-300'">{{ attendanceResult.errors?.length ?? 0 }} import errors</span></div></div>
            <div v-if="attendanceResult.errors?.length" class="rounded-lg border border-red-900/50 bg-red-950/10 p-3 text-xs text-red-200"><p class="font-semibold">Re-import a corrected CSV before approval:</p><ul class="mt-2 space-y-1"><li v-for="error in attendanceResult.errors" :key="error.id">Row {{ error.source_row }}: {{ error.error }}</li></ul></div>
            <div class="overflow-x-auto rounded-lg border border-gray-800"><table class="w-full min-w-[920px] text-left text-sm"><thead class="border-b border-gray-800 text-xs uppercase text-gray-500"><tr><th class="px-3 py-2">Date</th><th class="px-3 py-2">Employee</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Time in/out</th><th class="px-3 py-2">Late</th><th class="px-3 py-2">Undertime</th><th class="px-3 py-2 text-right">Action</th></tr></thead><tbody class="divide-y divide-gray-800"><tr v-for="day in attendanceDays" :key="day.id" :class="day.status === 'exception' ? 'bg-amber-950/10' : ''"><td class="px-3 py-3 text-gray-400">{{ day.work_date }}</td><td class="px-3 py-3 text-gray-200">{{ day.employee_name || day.employee_code }}</td><td class="px-3 py-3 capitalize" :class="day.status === 'exception' ? 'text-amber-300' : 'text-gray-300'">{{ String(day.status).replaceAll('_', ' ') }}</td><td class="px-3 py-3 text-gray-400">{{ day.timeIn || '—' }} / {{ day.timeOut || '—' }}</td><td class="px-3 py-3 text-gray-400">{{ Number(day.late_minutes || 0) }} min</td><td class="px-3 py-3 text-gray-400">{{ Number(day.undertime_minutes || 0) }} min</td><td class="px-3 py-3 text-right"><AppButton size="sm" variant="secondary" @click="editingAttendanceDay = day">Adjust</AppButton></td></tr></tbody></table></div>
          </div>
          <EmptyState v-else class="mt-5" compact title="No attendance batch yet" description="Import the facial-recognition CSV to create daily attendance records." />
          <div class="mt-5 flex justify-between"><AppButton variant="secondary" @click="workflowStep = 1">Back</AppButton><AppButton :disabled="!attendanceResult" @click="workflowStep = 3">Continue to preview</AppButton></div>
        </section>

        <section v-if="workflowStep === 3" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div class="mb-4"><h2 class="font-semibold text-gray-100">3. Create payroll preview</h2><p class="mt-1 text-sm text-gray-400">Choose the payday explicitly. The 30th payroll automatically applies government deductions.</p></div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-xs font-medium text-gray-400">Period start<input v-model="cutoffStart" type="date" class="form-control mt-1.5"></label>
            <label class="block text-xs font-medium text-gray-400">Period end<input v-model="cutoffEnd" type="date" class="form-control mt-1.5"></label>
            <label class="block text-xs font-medium text-gray-400">Pay date<input v-model="payDate" type="date" class="form-control mt-1.5"></label>
            <label class="block text-xs font-medium text-gray-400">Attendance batch<input v-model="runAttendanceBatch" type="text" placeholder="Imported batch ID" class="form-control mt-1.5"></label>
          </div>
          <fieldset class="mt-4"><legend class="text-xs font-medium text-gray-400">Payroll schedule</legend><div class="mt-2 grid gap-2 sm:grid-cols-2"><label class="flex cursor-pointer gap-3 rounded-lg border p-3" :class="cutoffType === 'first' ? 'border-primary-500 bg-primary-950/20' : 'border-gray-800 bg-gray-950/50'"><input v-model="cutoffType" type="radio" value="first" class="mt-1"><span><strong class="block text-sm text-gray-200">15th payroll</strong><span class="text-xs text-gray-500">No SSS, PhilHealth, or Pag-IBIG deduction.</span></span></label><label class="flex cursor-pointer gap-3 rounded-lg border p-3" :class="cutoffType === 'second' ? 'border-primary-500 bg-primary-950/20' : 'border-gray-800 bg-gray-950/50'"><input v-model="cutoffType" type="radio" value="second" class="mt-1"><span><strong class="block text-sm text-gray-200">30th payroll</strong><span class="text-xs text-gray-500">Apply SSS, PhilHealth, and Pag-IBIG.</span></span></label></div></fieldset>
          <p class="mt-3 text-xs leading-5 text-gray-500">Absence and undertime reduce basic salary. Lateness only reduces the separately paid daily fare by ₱5 per minute.</p>
          <div class="mt-5 flex justify-between"><AppButton variant="secondary" @click="workflowStep = 2">Back</AppButton><AppButton :loading="busy" :disabled="!runAttendanceBatch" @click="createPreview">Create preview</AppButton></div>
        </section>

        <template v-if="workflowStep === 4">
          <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div class="mb-4"><h2 class="font-semibold text-gray-100">4. Review and approve</h2><p class="mt-1 text-sm text-gray-400">All management roles can prepare, approve, and lock payroll. Approved or locked payroll cannot be changed.</p></div>
            <EmptyState v-if="!runs.length" compact title="No payroll runs yet" description="Return to step 3 and create a preview." />
            <div v-else class="space-y-2"><article v-for="run in runs" :key="run.id" class="rounded-lg border border-gray-800 bg-gray-950/40 p-3"><div class="flex flex-wrap items-center justify-between gap-3"><button type="button" class="text-left" :disabled="loadingRun" @click="selectRun(run)"><p class="font-medium text-gray-100">{{ run.period_label || `${run.period_start || run.periodStart} - ${run.period_end || run.periodEnd}` }}</p><p class="mt-1 text-xs text-gray-500">Pay date {{ run.pay_date || run.payday || '—' }} · {{ run.employee_count ?? run.lines?.length ?? 0 }} employees · {{ money(run.totals?.net_pay ?? run.total_net_pay) }} net</p></button><div class="flex items-center gap-2"><span class="rounded-full bg-gray-800 px-2.5 py-1 text-xs font-semibold capitalize text-gray-300">{{ run.status || 'draft' }}</span><AppButton v-if="['draft', 'preview', 'pending_review'].includes(String(run.status || 'draft').toLowerCase())" size="sm" variant="success" :loading="busy" @click="changeRunState('approve', run)">Approve</AppButton><AppButton v-if="String(run.status || '').toLowerCase() === 'approved'" size="sm" variant="secondary" :loading="busy" @click="changeRunState('lock', run)">Lock</AppButton></div></div></article></div>
          </section>

          <section v-if="activeRun" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div class="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 class="font-semibold text-gray-100">Payroll review</h2><p class="mt-1 text-sm text-gray-400">{{ activeRun.period_label || `${activeRun.period_start || ''} – ${activeRun.period_end || ''}` }} · {{ activeRun.status || 'preview' }}</p></div><p class="text-lg font-semibold text-emerald-300">{{ money(totalNet) }} net total</p></div>
            <div v-if="loadingRun" class="rounded-lg border border-gray-800 p-4 text-sm text-gray-400" role="status">Loading run details...</div>
            <div v-else-if="!currentLines.length" class="rounded-lg border border-gray-800 p-4 text-sm text-gray-500">No employee line items are available.</div>
            <div v-else class="overflow-x-auto"><table class="w-full min-w-[980px] text-left text-sm"><thead class="border-b border-gray-800 text-xs uppercase text-gray-500"><tr><th class="px-3 py-2">Employee</th><th class="px-3 py-2">Gross salary</th><th class="px-3 py-2">SSS</th><th class="px-3 py-2">PhilHealth</th><th class="px-3 py-2">Pag-IBIG</th><th class="px-3 py-2">13th-month accrual</th><th class="px-3 py-2">Net pay</th></tr></thead><tbody class="divide-y divide-gray-800"><tr v-for="line in currentLines" :key="line.employee_id ?? line.id"><td class="px-3 py-3 font-medium text-gray-100">{{ displayName(line) }}</td><td class="px-3 py-3">{{ money(line.gross_salary ?? line.grossSalary ?? line.basic_pay) }}</td><td class="px-3 py-3">{{ money(line.employee_sss ?? line.sss_employee ?? line.sss_deduction) }}</td><td class="px-3 py-3">{{ money(line.employee_philhealth ?? line.phic_employee ?? line.phic_deduction) }}</td><td class="px-3 py-3">{{ money(line.employee_pagibig ?? line.pagibig_employee ?? line.pagibig_deduction) }}</td><td class="px-3 py-3">{{ money(line.thirteenth_month_accrual ?? line.thirteenthMonthAccrual) }}</td><td class="px-3 py-3 font-semibold text-emerald-300">{{ money(line.net_pay) }}</td></tr></tbody></table></div>
          </section>
          <div><AppButton variant="secondary" @click="workflowStep = 3">Back to preview</AppButton></div>
        </template>
      </template>

      <PayrollAttendanceAdjustmentModal :show="Boolean(editingAttendanceDay)" :day="editingAttendanceDay" :saving="Boolean(savingAttendanceDay)" @close="editingAttendanceDay = null" @save="saveAttendanceAdjustment" />
    </template>
  </div>
</template>
