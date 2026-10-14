<script setup>
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import AppButton from '@/components/ui/AppButton.vue'
import { getThirteenthMonthReport } from '@/services/api'
import { downloadCsv } from '@/utils/csv'

// 13th month pay = basic pay earned in the year ÷ 12, built up on every payroll (workbook register BB/BC).
// Due on or before December 24.
const thisYear = new Date(Date.now() + 8 * 3600000).getUTCFullYear()
const years = [thisYear, thisYear - 1, thisYear - 2]
const year = ref(thisYear)
const report = ref(null)
const loading = ref(false)
const error = ref('')
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dayLabel = key => key ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`)) : ''

let requestId = 0
async function load() {
  const id = ++requestId
  loading.value = true; error.value = ''
  try { const result = await getThirteenthMonthReport(year.value); if (id === requestId) report.value = result }
  catch (e) { if (id === requestId) { report.value = null; error.value = e.message || 'Unable to load 13th month pay.' } }
  finally { if (id === requestId) loading.value = false }
}
watch(year, load, { immediate: true })

const startsLate = computed(() => report.value?.firstPayday && report.value.firstPayday > `${year.value}-01-15`)
function download() {
  downloadCsv(`13th-month-${year.value}.csv`, ['Employee ID', 'Name', 'Department', 'Payrolls', 'Basic pay earned', '13th month pay', 'From', 'To'],
    report.value.employees.map(e => [e.employeeCode, e.name, e.department, e.payrolls, e.basicEarned, e.thirteenthMonth, e.firstPayday, e.lastPayday]))
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="13th month pay" />
    <section class="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <label class="text-xs font-medium text-gray-400">Year<select v-model.number="year" class="form-control mt-1.5"><option v-for="item in years" :key="item" :value="item">{{ item }}</option></select></label>
      <AppButton variant="secondary" :disabled="!report?.employees?.length" @click="download">Download CSV</AppButton>
    </section>
    <p v-if="error" role="alert" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)">{{ error }}</p>
    <div v-if="loading && !report" class="h-28 animate-pulse rounded-xl bg-gray-800" />
    <EmptyState v-else-if="report && !report.employees.length" :title="`No finished payroll in ${year}`" description="13th month pay builds up from approved and released payroll." />
    <template v-else-if="report">
      <div class="grid gap-3 sm:grid-cols-3" :class="loading ? 'opacity-60' : ''">
        <article class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-sm text-gray-400">Built up so far</p><p class="mt-1 text-2xl font-semibold text-gray-100">{{ peso(report.total) }}</p><p class="mt-1 text-xs text-gray-500">{{ report.employees.length }} employees</p></article>
        <article class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-sm text-gray-400">Payrolls counted</p><p class="mt-1 text-lg font-semibold text-gray-100">{{ dayLabel(report.firstPayday) }} – {{ dayLabel(report.lastPayday) }}</p><p class="mt-1 text-xs text-gray-500">Approved and released only</p></article>
        <article class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-sm text-gray-400">Due</p><p class="mt-1 text-lg font-semibold text-gray-100">On or before Dec 24, {{ year }}</p><p class="mt-1 text-xs text-gray-500">Basic pay earned ÷ 12</p></article>
      </div>
      <p v-if="startsLate" class="rounded-xl border px-4 py-3 text-sm" style="color:var(--warning-text);background:var(--warning-bg);border-color:var(--warning-border)">Payroll in the system starts {{ dayLabel(report.firstPayday) }}. Add each employee's 13th month from earlier payrolls in the workbook to get the full year.</p>
      <section class="rounded-xl border border-gray-800 bg-gray-900">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[620px] text-left text-sm">
            <thead><tr class="border-b border-gray-800"><th class="table-heading">Employee</th><th class="table-heading">Department</th><th class="table-heading text-right">Payrolls</th><th class="table-heading text-right">Basic pay earned</th><th class="table-heading text-right">13th month pay</th></tr></thead>
            <tbody class="divide-y divide-gray-800">
              <tr v-for="e in report.employees" :key="e.employeeId">
                <td class="table-cell"><RouterLink :to="`/employees/${e.employeeId}`" class="font-medium text-gray-100 hover:text-primary-300 hover:underline">{{ e.name }}</RouterLink></td>
                <td class="table-cell">{{ e.department }}</td>
                <td class="table-cell text-right tabular-nums">{{ e.payrolls }}</td>
                <td class="table-cell text-right tabular-nums">{{ peso(e.basicEarned) }}</td>
                <td class="table-cell text-right font-semibold tabular-nums text-gray-100">{{ peso(e.thirteenthMonth) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
