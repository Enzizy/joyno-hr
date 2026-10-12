<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import ReportWorkspaceNav from '@/components/reports/ReportWorkspaceNav.vue'
import AppButton from '@/components/ui/AppButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { getPayrollRuns, listAttendanceReviews, getPayrollRegisterExport, getPayrollPaymentExport, getConfirmedAttendanceExport } from '@/services/api'
import { runScope, reviewScope, shiftLabel } from '@/utils/payrollScope'
import { formatWorkDate, formatWorkRange } from '@/utils/payrollPeriods'
import { paydayForPeriodEnd, periodForPayday } from '@/utils/payRun'

const route = useRoute()
const attendance = computed(() => route.meta.reportKind === 'attendance')
const rows = ref([]), loading = ref(false), error = ref(''), busy = ref('')
const month = ref(''), shift = ref('all'), status = ref('all'), includePractice = ref(false)
const local = import.meta.env.DEV
const listFrom = data => Array.isArray(data) ? data : data?.items || data?.runs || []
const isTest = row => Boolean(row.rule_snapshot?.isTest || row.is_test || row.isTest)
const scope = row => attendance.value ? reviewScope(row) : runScope(row)
const rowStatus = row => attendance.value ? row.review_state : row.status
const rowPayday = row => String(row.payday || paydayForPeriodEnd(row.period_end) || '').slice(0, 10)
const statuses = computed(() => attendance.value ? ['draft', 'confirmed'] : ['draft', 'approved', 'locked'])
const filtered = computed(() => rows.value.filter(row =>
  (includePractice.value || !isTest(row)) &&
  (!month.value || String(attendance.value ? row.period_end : rowPayday(row)).slice(0, 7) === month.value) &&
  (shift.value === 'all' || scope(row) === shift.value) &&
  (status.value === 'all' || rowStatus(row) === status.value)
).sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)) || Number(b.id) - Number(a.id)))

let loadVersion = 0
async function load() {
  const version = ++loadVersion
  const kind = attendance.value
  loading.value = true
  error.value = ''
  rows.value = []
  try {
    const data = kind ? await listAttendanceReviews('all') : await getPayrollRuns()
    if (version === loadVersion) rows.value = listFrom(data)
  } catch (e) { if (version === loadVersion) error.value = e.message || 'Unable to load reports.' }
  finally { if (version === loadVersion) loading.value = false }
}
watch(attendance, () => { status.value = 'all'; load() }, { immediate: true })

function runLink(row) {
  const payday = paydayForPeriodEnd(row.period_end)
  if (!periodForPayday(payday)) return null
  return { path: `/payroll/${payday}/${scope(row) === 'night' ? 'night' : 'day'}`, query: {
    step: attendance.value ? 'attendance' : 'review',
    ...(attendance.value ? { batch: String(row.id) } : { run: String(row.id) }),
    ...(isTest(row) ? { practice: 'true' } : {}),
  } }
}

