<script setup>
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppConfirmModal from '@/components/ui/AppConfirmModal.vue'
import SettingsWorkspaceNav from '@/components/settings/SettingsWorkspaceNav.vue'
import { deleteTaxTable, listTaxTables, saveTaxTable } from '@/services/api'
import { useToastStore } from '@/stores/toastStore'
import { tableFor, withholdingTax } from '@/utils/withholdingTax'

// The BIR tables payroll uses, by start date. When a new law changes the rates, HR adds the new table
// with its start date; each payday uses the newest table that started on or before it.
const toast = useToastStore()
const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const peso = (value, digits = 0) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`
const dateLabel = date => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

const tables = ref([])
const loading = ref(true)
const loadError = ref('')
const selectedDate = ref('')
async function load(select) {
  loading.value = true; loadError.value = ''
  try {
    tables.value = await listTaxTables()
    selectedDate.value = select || tableFor(tables.value, today)?.effectiveFrom || tables.value[0]?.effectiveFrom || ''
  } catch (e) { loadError.value = e.message || 'Unable to load the tax tables.' }
  finally { loading.value = false }
}
onMounted(() => load())

const currentDate = computed(() => tableFor(tables.value, today)?.effectiveFrom)
const selected = computed(() => tables.value.find(table => table.effectiveFrom === selectedDate.value) || null)
const status = table => table.effectiveFrom === currentDate.value ? 'In use now' : table.effectiveFrom > today ? 'Starts later' : 'Past rates'
const rowsFor = table => table.rows.map((row, index) => ({
  range: index === 0 ? `${peso(row.upTo)} and below` : row.upTo == null ? `${peso(row.over)} and above` : `${peso(row.over)} – ${peso(row.upTo)}`,
  tax: !Number(row.rate) ? `${peso(row.base, 2)}` : `${Number(row.base) ? `${peso(row.base, 2)} + ` : ''}${+(row.rate * 100).toFixed(2)}% of the amount over ${peso(row.over)}`,
}))

// Editing: a copy of a table as text fields, with rates in percent.
const draft = ref(null)
const saving = ref(false)
const formError = ref('')
function startEdit(table, asNew) {
  formError.value = ''
  draft.value = { isNew: asNew, effectiveFrom: asNew ? '' : table.effectiveFrom, note: asNew ? '' : table.note,
    rows: table.rows.map(row => ({ upTo: row.upTo ?? '', base: row.base, rate: +(row.rate * 100).toFixed(2), over: row.over })) }
}
function addRow() {
  const rows = draft.value.rows
  rows.splice(rows.length - 1, 0, { upTo: '', base: 0, rate: 0, over: rows[rows.length - 2]?.upTo === '' ? 0 : Number(rows[rows.length - 2]?.upTo || 0) + 1 })
}
const removeRow = index => draft.value.rows.splice(index, 1)
async function save() {
  formError.value = ''
  if (!draft.value.effectiveFrom) { formError.value = 'Choose the date the rates start.'; return }
  saving.value = true
  try {
    const rows = draft.value.rows.map((row, index) => ({ upTo: index === draft.value.rows.length - 1 ? null : row.upTo,
      base: row.base === '' ? 0 : row.base, over: row.over === '' ? 0 : row.over, rate: Math.round(Number(row.rate) * 100) / 10000 }))
    const saved = await saveTaxTable(draft.value.effectiveFrom, { rows, note: draft.value.note })
    toast.success(`Tax rates from ${dateLabel(saved.effectiveFrom)} saved`)
    draft.value = null
    await load(saved.effectiveFrom)
  } catch (e) { formError.value = e.message || 'Unable to save the tax table.' }
  finally { saving.value = false }
}

const removing = ref(false)
const confirmRemove = ref(false)
async function remove() {
  removing.value = true
  try {
    await deleteTaxTable(selected.value.effectiveFrom)
    toast.success('Tax rates removed')
    confirmRemove.value = false
    await load()
  } catch (e) { toast.error(e.message || 'Unable to remove the tax rates.') }
  finally { removing.value = false }
}

const taxable = ref('')
const checked = computed(() => taxable.value === '' || !Number.isFinite(Number(taxable.value)) || !selected.value ? null : withholdingTax(taxable.value, selected.value.rows))
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Withholding tax" />
    <SettingsWorkspaceNav />
    <p v-if="loadError" role="alert" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)">{{ loadError }}</p>
    <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section class="min-w-0 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <p v-if="loading" class="text-sm text-gray-500">Loading tax tables…</p>

        <form v-else-if="draft" class="space-y-4" @submit.prevent="save">
          <div>
            <h2 class="font-semibold text-gray-100">{{ draft.isNew ? 'New tax rates' : `Edit rates from ${dateLabel(draft.effectiveFrom)}` }}</h2>
            <p class="mt-1 text-sm text-gray-400">Copy each row from the BIR semi-monthly table. Paydays from the start date on use these rates.</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="text-xs font-medium text-gray-400">Rates start on<input v-model="draft.effectiveFrom" type="date" required :disabled="!draft.isNew" class="form-control mt-1.5"></label>
            <label class="text-xs font-medium text-gray-400">Source (optional)<input v-model="draft.note" maxlength="300" class="form-control mt-1.5" placeholder="e.g. RA 12345, BIR RR 1-2027"></label>
          </div>
          <div class="relative overflow-x-auto">
            <table class="w-full min-w-[560px] text-left text-sm">
              <thead><tr class="border-b border-gray-800"><th class="table-heading">Taxable pay up to</th><th class="table-heading">Fixed tax</th><th class="table-heading">Plus rate</th><th class="table-heading">Of the amount over</th><th class="table-heading"><span class="sr-only">Remove</span></th></tr></thead>
              <tbody>
                <tr v-for="(row, index) in draft.rows" :key="index" class="border-b border-gray-800 last:border-0">
                  <td class="py-2 pr-2"><input v-if="index < draft.rows.length - 1" v-model.number="row.upTo" type="number" min="0" step="0.01" required class="form-control" :aria-label="`Row ${index + 1} up to`"><span v-else class="text-gray-500">and above</span></td>
                  <td class="py-2 pr-2"><input v-model.number="row.base" type="number" min="0" step="0.01" class="form-control" :aria-label="`Row ${index + 1} fixed tax`"></td>
                  <td class="py-2 pr-2"><label class="relative block"><input v-model.number="row.rate" type="number" min="0" max="100" step="0.01" class="form-control pr-7" :aria-label="`Row ${index + 1} rate percent`"><span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span></label></td>
                  <td class="py-2 pr-2"><input v-model.number="row.over" type="number" min="0" step="0.01" class="form-control" :aria-label="`Row ${index + 1} amount over`"></td>
                  <td class="py-2 text-right"><button v-if="index > 0 && index < draft.rows.length - 1 && draft.rows.length > 2" type="button" class="rounded-md px-2 py-1 text-gray-500 hover:bg-red-950/30 hover:text-red-300" :aria-label="`Remove row ${index + 1}`" @click="removeRow(index)">✕</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <button v-if="draft.rows.length < 12" type="button" class="text-sm font-semibold text-primary-300 hover:underline" @click="addRow">+ Add a row</button>
          <p v-if="formError" role="alert" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)">{{ formError }}</p>
          <div class="flex justify-end gap-2 border-t border-gray-800 pt-4"><AppButton type="button" variant="secondary" :disabled="saving" @click="draft = null">Cancel</AppButton><AppButton type="submit" :loading="saving">Save rates</AppButton></div>
        </form>

        <template v-else-if="selected">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold text-gray-100">BIR semi-monthly table</h2>
              <p class="mt-1 text-sm text-gray-400">From {{ dateLabel(selected.effectiveFrom) }} · {{ status(selected) }}<span v-if="selected.note"> · {{ selected.note }}</span></p>
            </div>
            <div class="flex flex-wrap gap-2">
              <AppButton v-if="!selected.inUse" size="sm" variant="outline" @click="startEdit(selected, false)">Edit</AppButton>
              <AppButton v-if="!selected.inUse && !selected.earliest" size="sm" variant="outline" @click="confirmRemove = true">Remove</AppButton>
              <AppButton size="sm" @click="startEdit(tableFor(tables, today) || selected, true)">Add new rates</AppButton>
            </div>
          </div>
          <div v-if="tables.length > 1" class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Tax tables by start date">
            <button v-for="table in tables" :key="table.effectiveFrom" type="button" class="rounded-lg px-3 py-1.5 text-xs font-semibold" :class="table.effectiveFrom === selectedDate ? 'bg-primary-500 text-gray-950' : 'bg-gray-800 text-gray-400 hover:text-gray-200'" :aria-pressed="table.effectiveFrom === selectedDate" @click="selectedDate = table.effectiveFrom">From {{ dateLabel(table.effectiveFrom) }} · {{ status(table) }}</button>
          </div>
          <div class="mt-4 overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead><tr class="border-b border-gray-800"><th class="table-heading">Taxable pay per payday</th><th class="table-heading">Withholding tax</th></tr></thead>
              <tbody><tr v-for="row in rowsFor(selected)" :key="row.range" class="border-b border-gray-800 last:border-0"><td class="table-cell whitespace-nowrap tabular-nums">{{ row.range }}</td><td class="table-cell tabular-nums">{{ row.tax }}</td></tr></tbody>
            </table>
          </div>
          <p v-if="selected.inUse" class="mt-3 text-xs text-gray-500">Approved payroll used these rates, so they're kept as they are. For new rates, use Add new rates with the date they start.</p>
        </template>
      </section>

      <div class="space-y-5">
        <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 class="font-semibold text-gray-100">Taxable pay</h2>
          <p class="mt-2 text-sm leading-6 text-gray-400">Gross pay for the payday, less:</p>
          <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-400">
            <li>the employee's SSS, PhilHealth and Pag-IBIG</li>
            <li>COLA and non-taxable allowances</li>
            <li>the tax shield on the employee's pay setup</li>
          </ul>
          <p class="mt-3 text-sm leading-6 text-gray-400">No tax for a minimum wage earner or while the TIN is pending. Tax you enter in Adjust pay replaces the computed amount.</p>
        </section>
        <section v-if="selected && !draft" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 class="font-semibold text-gray-100">Check an amount</h2>
          <label class="mt-3 block text-xs font-medium text-gray-400">Taxable pay<input v-model="taxable" type="number" min="0" step="0.01" class="form-control mt-1.5" placeholder="e.g. 11000"></label>
          <p class="mt-3 text-sm text-gray-400" aria-live="polite">Withholding tax <strong class="ml-1 text-lg text-gray-100">{{ checked === null ? '—' : peso(checked, 2) }}</strong></p>
          <p v-if="tables.length > 1" class="mt-1 text-xs text-gray-500">With the rates from {{ dateLabel(selected.effectiveFrom) }}</p>
        </section>
      </div>
    </div>
    <AppConfirmModal :show="confirmRemove" title="Remove these tax rates?" :message="selected ? `Paydays from ${dateLabel(selected.effectiveFrom)} will use the rates before them. Drafts already calculated need Recalculate pay.` : ''" confirm-text="Remove rates" :loading="removing" @close="confirmRemove = false" @confirm="remove" />
  </div>
</template>
