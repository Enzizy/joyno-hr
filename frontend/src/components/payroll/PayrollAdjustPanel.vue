<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import { effectiveEarnings } from '@/utils/payrollEarnings'
import { ADDITION_TYPES, DEDUCTION_TYPES } from '@/utils/payrollAdjustments'

// One place to change a person's pay for this payday. Amounts that come from salary and
// attendance are shown read-only; HR adds loans, allowances and corrections as adjustments.
// Adjustments are saved as the draft's manual earnings and charges, exactly as before.
const props = defineProps({
  line: { type: Object, required: true },
  run: { type: Object, required: true },
  busy: Boolean,
})
const emit = defineEmits(['close', 'save'])

const DEDUCTIONS = Object.entries(DEDUCTION_TYPES).map(([type, label]) => ({ source: 'charge', type, label }))
// The non-taxable allowance is stored as a charge; "Other earning" as a manual earning.
const ADDITIONS = Object.entries(ADDITION_TYPES).map(([type, label]) => ({ source: type === 'other' ? 'earning' : 'charge', type, label }))
const CORRECTION = { source: 'charge', type: 'basic_pay_adjustment', label: 'Basic pay correction' }
const NIGHT = { source: 'earning', type: 'night_differential', label: 'Night differential (replaces the automatic amount)' }
// Manual lines that replace what attendance calculated. They are no longer offered, but older drafts can contain them.
const REPLACING = {
  overtime: 'Overtime (replaces overtime from attendance)',
  holiday_premium: 'Holiday premium (replaces the premium from attendance)',
  special_holiday_pay: 'Old full holiday pay — remove this line',
}
const AUTOMATIC_LABELS = { overtime: 'Overtime from attendance', holiday_premium: 'Holiday premium from attendance', night_differential: 'Night differential' }