async function download(row, type) {
  const key = `${row.id}:${type}`
  busy.value = key
  error.value = ''
  try {
    const blob = type === 'dtr' ? await getConfirmedAttendanceExport(row.id)
      : type === 'payment' ? await getPayrollPaymentExport(row.id)
      : await getPayrollRegisterExport(row.id, type)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${isTest(row) ? 'TEST-ONLY-' : ''}${type}-${scope(row)}-${row.id}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { error.value = e.message || 'Unable to download this report.' }
  finally { busy.value = '' }
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader :title="attendance ? 'Attendance reports' : 'Payroll reports'"><template #actions><AppButton variant="secondary" :loading="loading" @click="load">Refresh</AppButton></template></PageHeader>
    <ReportWorkspaceNav />
    <div class="filter-panel grid items-end gap-4 sm:grid-cols-3">
      <label class="text-xs font-medium text-gray-400">{{ attendance ? 'Work month (period ends)' : 'Payday month' }}<input v-model="month" type="month" class="form-control mt-1.5"></label>
      <label class="text-xs font-medium text-gray-400">Shift<select v-model="shift" class="form-control mt-1.5"><option value="all">All shifts</option><option value="day">Day shift</option><option value="night">Night shift</option></select></label>
      <label class="text-xs font-medium text-gray-400">Status<select v-model="status" class="form-control mt-1.5"><option value="all">All statuses</option><option v-for="state in statuses" :key="state" :value="state">{{ state === 'locked' ? 'Closed' : state.charAt(0).toUpperCase() + state.slice(1) }}</option></select></label>
      <div class="flex flex-wrap items-center justify-between gap-3 sm:col-span-3"><label v-if="local" class="flex items-center gap-2 text-xs text-gray-400"><input v-model="includePractice" type="checkbox">Include practice records</label><button v-if="month || shift !== 'all' || status !== 'all' || includePractice" type="button" class="text-xs font-semibold text-primary-300 hover:underline" @click="month = ''; shift = 'all'; status = 'all'; includePractice = false">Clear filters</button><span class="ml-auto text-xs text-gray-500">{{ filtered.length }} {{ attendance ? (filtered.length === 1 ? 'review' : 'reviews') : (filtered.length === 1 ? 'pay run' : 'pay runs') }}</span></div>
    </div>
    <p v-if="error" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)" role="alert">{{ error }}</p>
    <div v-if="loading" class="surface-card p-6 text-sm text-gray-400" role="status">Loading reports…</div>
    <EmptyState v-else-if="!filtered.length" :title="rows.length ? 'No records match these filters' : attendance ? 'No attendance reviews yet' : 'No payroll runs yet'" :description="attendance ? 'Confirmed reviews make their DTR available here.' : 'Saved payroll registers and contribution reports will appear here.'" />
    <div v-else class="space-y-3">
      <article v-for="row in filtered" :key="row.id" class="report-row">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2"><h2 class="text-base font-semibold text-gray-100">{{ attendance ? formatWorkRange(row.period_start, row.period_end) : formatWorkDate(rowPayday(row)) + ' payday' }}</h2><StatusBadge :status="rowStatus(row) === 'locked' ? 'Closed' : rowStatus(row)" :variant="rowStatus(row) === 'confirmed' || rowStatus(row) === 'locked' ? 'success' : 'auto'" /><StatusBadge v-if="isTest(row)" variant="info">Test only</StatusBadge></div>
          <p class="mt-1 text-sm text-gray-400">{{ shiftLabel(scope(row)) }}<template v-if="!attendance"> · {{ formatWorkRange(row.period_start, row.period_end) }}</template></p>
          <p v-if="attendance" class="mt-1 break-words text-xs text-gray-500">{{ row.file_name }}</p>
          <RouterLink v-if="runLink(row)" :to="runLink(row)" class="mt-2 inline-flex text-xs font-semibold text-primary-300 hover:underline">{{ attendance ? 'Open attendance review' : 'Open pay run' }} →</RouterLink>
        </div>
        <div class="flex flex-wrap gap-2">
          <template v-if="attendance"><AppButton size="sm" variant="outline" :disabled="row.review_state !== 'confirmed' || Boolean(busy)" :loading="busy === `${row.id}:dtr`" @click="download(row, 'dtr')">Download DTR</AppButton><span v-if="row.review_state !== 'confirmed'" class="self-center text-xs text-gray-500">Confirm review to export</span></template>
          <template v-else><AppButton size="sm" variant="outline" :disabled="Boolean(busy)" :loading="busy === `${row.id}:register`" @click="download(row, 'register')">Pay register</AppButton><AppButton size="sm" variant="secondary" :disabled="Boolean(busy)" :loading="busy === `${row.id}:remittance`" @click="download(row, 'remittance')">Contributions</AppButton><AppButton v-if="['approved', 'locked'].includes(row.status)" size="sm" variant="secondary" :disabled="Boolean(busy)" :loading="busy === `${row.id}:payment`" @click="download(row, 'payment')">Payment register</AppButton></template>
        </div>
      </article>
      <p v-if="!attendance" class="text-xs text-gray-500">The pay register includes each employee’s 13th-month accrual. Draft exports keep their draft status.</p>
    </div>
  </div>
</template>
