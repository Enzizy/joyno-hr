<script setup>
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import MoreMenu from '@/components/ui/MoreMenu.vue'
import { getRemittanceReport } from '@/services/api'
import { downloadCsv } from '@/utils/csv'

// What to remit for a month: SSS, PhilHealth and Pag-IBIG per employee, and the BIR 1601-C figures.
// Built from approved and released payroll paid in that month.
const now = new Date(Date.now() + 8 * 3600000)
const month = ref(now.toISOString().slice(0, 7))
const report = ref(null)
const loading = ref(false)
const error = ref('')
const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const monthLabel = computed(() => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month.value}-01T00:00:00Z`)))
const dayLabel = key => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))

let requestId = 0
async function load() {
  if (!/^\d{4}-\d{2}$/.test(month.value)) return
  const id = ++requestId
  loading.value = true; error.value = ''
  try { const result = await getRemittanceReport(month.value); if (id === requestId) report.value = result }
  catch (e) { if (id === requestId) { report.value = null; error.value = e.message || 'Unable to load remittances.' } }
  finally { if (id === requestId) loading.value = false }
}
watch(month, load, { immediate: true })

const totals = computed(() => report.value?.totals || {})
const agencies = computed(() => [
  { key: 'sss', name: 'SSS', total: totals.value.sssEmployee + totals.value.sssEmployer + totals.value.ec, parts: `Employee ${peso(totals.value.sssEmployee)} · Employer ${peso(totals.value.sssEmployer)} · EC ${peso(totals.value.ec)}` },
  { key: 'philhealth', name: 'PhilHealth', total: totals.value.philhealthEmployee + totals.value.philhealthEmployer, parts: `Employee ${peso(totals.value.philhealthEmployee)} · Employer ${peso(totals.value.philhealthEmployer)}` },
  { key: 'pagibig', name: 'Pag-IBIG', total: totals.value.pagibigEmployee + totals.value.pagibigEmployer, parts: `Employee ${peso(totals.value.pagibigEmployee)} · Employer ${peso(totals.value.pagibigEmployer)}` },
  { key: 'bir', name: 'BIR withholding tax', total: totals.value.tax, parts: 'Form 1601-C' },
])
const bir = computed(() => {
  const b = report.value?.bir1601c || {}
  return [
    ['Total amount of compensation', b.totalCompensation],
    ['Statutory minimum wage (MWE)', b.mweCompensation],
    ['13th month pay and other benefits', b.thirteenthMonthAndOtherBenefits],
    ['De minimis benefits', b.deMinimis],
    ['SSS, PhilHealth, Pag-IBIG employee shares', b.contributions],
    ['Other non-taxable compensation (COLA, allowances, tax shield)', b.otherNonTaxable],
    ['Taxable compensation', b.taxableCompensation, true],
    ['Tax withheld', b.taxWithheld, true],
  ]
})

const LISTS = {
  sss: { label: 'SSS list', headers: ['Employee ID', 'Name', 'Employee share', 'Employer share', 'EC', 'Total'], row: e => [e.employeeCode, e.name, e.sssEmployee, e.sssEmployer, e.ec, +(e.sssEmployee + e.sssEmployer + e.ec).toFixed(2)] },
  philhealth: { label: 'PhilHealth list', headers: ['Employee ID', 'Name', 'Employee share', 'Employer share', 'Total'], row: e => [e.employeeCode, e.name, e.philhealthEmployee, e.philhealthEmployer, +(e.philhealthEmployee + e.philhealthEmployer).toFixed(2)] },
  pagibig: { label: 'Pag-IBIG list', headers: ['Employee ID', 'Name', 'Employee share', 'Employer share', 'Total'], row: e => [e.employeeCode, e.name, e.pagibigEmployee, e.pagibigEmployer, +(e.pagibigEmployee + e.pagibigEmployer).toFixed(2)] },
  bir: { label: 'Withholding tax list', headers: ['Employee ID', 'Name', 'Gross compensation', 'Non-taxable', 'Taxable compensation', 'Tax withheld', 'TIN on file', 'Minimum wage'], row: e => [e.employeeCode, e.name, e.gross, +(e.gross - e.taxable).toFixed(2), e.taxable, e.tax, e.tin ? 'Yes' : 'No', e.minimumWageEarner ? 'Yes' : 'No'] },
}
const downloads = computed(() => Object.entries(LISTS).map(([key, list]) => ({ label: `${list.label} (CSV)`, disabled: !report.value?.employees?.length,
  onSelect: () => downloadCsv(`${key}-remittance-${month.value}.csv`, list.headers, report.value.employees.map(list.row)) })))
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Government remittances" />
    <section class="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <label class="text-xs font-medium text-gray-400">Month paid<input v-model="month" type="month" class="form-control mt-1.5"></label>
      <MoreMenu label="Download" :items="downloads" />
    </section>
    <p v-if="error" role="alert" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)">{{ error }}</p>
    <div v-if="loading && !report" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div v-for="item in 4" :key="item" class="h-28 animate-pulse rounded-xl bg-gray-800" /></div>
    <EmptyState v-else-if="report && !report.employees.length" :title="`No finished payroll in ${monthLabel}`" description="Approved or released pay runs paid in this month appear here." />
    <template v-else-if="report">
      <p class="text-sm text-gray-400">{{ monthLabel }} · paydays {{ report.paydays.map(p => `${dayLabel(p.payday)}${p.status === 'approved' ? ' (approved, not released)' : ''}`).join(', ') }} · {{ report.employees.length }} employees</p>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" :class="loading ? 'opacity-60' : ''">
        <article v-for="agency in agencies" :key="agency.key" class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p class="text-sm text-gray-400">{{ agency.name }}</p>
          <p class="mt-1 text-2xl font-semibold text-gray-100">{{ peso(agency.total) }}</p>
          <p class="mt-1 text-xs text-gray-500">{{ agency.parts }}</p>
        </article>
      </div>
      <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="font-semibold text-gray-100">BIR 1601-C</h2>
        <p class="mt-1 text-xs text-gray-500">Figures for the monthly remittance return. Check them against the form before filing.</p>
        <dl class="mt-4 grid gap-x-8 text-sm sm:grid-cols-2">
          <div v-for="[label, value, strong] in bir" :key="label" class="flex items-baseline justify-between gap-3 border-b border-gray-800 py-2"><dt :class="strong ? 'font-semibold text-gray-100' : 'text-gray-400'">{{ label }}</dt><dd class="whitespace-nowrap tabular-nums" :class="strong ? 'font-semibold text-gray-100' : 'text-gray-300'">{{ peso(value) }}</dd></div>
        </dl>
      </section>
      <div>
        <section class="min-w-0 rounded-xl border border-gray-800 bg-gray-900">
          <h2 class="border-b border-gray-800 px-5 py-4 font-semibold text-gray-100">By employee</h2>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[720px] text-left text-sm">
              <thead><tr class="border-b border-gray-800"><th class="table-heading">Employee</th><th class="table-heading text-right">SSS</th><th class="table-heading text-right">PhilHealth</th><th class="table-heading text-right">Pag-IBIG</th><th class="table-heading text-right">Taxable</th><th class="table-heading text-right">Tax</th></tr></thead>
              <tbody class="divide-y divide-gray-800">
                <tr v-for="e in report.employees" :key="e.employeeId">
                  <td class="table-cell"><RouterLink :to="`/employees/${e.employeeId}`" class="font-medium text-gray-100 hover:text-primary-300 hover:underline">{{ e.name }}</RouterLink><span v-if="e.minimumWageEarner" class="ml-2 text-xs text-gray-500">MWE</span><span v-if="!e.tin" class="ml-2 text-xs text-amber-300">No TIN</span></td>
                  <td class="table-cell text-right tabular-nums">{{ peso(e.sssEmployee + e.sssEmployer + e.ec) }}</td>
                  <td class="table-cell text-right tabular-nums">{{ peso(e.philhealthEmployee + e.philhealthEmployer) }}</td>
                  <td class="table-cell text-right tabular-nums">{{ peso(e.pagibigEmployee + e.pagibigEmployer) }}</td>
                  <td class="table-cell text-right tabular-nums">{{ peso(e.taxable) }}</td>
                  <td class="table-cell text-right tabular-nums">{{ peso(e.tax) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="border-t border-gray-800 px-5 py-3 text-xs text-gray-500">Employee and employer shares together. Download a list for each agency's breakdown.</p>
        </section>
      </div>
    </template>
  </div>
</template>