const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const name = computed(() => props.line.employee_name || [props.line.first_name, props.line.last_name].filter(Boolean).join(' ') || 'Employee')
const paydayLabel = computed(() => {
  const day = String(props.run.payday || props.run.pay_date || '').slice(0, 10)
  return day ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`)) : ''
})

let nextKey = 0
const isDeduction = item => item.source === 'charge' && DEDUCTIONS.some(entry => entry.type === item.type)
function labelFor(item) {
  if (item.source === 'earning') return REPLACING[item.type] || (item.type === 'night_differential' ? NIGHT.label : 'Other earning')
  return [...DEDUCTIONS, ...ADDITIONS, CORRECTION].find(entry => entry.type === item.type)?.label || item.type
}
const initialEarnings = Array.isArray(props.line.details?.manualEarnings) ? props.line.details.manualEarnings : []
const initialCharges = Array.isArray(props.line.details?.charges) ? props.line.details.charges : Array.isArray(props.line.charges) ? props.line.charges : []
const items = ref([
  ...initialEarnings.map(entry => ({ ...entry, source: 'earning', key: ++nextKey, amount: Number(entry.amount) })),
  ...initialCharges.map(entry => ({ ...entry, source: 'charge', key: ++nextKey, amount: Math.abs(Number(entry.amount)),
    ...(entry.type === 'basic_pay_adjustment' ? { direction: Number(entry.amount) < 0 ? 'deduct' : 'add' } : {}) })),
])
const signedAmount = item => (Number(item.amount) || 0) * (isDeduction(item) || item.direction === 'deduct' ? -1 : 1)

// From salary and attendance (read-only).
const details = computed(() => props.line.details || {})
const manualTypes = computed(() => new Set(items.value.filter(item => item.source === 'earning').map(item => item.type)))
const baseRows = computed(() => {
  const line = props.line
  const rows = [{ label: `Basic pay (half of ${money(line.monthly_basic_salary)})`, amount: Number(line.gross_salary || 0) }]
  const cola = Number(line.cola_pay ?? line.colaPay ?? details.value.colaPay ?? 0)
  if (cola) rows.push({ label: 'COLA', amount: cola })
  for (const entry of details.value.automaticEarnings || []) {
    if (!Number(entry.amount)) continue
    rows.push({ label: AUTOMATIC_LABELS[entry.type] || entry.note || entry.type, amount: Number(entry.amount), replaced: manualTypes.value.has(entry.type) })
  }
  if (Number(line.absence_deduction)) rows.push({ label: 'Absences', amount: -Number(line.absence_deduction) })
  const lateUndertime = Number(line.late_deduction || 0) + Number(line.undertime_deduction || 0)
  if (lateUndertime) rows.push({ label: 'Late and undertime', amount: -lateUndertime })
  const contributions = Number(line.employee_sss || 0) + Number(line.employee_philhealth || 0) + Number(line.employee_pagibig || 0)
  if (contributions) rows.push({ label: 'SSS · PhilHealth · Pag-IBIG', amount: -contributions })
  return rows
})

// Net pay preview: the saved net pay, moved by the change in adjustments. SSS is rechecked on save.
const earningsTotal = list => effectiveEarnings({ ...details.value, manualEarnings: list }).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
const chargesTotal = list => list.reduce((sum, entry) => sum + signedAmount(entry), 0)
const toEarnings = list => list.filter(item => item.source === 'earning')
const toCharges = list => list.filter(item => item.source === 'charge')
const original = items.value.map(item => ({ ...item }))
const netAfter = computed(() => Number(props.line.net_pay || 0)
  + earningsTotal(toEarnings(items.value)) - earningsTotal(toEarnings(original))
  + chargesTotal(toCharges(items.value)) - chargesTotal(toCharges(original)))
const changed = computed(() => JSON.stringify(items.value.map(({ key, ...rest }) => rest)) !== JSON.stringify(original.map(({ key, ...rest }) => rest)))
const sssMayChange = computed(() => props.run.cutoff === 'second' && props.run.include_contributions &&
  items.value.some(item => ['basic_pay_adjustment', 'night_differential', 'overtime'].includes(item.type)))

// The + Add menu.
const showNight = computed(() => Boolean(details.value.nightDifferential && (Number(details.value.nightDifferential.paidMinutes) > 0 || details.value.nightDifferential.reviewRequired)))
const earningCount = computed(() => toEarnings(items.value).length)
const chargeCount = computed(() => toCharges(items.value).length)
const menuGroups = computed(() => [
  { title: 'Take from pay', options: DEDUCTIONS },
  { title: 'Add to pay', options: ADDITIONS },
  { title: 'Correct basic pay', options: [CORRECTION] },
  ...(showNight.value && !manualTypes.value.has('night_differential') ? [{ title: 'Night shift', options: [NIGHT] }] : []),
])
const full = option => option.source === 'earning' ? earningCount.value >= 6 : chargeCount.value >= 20
const menuOpen = ref(false)
const menuRoot = ref(null)
const closeMenu = event => { if (!menuRoot.value?.contains(event.target)) menuOpen.value = false }
const onKey = event => { if (event.key === 'Escape') { if (menuOpen.value) menuOpen.value = false; else emit('close') } }
onMounted(() => { document.addEventListener('click', closeMenu); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('click', closeMenu); document.removeEventListener('keydown', onKey) })
function add(option) {
  menuOpen.value = false
  if (full(option)) return
  items.value.push({ source: option.source, type: option.type, amount: '', note: '', key: ++nextKey,
    ...(option.type === 'basic_pay_adjustment' ? { direction: 'add' } : {}) })
}
function remove(item) { items.value = items.value.filter(entry => entry !== item) }

const hasLegacy = computed(() => items.value.some(item => item.type === 'special_holiday_pay'))
const invalid = computed(() => items.value.some(item => item.type === 'night_differential' ? !(Number(item.amount) >= 0) || item.amount === '' : !(Number(item.amount) > 0)))
function save() {
  if (invalid.value || hasLegacy.value) return
  const strip = ({ key, source, direction, ...rest }) => rest
  emit('save', {
    earnings: toEarnings(items.value).map(item => ({ ...strip(item), amount: Number(item.amount) })),
    charges: toCharges(items.value).map(item => ({ ...strip(item), amount: signedAmount(item) })),
    earningsChanged: JSON.stringify(toEarnings(items.value).map(strip)) !== JSON.stringify(toEarnings(original).map(strip)),
    chargesChanged: JSON.stringify(toCharges(items.value).map(item => ({ ...strip(item), amount: signedAmount(item) }))) !== JSON.stringify(toCharges(original).map(item => ({ ...strip(item), amount: signedAmount(item) }))),
  })
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" :aria-label="`Adjust pay for ${name}`" @click.self="emit('close')">
    <div class="flex h-full w-full max-w-xl flex-col border-l border-gray-700 bg-gray-900 shadow-2xl">
      <header class="flex items-start justify-between gap-3 border-b border-gray-800 px-5 py-4">
        <div class="min-w-0"><h2 class="truncate text-lg font-semibold text-gray-100">{{ name }}</h2><p class="text-sm text-gray-400">Adjust pay · {{ paydayLabel }} payday</p></div>
        <button type="button" class="rounded-md px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close" @click="emit('close')">✕</button>
      </header>

      <div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <div class="flex items-baseline justify-between gap-3"><h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">From salary and attendance</h3><span class="text-xs text-gray-500">Change these in Attendance</span></div>
          <dl class="mt-2 divide-y divide-gray-800 rounded-lg border border-gray-800">
            <div v-for="row in baseRows" :key="row.label" class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <dt class="text-gray-300"><span :class="row.replaced ? 'text-gray-500 line-through' : ''">{{ row.label }}</span><span v-if="row.replaced" class="ml-1 text-xs text-amber-300">replaced below</span></dt>
              <dd class="whitespace-nowrap font-medium" :class="row.replaced ? 'text-gray-500 line-through' : row.amount < 0 ? 'text-red-300' : 'text-gray-100'">{{ row.amount < 0 ? '−' : '' }}{{ money(Math.abs(row.amount)) }}</dd>
            </div>
          </dl>
        </section>

        <section>
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Adjustments for this payday</h3>
            <div ref="menuRoot" class="relative">
              <AppButton size="sm" :aria-expanded="menuOpen" aria-haspopup="menu" @click="menuOpen = !menuOpen">+ Add</AppButton>
              <div v-if="menuOpen" class="absolute right-0 z-10 mt-1 max-h-[60vh] w-72 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl" role="menu">
                <template v-for="group in menuGroups" :key="group.title">
                  <p class="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ group.title }}</p>
                  <button v-for="option in group.options" :key="option.type" type="button" role="menuitem" :disabled="full(option)" class="block w-full px-4 py-1.5 text-left text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-40" @click="add(option)">{{ option.label }}</button>
                </template>
              </div>
            </div>
          </div>
          <p v-if="!items.length" class="mt-2 rounded-lg border border-dashed border-gray-700 px-3 py-4 text-sm text-gray-500">No adjustments. Use <span class="font-semibold text-gray-300">+ Add</span> for loans, allowances or corrections.</p>
          <ul v-else class="mt-2 space-y-2">
            <li v-for="item in items" :key="item.key" class="rounded-lg border p-3" :class="item.type === 'special_holiday_pay' ? 'border-amber-700/60 bg-amber-950/20' : 'border-gray-800 bg-gray-950/40'">
              <div class="flex items-start justify-between gap-2">
                <p class="text-sm font-semibold" :class="item.type === 'special_holiday_pay' ? 'text-amber-200' : signedAmount(item) < 0 ? 'text-red-200' : 'text-emerald-200'">{{ labelFor(item) }}</p>
                <button type="button" class="-mr-1 -mt-1 rounded-md px-2 py-1 text-gray-500 hover:bg-red-950/30 hover:text-red-300" :aria-label="`Remove ${labelFor(item)}`" @click="remove(item)">✕</button>
              </div>
              <div class="mt-2 grid gap-2 sm:grid-cols-[auto_150px_1fr] sm:items-center">
                <div v-if="item.type === 'basic_pay_adjustment'" class="grid grid-cols-2 overflow-hidden rounded-lg border border-gray-700 text-xs" role="group" aria-label="Effect">
                  <button v-for="option in [{ value: 'add', label: 'Add to pay' }, { value: 'deduct', label: 'Deduct' }]" :key="option.value" type="button" class="px-2 py-2 font-semibold" :class="item.direction === option.value ? (option.value === 'add' ? 'bg-emerald-900/60 text-emerald-200' : 'bg-red-950/60 text-red-200') : 'text-gray-400 hover:bg-gray-800'" :aria-pressed="item.direction === option.value" @click="item.direction = option.value">{{ option.label }}</button>
                </div>
                <span v-else class="hidden w-6 text-center text-lg font-semibold sm:block" :class="signedAmount(item) < 0 || isDeduction(item) ? 'text-red-300' : 'text-emerald-300'" aria-hidden="true">{{ isDeduction(item) ? '−' : '+' }}</span>
                <label class="relative block"><span class="sr-only">Amount</span><span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₱</span><input v-model.number="item.amount" type="number" :min="item.type === 'night_differential' ? 0 : 0.01" step="0.01" placeholder="0.00" class="form-control pl-7" :readonly="item.type === 'holiday_premium' && item.approvedHours != null"></label>
                <label class="block"><span class="sr-only">Note</span><input v-model="item.note" type="text" maxlength="200" class="form-control" :placeholder="item.type === 'other_non_taxable_earning' ? 'What it\'s for, e.g. Transport allowance' : 'Note on the payslip (optional)'"></label>
              </div>
            </li>
          </ul>
          <p v-if="hasLegacy" class="mt-2 text-xs text-amber-200">Remove the old full-holiday-pay line before saving. Record holiday work in Attendance instead.</p>
        </section>
      </div>

      <footer class="border-t border-gray-800 bg-gray-950/60 px-5 py-4">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-sm text-gray-400">Net pay</span>
          <span class="text-right"><span v-if="changed" class="mr-2 text-sm text-gray-500 line-through">{{ money(line.net_pay) }}</span><span class="text-xl font-semibold text-emerald-300">{{ changed ? '≈ ' : '' }}{{ money(changed ? netAfter : line.net_pay) }}</span></span>
        </div>
        <p v-if="changed && sssMayChange" class="mt-1 text-right text-xs text-gray-500">SSS is rechecked when you save and may move one bracket.</p>
        <p v-if="invalid" class="mt-2 text-xs text-amber-300">Enter an amount on each adjustment, or remove it.</p>
        <div class="mt-3 flex justify-end gap-2"><AppButton variant="secondary" @click="emit('close')">Cancel</AppButton><AppButton :loading="busy" :disabled="!changed || invalid || hasLegacy" @click="save">Save</AppButton></div>
      </footer>
    </div>
  </div>
</template>
