<script setup>
import { computed, onMounted, ref } from 'vue'
import { getHrmsOperations, listAttendanceReviews } from '@/services/api'
import { getPayrollRuns } from '@/services/backendService'
import { nextPayday, payRunStages, periodForPayday, runSummary } from '@/utils/payRun'
import { runScope } from '@/utils/payrollScope'

// Home: the next payday, how far each shift has got, and only the payroll to-dos that exist.
const loading = ref(true)
const error = ref('')
const reviews = ref({ day: [], night: [] })
const runs = ref([])
const operations = ref(null)

const manilaToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const today = manilaToday()
const next = computed(() => periodForPayday(nextPayday(today)))
const longDate = key => new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))
const shortDate = key => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))
const daysAway = computed(() => Math.round((Date.parse(`${next.value.payday}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000))
const whenLabel = computed(() => daysAway.value === 0 ? 'Today' : daysAway.value === 1 ? 'Tomorrow' : `In ${daysAway.value} days`)

const shifts = computed(() => ['day', 'night'].map(shift => {
  const summary = runSummary(payRunStages({ period: next.value, shift, reviews: reviews.value[shift], runs: runs.value }))
  return { shift, label: shift === 'day' ? 'Day shift' : 'Night shift', summary, to: `/payroll/${next.value.payday}/${shift}` }
}))

// Earlier real pay runs that were approved but never released to employees.
const unreleased = computed(() => runs.value.filter(run => run.status === 'approved' && !run.rule_snapshot?.isTest &&
  String(run.payday).slice(0, 10) < next.value.payday))
const todos = computed(() => {
  const list = unreleased.value.map(run => ({ key: `run-${run.id}`, text: `${shortDate(String(run.payday).slice(0, 10))} payslips are approved but not released`,
    to: `/payroll/${String(run.payday).slice(0, 10)}/${runScope(run) === 'night' ? 'night' : 'day'}?step=payslips` }))
  const setup = Number(operations.value?.setup || 0)
  if (setup) list.push({ key: 'setup', text: `${setup} ${setup === 1 ? 'employee needs' : 'employees need'} pay setup`, to: '/employees?setup=needs' })
  return list
})

onMounted(async () => {
  try {
    const [day, night, runList, ops] = await Promise.all([listAttendanceReviews('day'), listAttendanceReviews('night'), getPayrollRuns(), getHrmsOperations().catch(() => null)])
    reviews.value = { day, night }
    runs.value = runList
    operations.value = ops
  } catch (e) { error.value = e.message || 'Unable to load payroll status.' }
  finally { loading.value = false }
})
</script>

<template>
  <section class="surface-card" aria-labelledby="payday-heading">
    <div class="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Next payday</p>
        <h2 id="payday-heading" class="mt-1 text-xl font-semibold text-gray-100">{{ longDate(next.payday) }} <span class="ml-1 rounded-full px-2 py-0.5 align-middle text-xs font-semibold" :class="daysAway <= 1 ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800 text-gray-400'">{{ whenLabel }}</span></h2>
        <p class="mt-1 text-xs text-gray-500">Work dates {{ shortDate(next.start) }} – {{ shortDate(next.end) }}</p>
      </div>
      <RouterLink to="/payroll" class="text-sm font-semibold text-primary-300 hover:text-primary-200">Open payroll →</RouterLink>
    </div>
    <p v-if="error" role="alert" class="px-5 pb-4 text-sm text-amber-300">{{ error }}</p>
    <div v-else-if="loading" class="px-5 pb-5"><div class="h-16 animate-pulse rounded-lg bg-gray-800" /></div>
    <template v-else>
      <div class="grid gap-px border-t border-gray-800 bg-gray-800 sm:grid-cols-2">
        <RouterLink v-for="item in shifts" :key="item.shift" :to="item.to" class="flex items-center justify-between gap-3 bg-gray-900 px-4 py-3 hover:bg-gray-950 sm:px-5">
          <span class="text-sm font-medium text-gray-200">{{ item.label }}</span>
          <span class="text-right text-xs font-semibold" :class="item.summary.tone === 'success' ? 'text-emerald-300' : item.summary.tone === 'warning' ? 'text-amber-300' : 'text-gray-400'">{{ item.summary.label }} ›</span>
        </RouterLink>
      </div>
      <ul v-if="todos.length" class="divide-y divide-gray-800 border-t border-gray-800">
        <li v-for="item in todos" :key="item.key"><RouterLink :to="item.to" class="flex items-center justify-between gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-950 sm:px-5"><span><span class="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />{{ item.text }}</span><span class="text-gray-600">›</span></RouterLink></li>
      </ul>
    </template>
  </section>
</template>
