<script setup>
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import AppButton from '@/components/ui/AppButton.vue'
import { getSilConversionReport } from '@/services/api'
import { downloadCsv } from '@/utils/csv'

// Unused Service Incentive Leave paid as cash together with the 13th month pay.
// Cash = SIL days left × the employee's actual daily pay.
const thisYear = new Date(Date.now() + 8 * 3600000).getUTCFullYear()
const year = ref(thisYear)
// Eligibility is checked on the day the 13th month is released (Dec 24 at the latest).
const releaseDate = ref(`${thisYear}-12-24`)
const show = ref('all')
const search = ref('')
const report = ref(null)
const loading = ref(false)
const error = ref('')
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const days = value => `${Number(value)} ${Number(value) === 1 ? 'day' : 'days'}`

let requestId = 0
async function load() {
  const id = ++requestId
  loading.value = true; error.value = ''
  try { const result = await getSilConversionReport(year.value, releaseDate.value || undefined); if (id === requestId) report.value = result }
  catch (e) { if (id === requestId) { report.value = null; error.value = e.message || 'Unable to load SIL conversion.' } }
  finally { if (id === requestId) loading.value = false }
}
watch(year, value => { releaseDate.value = `${value}-12-24` })
watch([year, releaseDate], load, { immediate: true })

const sil = computed(() => report.value?.types?.[0] || { name: 'Service Incentive Leave', days: 5, minMonths: 12 })
const rows = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (report.value?.employees || []).filter(row => (show.value === 'all' || (show.value === 'cash' ? row.cash > 0 : !row.eligible)) &&
    (!query || `${row.name} ${row.employeeCode}`.toLowerCase().includes(query)))
})
const counts = computed(() => {
  const list = report.value?.employees || []
  return { cash: list.filter(row => row.cash > 0).length, notYet: list.filter(row => !row.eligible).length }
})
const used = row => row.leave.reduce((sum, item) => sum + item.used, 0)
function download() {
  downloadCsv(`sil-conversion-${year.value}.csv`, ['Employee ID', 'Name', 'Department', 'Date hired', 'Eligible', 'SIL used', 'SIL days left', 'Daily rate', 'Cash value'],
    rows.value.map(row => [row.employeeCode, row.name, row.department, row.dateHired, row.eligible ? 'Yes' : 'Not yet', used(row), row.daysLeft, row.dailyRate, row.cash]))
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="SIL cash conversion" />
    <section class="grid gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] sm:items-end">
      <label class="text-xs font-medium text-gray-400">Year<select v-model.number="year" class="form-control mt-1.5"><option v-for="item in [thisYear, thisYear - 1]" :key="item" :value="item">{{ item }}</option></select></label>
      <label class="text-xs font-medium text-gray-400">13th month release date<input v-model="releaseDate" type="date" :min="`${year}-01-01`" :max="`${year}-12-24`" class="form-control mt-1.5"></label>
      <label class="text-xs font-medium text-gray-400">Search<input v-model="search" type="search" class="form-control mt-1.5" placeholder="Name or employee ID"></label>
      <div class="flex gap-1" role="group" aria-label="Show">
        <button v-for="item in [{ key: 'all', label: 'Everyone' }, { key: 'cash', label: `Getting cash (${counts.cash})` }, { key: 'notyet', label: `Not yet eligible (${counts.notYet})` }]" :key="item.key" type="button" class="rounded-lg px-3 py-2 text-xs font-semibold" :class="show === item.key ? 'bg-primary-500 text-gray-950' : 'bg-gray-800 text-gray-400 hover:text-gray-200'" :aria-pressed="show === item.key" @click="show = item.key">{{ item.label }}</button>
      </div>
      <AppButton variant="secondary" :disabled="!rows.length" @click="download">Download CSV</AppButton>
    </section>
    <p v-if="error" role="alert" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)">{{ error }}</p>
    <div v-if="loading && !report" class="h-28 animate-pulse rounded-xl bg-gray-800" />
    <EmptyState v-else-if="report && !report.employees.length" title="No employees" description="Active employees appear here." />
    <template v-else-if="report">
      <div class="grid gap-3 sm:grid-cols-3" :class="loading ? 'opacity-60' : ''">
        <article class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-sm text-gray-400">Total to convert</p><p class="mt-1 text-2xl font-semibold text-gray-100">{{ peso(report.total) }}</p><p class="mt-1 text-xs text-gray-500">{{ counts.cash }} employees</p></article>
        <article class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-sm text-gray-400">Paid</p><p class="mt-1 text-lg font-semibold text-gray-100">With the 13th month pay</p><p class="mt-1 text-xs text-gray-500">Released {{ new Date(`${report.payout}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) }} · <RouterLink to="/reports/13th-month" class="text-primary-300 hover:underline">13th month pay →</RouterLink></p></article>
        <article class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-sm text-gray-400">Rule</p><p class="mt-1 text-lg font-semibold text-gray-100">{{ sil.days }} days a year</p><p class="mt-1 text-xs text-gray-500">Needs {{ sil.minMonths }} months of service on the release date; reaching it later means next year · unused days × daily pay</p></article>
      </div>
      <section class="rounded-xl border border-gray-800 bg-gray-900">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-left text-sm">
            <thead><tr class="border-b border-gray-800"><th class="table-heading">Employee</th><th class="table-heading text-right">SIL used</th><th class="table-heading text-right">SIL left</th><th class="table-heading text-right">Daily pay</th><th class="table-heading text-right">Cash value</th></tr></thead>
            <tbody class="divide-y divide-gray-800">
              <tr v-for="row in rows" :key="row.employeeId">
                <td class="table-cell"><RouterLink :to="{ path: `/employees/${row.employeeId}`, query: { section: 'leave' } }" class="font-medium text-gray-100 hover:text-primary-300 hover:underline">{{ row.name }}</RouterLink><span class="block text-xs text-gray-500">{{ row.department }}</span></td>
                <td class="table-cell text-right tabular-nums">{{ row.eligible ? days(used(row)) : '' }}</td>
                <td class="table-cell text-right tabular-nums"><span v-if="row.eligible" :class="row.daysLeft ? 'font-semibold text-gray-100' : 'text-gray-500'">{{ days(row.daysLeft) }}</span><span v-else class="text-xs text-gray-500">Not yet eligible</span></td>
                <td class="table-cell text-right tabular-nums">{{ row.dailyRate == null ? 'No salary set' : peso(row.dailyRate) }}</td>
                <td class="table-cell text-right font-semibold tabular-nums" :class="row.cash ? 'text-gray-100' : 'text-gray-500'">{{ row.cash ? peso(row.cash) : '—' }}</td>
              </tr>
              <tr v-if="!rows.length"><td colspan="5" class="table-cell py-8 text-center text-gray-500">No employees match.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="border-t border-gray-800 px-5 py-3 text-xs text-gray-500">Days left are this year's SIL less SIL taken as paid leave. Daily pay is the salary's daily rate; a shorter schedule uses its share of it.</p>
      </section>
    </template>
  </div>
</template>
