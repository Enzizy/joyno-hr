<script setup>
import { computed } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'

const props = defineProps({
  line: { type: Object, required: true },
  run: { type: Object, required: true },
  canEmail: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
defineEmits(['close', 'print', 'download', 'send', 'edit', 'edit-charges'])

const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
const earnings = computed(() => Array.isArray(props.line.details?.manualEarnings) ? props.line.details.manualEarnings : [])
const charges = computed(() => Array.isArray(props.line.charges) ? props.line.charges : Array.isArray(props.line.details?.charges) ? props.line.details.charges : [])
const colaPay = computed(() => Number(props.line.cola_pay ?? props.line.colaPay ?? props.line.details?.colaPay ?? props.line.details?.cola_pay ?? 0))
const chargeLabel = (type) => ({
  sss_salary_loan: 'SSS salary loan', sss_calamity_loan: 'SSS calamity loan',
  pagibig_mpl: 'Pag-IBIG MPL', pagibig_calamity: 'Pag-IBIG calamity loan',
  pagibig_mp2: 'Pag-IBIG MP2', cash_advance: 'Cash advance', other_charge: 'Other charge',
  tax_withholding: 'HR-approved tax withholding',
  other_non_taxable_earning: 'Other non-taxable earning', basic_pay_adjustment: 'Basic pay adjustment',
})[type] || 'Payroll charge'
const isChargeEarning = (entry) => entry.type === 'other_non_taxable_earning' || (entry.type === 'basic_pay_adjustment' && Number(entry.amount) > 0)
const chargeEarnings = computed(() => charges.value.filter(isChargeEarning))
const chargeDeductions = computed(() => charges.value.filter((entry) => !isChargeEarning(entry)))
const totalEarnings = computed(() => Number(props.line.gross_salary || 0) + colaPay.value + earnings.value.reduce((sum, entry) => sum + Number(entry.amount || 0), 0) + chargeEarnings.value.reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0))
const deductions = computed(() => [
  ['Absence / unpaid leave', props.line.absence_deduction, ''],
  [`Late${props.line.late_minutes ? ` (${Number(props.line.late_minutes)} min)` : ''}`, props.line.late_deduction, ''],
  [`Undertime${props.line.undertime_minutes ? ` (${Number(props.line.undertime_minutes)} min)` : ''}`, props.line.undertime_deduction, ''],
  ['SSS contribution', props.line.employee_sss, ''],
  ['PhilHealth contribution', props.line.employee_philhealth, ''],
  ['Pag-IBIG contribution', props.line.employee_pagibig, ''],
  ...chargeDeductions.value.map((entry) => [chargeLabel(entry.type), Math.abs(Number(entry.amount || 0)), entry.note || '']),
])
const totalDeductions = computed(() => deductions.value.reduce((sum, [, value]) => sum + Number(value || 0), 0))
const earningLabel = (type) => ({ overtime: 'Approved overtime', night_differential: 'HR-approved night differential', special_holiday_pay: 'Legacy full holiday pay - review', holiday_premium: 'WSH/RD premium (30%)', other: 'Other earnings' })[type] || 'Other earnings'
const period = computed(() => `${String(props.run.period_start || '').slice(0, 10)} to ${String(props.run.period_end || '').slice(0, 10)}`)
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Payslip preview" @click.self="$emit('close')">
    <div class="w-full max-w-[540px]">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
        <div><p class="text-sm font-semibold">Payslip preview</p><p class="text-xs text-gray-300">{{ run.status === 'draft' ? 'Draft only - not for distribution' : 'Approved employee copy' }}</p></div>
        <button type="button" class="rounded-md px-3 py-2 text-sm hover:bg-white/10" aria-label="Close payslip" @click="$emit('close')">Close</button>
      </div>
      <article class="relative overflow-hidden border border-gray-300 bg-white p-6 text-gray-900 shadow-2xl sm:p-8">
        <div class="-mx-6 -mt-6 bg-sky-600 px-6 py-4 text-center text-white sm:-mx-8 sm:-mt-8"><p class="text-base font-extrabold tracking-wide">JOYNO SOLUTIONS LTD.</p><p class="text-[10px] font-semibold uppercase tracking-[0.3em]">Payslip</p></div>
        <div v-if="run.status === 'draft'" class="pointer-events-none absolute inset-0 flex items-center justify-center -rotate-[20deg] text-7xl font-black text-red-500/10">DRAFT</div>
        <dl class="mt-6 grid grid-cols-[110px_1fr] gap-y-1 text-xs"><dt class="font-bold">Employee no.</dt><dd>{{ line.employee_code }}</dd><dt class="font-bold">Name</dt><dd class="font-semibold">{{ line.employee_name }}</dd><dt class="font-bold">Period</dt><dd>{{ period }}</dd><dt class="font-bold">Pay date</dt><dd>{{ String(run.payday || '').slice(0, 10) }}</dd></dl>
        <section class="mt-6 border-t border-gray-300 pt-4">
          <h3 class="text-xs font-extrabold uppercase tracking-widest text-sky-700">Earnings</h3>
          <div class="mt-3 flex justify-between text-xs"><span>Semi-monthly basic salary</span><span class="tabular-nums">{{ money(line.gross_salary) }}</span></div>
          <div v-if="colaPay" class="mt-2 flex justify-between text-xs"><span>COLA (non-taxable)</span><span class="tabular-nums">{{ money(colaPay) }}</span></div>
          <div v-for="(earning, index) in earnings" :key="`manual-${index}`" class="mt-2 flex justify-between gap-4 text-xs"><span>{{ earningLabel(earning.type) }} · {{ earning.note }}</span><span class="shrink-0 tabular-nums">{{ money(earning.amount) }}</span></div>
          <div v-for="(charge, index) in chargeEarnings" :key="`charge-earning-${index}`" class="mt-2 flex justify-between gap-4 text-xs"><span>{{ chargeLabel(charge.type) }}{{ charge.type === 'other_non_taxable_earning' ? ' (non-taxable)' : '' }} · {{ charge.note || '-' }}</span><span class="shrink-0 tabular-nums">{{ money(Math.abs(Number(charge.amount || 0))) }}</span></div>
          <div class="mt-4 flex justify-between border-t border-gray-300 pt-2 text-xs font-bold"><span>Total earnings</span><span class="tabular-nums">{{ money(totalEarnings) }}</span></div>
        </section>
        <section class="mt-6 border-t border-gray-300 pt-4">
          <h3 class="text-xs font-extrabold uppercase tracking-widest text-sky-700">Deductions</h3>
          <div v-for="([label, value, note], index) in deductions" :key="`${label}-${index}`" class="mt-2 flex justify-between gap-4 text-xs"><span>{{ label }}<span v-if="note" class="text-gray-500"> · {{ note }}</span></span><span class="shrink-0 tabular-nums">{{ money(value) }}</span></div>
          <div class="mt-4 flex justify-between border-t border-gray-300 pt-2 text-xs font-bold"><span>Total deductions</span><span class="tabular-nums">{{ money(totalDeductions) }}</span></div>
        </section>
        <div class="mt-6 flex justify-between rounded-md bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-800"><span>NET PAY</span><span class="tabular-nums">{{ money(line.net_pay) }}</span></div>
        <p class="mt-6 text-center text-[10px] text-gray-500">Travel fare is paid separately. 13th-month accrual is not part of this payout.</p>
      </article>
      <div class="mt-3 flex flex-wrap gap-2"><AppButton size="sm" variant="secondary" :disabled="busy" @click="$emit('print')">Open / print PDF</AppButton><AppButton size="sm" variant="secondary" :disabled="busy" @click="$emit('download')">Save PDF</AppButton><AppButton v-if="canEdit" size="sm" variant="secondary" :disabled="busy" @click="$emit('edit')">Edit earnings</AppButton><AppButton v-if="canEdit" size="sm" variant="secondary" :disabled="busy" @click="$emit('edit-charges')">Edit charges</AppButton><AppButton v-if="canEmail" size="sm" :loading="busy" @click="$emit('send')">Email employee</AppButton></div>
    </div>
  </div>
</template>
