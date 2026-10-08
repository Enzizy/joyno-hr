<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PayrollView from '@/views/PayrollView.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { listAttendanceReviews } from '@/services/api'
import { getPayrollProfiles, getPayrollRuns } from '@/services/backendService'
import { payrollFinalizationEnabled } from '@/config/features'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { isManagementRole } from '@/utils/roles'
import { runScope, shiftLabel } from '@/utils/payrollScope'
import { formatWorkDate, formatWorkRange } from '@/utils/payrollPeriods'
import { PAYDAY_STEPS, nextPayday, paydayForPeriodEnd, paydayProgress, paydayReadiness, paydaysAround, payRunStages, periodForPayday, reviewsForShift, runSummary } from '@/utils/payRun'

// Payroll home: what the next payday needs and by when, then the payroll history.
// Employees keep their own payslip list.
const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()
const canManage = computed(() => isManagementRole(auth.role))
const SHIFTS = ['day', 'night']
const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const loading = ref(true)
const reviews = ref({ day: [], night: [] })
const profiles = ref({ day: [], night: [] })
const runs = ref([])
const starting = ref(null)

const listFrom = (data, ...keys) => Array.isArray(data) ? data : keys.map(key => data?.[key]).find(Array.isArray) || []

async function load() {
  loading.value = true
  try {
    const [dayReviews, nightReviews, dayProfiles, nightProfiles, runList] = await Promise.all([
      listAttendanceReviews('day'), listAttendanceReviews('night'), getPayrollProfiles('day'), getPayrollProfiles('night'), getPayrollRuns(),
    ])
    reviews.value = { day: dayReviews || [], night: nightReviews || [] }
    profiles.value = { day: listFrom(dayProfiles, 'items', 'profiles'), night: listFrom(nightProfiles, 'items', 'profiles') }
    runs.value = listFrom(runList, 'items', 'runs')
  } catch (error) {
    toast.error(error.message || 'Unable to load payroll.')
  } finally {
    loading.value = false
  }
}
onMounted(() => { if (canManage.value) load() })

