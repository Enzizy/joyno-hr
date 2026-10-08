<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AttendanceView from '@/views/AttendanceView.vue'
import PayrollView from '@/views/PayrollView.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { listAttendanceReviews } from '@/services/api'
import { getPayrollRuns } from '@/services/backendService'
import { payrollFinalizationEnabled } from '@/config/features'
import { payrollShift, shiftLabel } from '@/utils/payrollScope'
import { formatWorkDate, formatWorkRange } from '@/utils/payrollPeriods'
import { PAY_RUN_STAGES, attendanceForPeriod, currentStageKey, payRunStages, periodForPayday } from '@/utils/payRun'
import { useToastStore } from '@/stores/toastStore'

// One pay run = one standard payday for one shift. Payday, shift and practice mode come
// from the URL, so every stage below works on the same work dates without re-asking.
const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const period = computed(() => periodForPayday(route.params.payday))
const shift = computed(() => payrollShift(route.params.shift))
const practice = computed(() => route.query.practice === 'true')
const contextKey = computed(() => `${route.params.payday}:${shift.value}:${practice.value}`)
const reviews = ref([])
const runs = ref([])
const loading = ref(true)
const ready = ref(false)

const stages = computed(() => period.value ? payRunStages({ period: period.value, shift: shift.value, practice: practice.value,
  reviews: reviews.value, runs: runs.value, finalizationEnabled: payrollFinalizationEnabled }) : [])
const stageKeys = PAY_RUN_STAGES.map(stage => stage.key)
const step = computed(() => stageKeys.includes(route.query.step) ? route.query.step : currentStageKey(stages.value))
const paydayTitle = computed(() => period.value
  ? `${new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${period.value.payday}T12:00:00Z`))} payday` : '')
const otherShift = computed(() => shift.value === 'day' ? 'night' : 'day')
const payCalculated = computed(() => {
  const review = stages.value.find(stage => stage.key === 'review')
  return review?.state === 'done' || review?.detail === 'Draft to check'
})

const listFrom = (data, ...keys) => Array.isArray(data) ? data : keys.map(key => data?.[key]).find(Array.isArray) || []

async function load() {
  const requested = contextKey.value
  try {
    const [reviewList, runList] = await Promise.all([listAttendanceReviews(shift.value), getPayrollRuns()])
    if (requested !== contextKey.value) return
    reviews.value = reviewList || []
    runs.value = listFrom(runList, 'items', 'runs')
  } catch (error) {
    toast.error(error.message || 'Unable to load this pay run.')
  } finally {
    loading.value = false
  }
}

// Shift, practice and work dates are passed to the embedded views through the query,
// which is how they already initialise. Attendance also opens the review in progress.
function contextQuery(stepKey) {
  const query = { ...route.query, shift: shift.value, practice: String(practice.value),
    payrollMonth: period.value.month, cutoff: period.value.cutoff, step: stepKey }
  delete query.firstWorkDate
  delete query.lastWorkDate
  delete query.calculate
  const keepRequestedBatch = stepKey === route.query.step && route.query.batch
  if (stepKey === 'attendance' && !keepRequestedBatch) {
    const { confirmed, unfinished } = attendanceForPeriod(reviews.value, period.value, shift.value, practice.value)
    const batch = [confirmed, unfinished].filter(Boolean).sort((a, b) => Number(b.id) - Number(a.id))[0]
    if (batch) query.batch = String(batch.id)
    else delete query.batch
  }
  return query
}

// { calculate: true } asks Review pay to calculate as soon as it opens, so "Calculate pay" is one click.
async function goto(key, { calculate = false } = {}) {
  if (!period.value || key === route.query.step) return
  await router.replace({ query: { ...contextQuery(key), ...(calculate ? { calculate: '1' } : {}) } })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function init() {
  ready.value = false
  loading.value = true
  await load()
  if (!period.value) return
  await router.replace({ query: contextQuery(step.value) })
  ready.value = true
}

onMounted(init)
watch(contextKey, init)

function stageClass(stage) {
  return [
    step.value === stage.key ? 'border-primary-500 ring-1 ring-inset ring-primary-500' : 'border-gray-800 hover:border-gray-600',
    stage.state === 'locked' ? 'opacity-60' : '',
  ]
}
const stageDetailClass = stage => stage.state === 'done' ? 'text-emerald-300' : stage.state === 'todo' ? 'text-amber-300' : 'text-gray-500'
</script>

<template>
  <div class="space-y-6">
    <EmptyState v-if="!period" title="This is not a standard payday" description="Pay runs use the 15th or the month-end payday. Open one from the Payroll page.">
      <template #actions><RouterLink to="/payroll" class="text-sm font-semibold text-primary-300 hover:underline">Back to Payroll</RouterLink></template>
    </EmptyState>
    <template v-else>
      <p v-if="practice" class="rounded-xl border border-sky-700/40 bg-sky-950/20 px-4 py-3 text-sm text-sky-200"><strong>PRACTICE · TEST ONLY</strong> · Only the people you pick, with current salaries. Their payslips are marked as a test and go only to them.</p>
      <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
          <nav class="mb-2 text-sm text-gray-500" aria-label="Breadcrumb"><RouterLink to="/payroll" class="font-medium text-gray-400 hover:text-primary-300">Payroll</RouterLink> › {{formatWorkDate(period.payday)}} · {{shiftLabel(shift)}}</nav>
          <h1 class="text-2xl font-semibold tracking-tight text-gray-100 sm:text-[2rem]">{{paydayTitle}}</h1>
          <div class="mt-3 flex flex-wrap gap-2 text-xs text-gray-400">
            <span class="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900 px-3 py-1">{{shiftLabel(shift)}}<RouterLink :to="{ path: `/payroll/${period.payday}/${otherShift}`, query: practice ? { practice: 'true' } : {} }" class="font-semibold text-primary-300 hover:underline">Switch to {{shiftLabel(otherShift)}}</RouterLink></span>
            <span class="rounded-full border border-gray-800 bg-gray-900 px-3 py-1">Work dates {{formatWorkRange(period.start, period.end)}}</span>
            <span class="rounded-full border border-gray-800 bg-gray-900 px-3 py-1">{{period.cutoff === 'second' ? 'Month-end · SSS, PhilHealth, Pag-IBIG' : '15th payday · no contributions'}}</span>
          </div>
        </div>
      </header>

      <nav class="grid grid-cols-4 gap-2 overflow-x-auto" aria-label="Pay run stages">
        <button v-for="(stage, index) in stages" :key="stage.key" type="button" class="min-w-[7.5rem] rounded-xl border bg-gray-900 px-3 py-2.5 text-left transition-colors" :class="stageClass(stage)" :aria-current="step === stage.key ? 'step' : undefined" @click="goto(stage.key)">
          <span class="block text-[11px] text-gray-500">{{index + 1}}</span>
          <span class="block truncate text-sm font-semibold text-gray-100">{{stage.label}}</span>
          <span class="block truncate text-xs" :class="stageDetailClass(stage)">{{loading ? '…' : stage.detail}}</span>
        </button>
      </nav>

      <div v-if="!ready" class="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400" role="status">Loading pay run…</div>
      <template v-else>
        <AttendanceView v-if="step === 'attendance'" :key="contextKey" embedded :pay-calculated="payCalculated" @changed="load" @continue="options => goto('review', options)" />
        <PayrollView v-else :key="contextKey" embedded :stage="step" @changed="load" @navigate="goto" />
      </template>
    </template>
  </div>
</template>
