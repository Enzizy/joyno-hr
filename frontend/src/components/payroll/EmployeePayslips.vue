<script setup>
import { computed, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { getPayrollPayslipPdf } from '@/services/api'
import { useToastStore } from '@/stores/toastStore'

// An employee's own payslips: the chosen payslip broken down like the printed one,
// this year's totals, and every earlier payslip.
const props = defineProps({ lines: { type: Array, default: () => [] } })
const emit = defineEmits(['view'])
const toast = useToastStore()

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const signed = (value) => `${value < 0 ? '−' : ''}${money(Math.abs(value))}`
const day = (value, options = { month: 'short', day: 'numeric', year: 'numeric' }) => value
  ? new Intl.DateTimeFormat('en-PH', { ...options, timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`)) : ''
const sorted = computed(() => [...props.lines].sort((a, b) => String(b.payday).localeCompare(String(a.payday)) || Number(b.id) - Number(a.id)))
const selectedId = ref(null)
watch(sorted, (list) => { if (!list.some((line) => line.id === selectedId.value)) selectedId.value = list[0]?.id ?? null }, { immediate: true })
const selected = computed(() => sorted.value.find((line) => line.id === selectedId.value) || null)
// Older and newer payslips, newest first.
const selectedIndex = computed(() => sorted.value.findIndex((line) => line.id === selectedId.value))
const older = computed(() => sorted.value[selectedIndex.value + 1] || null)
const newer = computed(() => selectedIndex.value > 0 ? sorted.value[selectedIndex.value - 1] : null)
const card = ref(null)
function pick(id) {
  selectedId.value = id
  card.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
const byYear = computed(() => {
  const groups = new Map()
  for (const line of sorted.value) {
    const year = String(line.payday).slice(0, 4)
    groups.set(year, [...(groups.get(year) || []), line])
  }
  return [...groups.entries()].map(([year, lines]) => ({ year, lines }))
})

const earnings = computed(() => {
  const s = selected.value?.payslip
  if (!s) return []
  return [{ name: 'Basic salary', amount: s.basic }, ...s.less.filter((row) => row.amount).map((row) => ({ ...row, amount: -row.amount })),
    ...s.additions.filter((row) => row.amount)]
})
const deductions = computed(() => (selected.value?.payslip?.deductions || []).filter((row) => row.amount))
const attendanceNote = computed(() => {
  const line = selected.value
  if (!line) return ''
  const parts = [`${Number(line.absence_days || 0) + Number(line.unpaid_leave_days || 0)} absent`, `${Number(line.paid_leave_days || 0)} paid leave`,
    `${Number(line.late_minutes || 0) + Number(line.undertime_minutes || 0)} min late / undertime`]
  const overtime = line.payslip?.additions?.find((row) => row.name === 'Overtime')?.unit
  if (overtime) parts.push(`${overtime} overtime`)
  return parts.join(' · ')
})

// The calendar year of the payslip being viewed, from the payday dates.
const yearTotals = computed(() => {
  const year = String(selected.value?.payday || sorted.value[0]?.payday || '').slice(0, 4)
  const lines = sorted.value.filter((line) => String(line.payday).startsWith(year))
  const sum = (field) => lines.reduce((total, line) => total + Number(line[field] || 0), 0)
  return { year, count: lines.length, includesTest: lines.some((line) => line.is_test), net: sum('net_pay'), thirteenth: sum('thirteenth_month_accrual'),
    contributions: sum('employee_sss') + sum('employee_philhealth') + sum('employee_pagibig') }
})

const saving = ref(false)
async function save(line) {
  saving.value = true
  try {
    const url = URL.createObjectURL(await getPayrollPayslipPdf(null, line.id))
    const link = document.createElement('a')
    link.href = url
    link.download = `${line.is_test ? 'TEST-' : ''}payslip-${String(line.payday).slice(0, 10)}.pdf`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (error) { toast.error(error.message || 'Unable to save the payslip.') }
  finally { saving.value = false }
}
</script>

<template>
  <EmptyState v-if="!sorted.length" title="No payslips yet" description="Your payslips appear here once HR closes a payroll and sends them." />
  <div v-else class="space-y-6">
    <section v-if="selected" ref="card" class="scroll-mt-24 overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      <div class="flex flex-wrap items-start justify-between gap-4 border-b border-gray-800 p-5">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ selected.id === sorted[0].id ? 'Latest payslip' : 'Payslip' }} · {{ day(selected.payday) }} payday
            <span v-if="selected.is_test" class="ml-2 rounded-full border border-sky-700/60 px-2 py-0.5 normal-case tracking-normal text-sky-300">Test — not an actual payment</span></p>
          <p class="mt-2 text-4xl font-semibold text-emerald-300">{{ money(selected.net_pay) }}</p>
          <p class="mt-1 text-sm text-gray-400">Net pay · work dates {{ day(selected.period_start, { month: 'short', day: 'numeric' }) }} – {{ day(selected.period_end) }}<template v-if="selected.paid_on"> · paid {{ day(selected.paid_on) }}</template></p>
        </div>
        <div class="flex flex-wrap gap-2"><AppButton @click="emit('view', selected)">View payslip</AppButton><AppButton variant="secondary" :loading="saving" @click="save(selected)">Save PDF</AppButton></div>
      </div>
      <div v-if="sorted.length > 1" class="flex flex-wrap items-center gap-2 border-b border-gray-800 px-5 py-2.5 text-sm">
        <button type="button" class="rounded-md px-2 py-1 font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-40" :disabled="!older" @click="selectedId = older.id">‹ Older</button>
        <label class="flex items-center gap-2 text-gray-500">Payday
          <select v-model="selectedId" class="form-control py-1 text-sm">
            <optgroup v-for="group in byYear" :key="group.year" :label="group.year">
              <option v-for="line in group.lines" :key="line.id" :value="line.id">{{ day(line.payday, { month: 'short', day: 'numeric' }) }}{{ line.is_test ? ' (test)' : '' }} · {{ money(line.net_pay) }}</option>
            </optgroup>
          </select>
        </label>
        <button type="button" class="rounded-md px-2 py-1 font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-40" :disabled="!newer" @click="selectedId = newer.id">Newer ›</button>
        <span class="ml-auto text-xs text-gray-500">{{ selectedIndex + 1 }} of {{ sorted.length }} payslips</span>
      </div>
      <div class="grid gap-px bg-gray-800 md:grid-cols-2">
        <div class="bg-gray-900 p-5">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Earnings</h3>
          <dl class="mt-3 space-y-2 text-sm">
            <div v-for="row in earnings" :key="row.name" class="flex justify-between gap-3"><dt class="text-gray-300">{{ row.name }}<span v-if="row.unit" class="text-gray-500"> · {{ row.unit }}</span><span v-if="row.note" class="block text-xs text-gray-500">{{ row.note }}</span></dt><dd class="whitespace-nowrap" :class="row.amount < 0 ? 'text-red-300' : 'text-gray-100'">{{ signed(row.amount) }}</dd></div>
          </dl>
          <div class="mt-3 flex justify-between border-t border-gray-800 pt-3 text-sm font-semibold text-gray-100"><span>Gross pay</span><span>{{ money(selected.payslip.gross) }}</span></div>
        </div>
        <div class="bg-gray-900 p-5">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Deductions</h3>
          <dl class="mt-3 space-y-2 text-sm">
            <div v-for="row in deductions" :key="row.name" class="flex justify-between gap-3"><dt class="text-gray-300">{{ row.name }}<span v-if="row.note" class="block text-xs text-gray-500">{{ row.note }}</span></dt><dd class="whitespace-nowrap text-red-300">−{{ money(row.amount) }}</dd></div>
            <p v-if="!deductions.length" class="text-gray-500">None</p>
          </dl>
          <div class="mt-3 flex justify-between border-t border-gray-800 pt-3 text-sm font-semibold text-gray-100"><span>Total deductions</span><span>−{{ money(selected.payslip.totalDeduction) }}</span></div>
          <div class="mt-4 flex justify-between rounded-lg bg-emerald-950/40 px-3 py-2.5 text-base font-semibold text-emerald-200"><span>Net pay</span><span>{{ money(selected.net_pay) }}</span></div>
        </div>
      </div>
      <p class="border-t border-gray-800 px-5 py-3 text-xs text-gray-500">This cutoff: {{ attendanceNote }}. Questions about these figures? Contact HR.</p>
    </section>

    <section class="grid gap-3 sm:grid-cols-3" :aria-label="`${yearTotals.year} so far`">
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-xs text-gray-500">Net pay in {{ yearTotals.year }}</p><p class="mt-1 text-xl font-semibold text-gray-100">{{ money(yearTotals.net) }}</p><p class="text-xs text-gray-500">{{ yearTotals.count }} {{ yearTotals.count === 1 ? 'payslip' : 'payslips' }}</p></div>
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-xs text-gray-500">13th-month pay earned so far</p><p class="mt-1 text-xl font-semibold text-gray-100">{{ money(yearTotals.thirteenth) }}</p><p class="text-xs text-gray-500">Paid on or before December 24</p></div>
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-xs text-gray-500">SSS, PhilHealth and Pag-IBIG paid</p><p class="mt-1 text-xl font-semibold text-gray-100">{{ money(yearTotals.contributions) }}</p><p class="text-xs text-gray-500">Your share, {{ yearTotals.year }}</p></div>
      <p v-if="yearTotals.includesTest" class="text-xs text-sky-300 sm:col-span-3">These totals include test payslips, which were not actually paid.</p>
    </section>

    <section class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      <div class="flex items-baseline justify-between border-b border-gray-800 px-5 py-3"><h3 class="font-semibold text-gray-100">All payslips</h3><span class="text-xs text-gray-500">Kept permanently · {{ sorted.length }} so far</span></div>
      <template v-for="group in byYear" :key="group.year">
      <p class="bg-gray-950/40 px-5 py-1.5 text-xs font-semibold text-gray-500">{{ group.year }}</p>
      <ul class="divide-y divide-gray-800">
        <li v-for="line in group.lines" :key="line.id">
          <button type="button" class="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gray-800/40" :class="line.id === selectedId ? 'bg-primary-950/20' : ''" :aria-current="line.id === selectedId ? 'true' : undefined" @click="pick(line.id)">
            <span><span class="block text-sm font-medium" :class="line.id === selectedId ? 'text-primary-200' : 'text-gray-100'">{{ day(line.payday) }} payday<span v-if="line.is_test" class="ml-2 text-xs text-sky-300">Test</span><span v-if="line.id === selectedId" class="ml-2 text-xs font-normal text-gray-500">· showing above</span></span><span class="block text-xs text-gray-500">Work dates {{ day(line.period_start, { month: 'short', day: 'numeric' }) }} – {{ day(line.period_end) }}</span></span>
            <span class="text-right"><span class="block text-sm font-semibold text-emerald-300">{{ money(line.net_pay) }}</span><span class="block text-xs text-gray-500">gross {{ money(line.payslip?.gross) }}</span></span>
          </button>
        </li>
      </ul>
      </template>
    </section>
  </div>
</template>