const stagesFor = (payday, shift) => {
  const period = periodForPayday(payday)
  return period ? payRunStages({ period, shift, profiles: profiles.value[shift], reviews: reviews.value[shift], runs: runs.value, finalizationEnabled: payrollFinalizationEnabled }) : []
}
const summary = (payday, shift) => periodForPayday(payday) ? runSummary(stagesFor(payday, shift)) : { label: 'Not started', tone: 'neutral' }
const runLink = (payday, shift) => ({ path: `/payroll/${payday}/${shift}` })
const finished = (payday, shift) => summary(payday, shift).label === 'Payslips released'
const started = (payday, shift) => summary(payday, shift).label !== 'Not started'
const longDate = (key) => new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${key}T12:00:00Z`))
const shortDate = (key) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${key}T12:00:00Z`))
const addDay = (key) => new Date(Date.parse(`${key}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
const daysFromToday = (key) => Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// The next payday is the focus. A past payday shows above it only if its payroll was started and not finished.
const next = computed(() => periodForPayday(nextPayday(today)))
const late = computed(() => {
  const last = periodForPayday(paydaysAround(today, { past: 1, future: 0 })[0])
  return last && SHIFTS.some(shift => started(last.payday, shift) && !finished(last.payday, shift)) ? last : null
})
const attendanceClosed = computed(() => today > next.value.end)
const closesIn = computed(() => daysFromToday(next.value.end))
const readiness = computed(() => paydayReadiness(next.value, profiles.value))
const shiftsWithPeople = computed(() => SHIFTS.filter(shift => readiness.value[shift]?.total))
const progress = computed(() => paydayProgress({ period: next.value, today,
  stagesByShift: shiftsWithPeople.value.filter(shift => readiness.value[shift].ready).map(shift => stagesFor(next.value.payday, shift)) }))
const stepDetail = (index) => [`${shortDate(next.value.end)}`, `from ${shortDate(addDay(next.value.end))}`, 'review, approve, mark as paid', shortDate(next.value.payday)][index]

// One row per shift: how many people are ready, and the one thing to do there.
function shiftAction(shift) {
  const info = readiness.value[shift]
  const payday = next.value.payday
  if (started(payday, shift)) return { kind: 'open', label: finished(payday, shift) ? 'View' : 'Continue', status: summary(payday, shift) }
  if (!info.ready) return { kind: 'setup', label: `Set up ${info.total}` }
  if (!attendanceClosed.value) return { kind: 'wait', label: `Upload from ${shortDate(addDay(next.value.end))}` }
  return { kind: 'open', label: 'Start', status: summary(payday, shift) }
}
const setupLink = (shift) => ({ path: '/compensation', query: { shift, returnTo: '/payroll' } })

// Payroll history: paydays with something stored (an attendance upload or a calculated run).
const historyPaydays = computed(() => {
  const days = new Set()
  for (const run of runs.value) if (!run.rule_snapshot?.isTest && runScope(run) !== 'all') days.add(paydayForPeriodEnd(run.period_end))
  for (const shift of SHIFTS) for (const review of reviewsForShift(reviews.value[shift], shift, false)) days.add(paydayForPeriodEnd(review.period_end))
  days.delete(null)
  return [...days].sort((a, b) => b.localeCompare(a)).map(payday => ({ payday, period: periodForPayday(payday) })).filter(row => row.period)
})
const legacyRuns = computed(() => runs.value.filter(run => runScope(run) === 'all'))

const startOptions = computed(() => paydaysAround(today, { past: 4, future: 2 }).sort().map(payday => ({ payday, period: periodForPayday(payday) })))
function openStart(payday = next.value.payday, shift = 'day') {
  starting.value = { payday, shift }
}
function begin() {
  const { payday, shift } = starting.value
  starting.value = null
  router.push({ ...runLink(payday, shift), query: { step: 'attendance' } })
}
</script>

<template>
  <PayrollView v-if="!canManage" />
  <div v-else class="space-y-6">
    <PageHeader title="Payroll">
      <template #actions>
        <AppButton variant="outline" @click="router.push('/compensation')">Employee pay setup</AppButton>
        <AppButton variant="outline" @click="openStart()">Record pay</AppButton>
      </template>
    </PageHeader>

    <div v-if="loading" class="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400" role="status">Loading payroll…</div>
    <template v-else>
      <section v-if="late" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800/50 bg-amber-950/15 px-5 py-4">
        <div><p class="text-xs font-semibold uppercase tracking-wide text-amber-300">Not finished · {{ formatWorkDate(late.payday) }} payday</p><p class="mt-1 text-sm text-gray-300">Work dates {{ formatWorkRange(late.start, late.end) }}</p></div>
        <div class="flex flex-wrap gap-3">
          <RouterLink v-for="shift in SHIFTS.filter(shift => started(late.payday, shift) && !finished(late.payday, shift))" :key="shift" :to="runLink(late.payday, shift)" class="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm hover:border-primary-500">
            <span class="font-semibold text-gray-100">{{ shiftLabel(shift) }}</span> <span class="text-gray-400">· {{ summary(late.payday, shift).label }}</span> <span class="font-semibold text-primary-300">Continue →</span>
          </RouterLink>
        </div>
      </section>

      <section class="overflow-hidden rounded-xl border border-primary-800/50 bg-primary-950/10">
        <div class="p-5">
          <p class="text-xs font-semibold uppercase tracking-wide text-primary-300">Next payday · {{ daysFromToday(next.payday) === 0 ? 'today' : `in ${plural(daysFromToday(next.payday), 'day')}` }}</p>
          <h2 class="mt-1 text-2xl font-semibold text-gray-100">{{ longDate(next.payday) }}</h2>
          <p class="mt-1 text-sm text-gray-400">Work dates {{ formatWorkRange(next.start, next.end) }} · {{ attendanceClosed ? 'attendance is closed' : closesIn === 0 ? 'attendance closes today' : `attendance closes in ${plural(closesIn, 'day')}` }}{{ next.cutoff === 'second' ? ' · includes SSS, PhilHealth and Pag-IBIG' : '' }}</p>
          <ol class="mt-5 grid gap-2 sm:grid-cols-4" aria-label="Payday steps">
            <li v-for="(step, index) in PAYDAY_STEPS" :key="step" class="flex items-start gap-2.5">
              <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold" :class="index < progress ? 'border-emerald-500 bg-emerald-500 text-gray-950' : index === progress ? 'border-primary-500 text-primary-300' : 'border-gray-700 text-gray-500'">{{ index < progress ? '✓' : index + 1 }}</span>
              <span class="min-w-0"><span class="block text-sm font-semibold" :class="index <= progress ? 'text-gray-100' : 'text-gray-500'">{{ step }}</span><span class="block text-xs text-gray-500">{{ stepDetail(index) }}</span></span>
            </li>
          </ol>
        </div>
        <div class="divide-y divide-gray-800 border-t border-gray-800 bg-gray-900/60">
          <div v-for="shift in SHIFTS" :key="shift" class="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
            <div class="w-28 shrink-0 text-sm font-semibold text-gray-100">{{ shiftLabel(shift) }}</div>
            <template v-if="readiness[shift]?.total">
              <div class="min-w-[12rem] flex-1">
                <p class="text-sm text-gray-300"><span class="font-semibold" :class="readiness[shift].ready === readiness[shift].total ? 'text-emerald-300' : 'text-gray-100'">{{ readiness[shift].ready }} of {{ readiness[shift].total }}</span> ready to pay</p>
                <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-800"><div class="h-full rounded-full" :class="readiness[shift].ready === readiness[shift].total ? 'bg-emerald-500' : 'bg-primary-500'" :style="{ width: `${Math.round(readiness[shift].ready / readiness[shift].total * 100)}%` }" /></div>
              </div>
              <AppButton v-if="readiness[shift].notSetUp.length && shiftAction(shift).kind !== 'setup'" size="sm" variant="outline" @click="router.push(setupLink(shift))">Set up {{ readiness[shift].notSetUp.length }} more →</AppButton>
              <div class="ml-auto flex items-center gap-3">
                <StatusBadge v-if="shiftAction(shift).status && shiftAction(shift).label !== 'Start'" :variant="shiftAction(shift).status.tone">{{ shiftAction(shift).status.label }}</StatusBadge>
                <AppButton v-if="shiftAction(shift).kind === 'open'" size="sm" @click="router.push(runLink(next.payday, shift))">{{ shiftAction(shift).label }} →</AppButton>
                <AppButton v-else-if="shiftAction(shift).kind === 'setup'" size="sm" variant="outline" @click="router.push(setupLink(shift))">{{ shiftAction(shift).label }} →</AppButton>
                <AppButton v-else size="sm" variant="secondary" disabled :title="`Attendance for these dates closes ${shortDate(next.end)}`">{{ shiftAction(shift).label }}</AppButton>
              </div>
            </template>
            <p v-else class="text-sm text-gray-500">No active employees in this shift.</p>
          </div>
        </div>
      </section>

      <section class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div class="border-b border-gray-800 px-5 py-3"><h2 class="font-semibold text-gray-100">Payroll history</h2></div>
        <p v-if="!historyPaydays.length" class="px-5 py-4 text-sm text-gray-500">Your first payroll will appear here once its attendance is uploaded.</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-left text-sm">
            <thead class="border-b border-gray-800 bg-gray-950/40 text-xs uppercase text-gray-500"><tr><th class="px-5 py-2">Payday</th><th class="px-5 py-2">Work dates</th><th v-for="shift in SHIFTS" :key="shift" class="px-5 py-2">{{ shiftLabel(shift) }}</th></tr></thead>
            <tbody class="divide-y divide-gray-800">
              <tr v-for="row in historyPaydays" :key="row.payday">
                <td class="px-5 py-3 font-medium text-gray-100">{{ formatWorkDate(row.payday) }}</td>
                <td class="px-5 py-3 text-gray-400">{{ formatWorkRange(row.period.start, row.period.end) }}</td>
                <td v-for="shift in SHIFTS" :key="shift" class="px-5 py-3"><RouterLink v-if="started(row.payday, shift)" :to="runLink(row.payday, shift)" class="inline-flex items-center gap-2 hover:underline"><StatusBadge :variant="summary(row.payday, shift).tone">{{ summary(row.payday, shift).label }}</StatusBadge></RouterLink><span v-else class="text-xs text-gray-600">—</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <details v-if="legacyRuns.length" class="rounded-xl border border-gray-800 bg-gray-950/20 p-5">
        <summary class="cursor-pointer text-sm font-semibold text-gray-300">Earlier combined-shift runs <span class="ml-2 font-normal text-gray-500">{{ legacyRuns.length }}</span></summary>
        <div class="mt-3 space-y-2"><div v-for="run in legacyRuns" :key="run.id" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 p-3 text-sm"><span class="text-gray-300">{{ formatWorkRange(run.period_start, run.period_end) }} · {{ run.status }}</span><RouterLink v-if="paydayForPeriodEnd(run.period_end)" :to="{ path: `/payroll/${paydayForPeriodEnd(run.period_end)}/day`, query: { run: run.id, step: 'review' } }" class="font-semibold text-primary-300 hover:underline">Open register</RouterLink></div></div>
      </details>
    </template>

    <AppModal :show="Boolean(starting)" title="Record pay" @close="starting = null">
      <div v-if="starting" class="space-y-5">
        <label class="block text-sm text-gray-300">Payday<select v-model="starting.payday" class="form-control mt-2"><option v-for="option in startOptions" :key="option.payday" :value="option.payday">{{ formatWorkDate(option.payday) }} · {{ option.period.cutoff === 'first' ? '15th payday' : 'month-end payday' }}</option></select></label>
        <p class="-mt-3 text-xs text-gray-500">Work dates {{ formatWorkRange(periodForPayday(starting.payday).start, periodForPayday(starting.payday).end) }}{{ periodForPayday(starting.payday).cutoff === 'second' ? ' · SSS, PhilHealth and Pag-IBIG included' : '' }}</p>
        <fieldset><legend class="text-sm text-gray-300">Shift</legend><div class="mt-2 grid gap-2 sm:grid-cols-2"><label v-for="shift in SHIFTS" :key="shift" class="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm" :class="starting.shift === shift ? 'border-primary-500 bg-primary-950/20' : 'border-gray-800'"><input v-model="starting.shift" type="radio" :value="shift" class="mt-1"><span><span class="block font-semibold text-gray-100">{{ shiftLabel(shift) }}</span><span class="block text-xs text-gray-500">{{ shift === 'day' ? '9 AM – 6 PM' : '9 PM – 6 AM' }} · {{ plural(profiles[shift].length, 'employee') }}</span></span></label></div></fieldset>
      </div>
      <template #footer><AppButton variant="secondary" @click="starting = null">Cancel</AppButton><AppButton @click="begin">Continue →</AppButton></template>
    </AppModal>
  </div>
</template>
