<script setup>
import { computed, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import { getPayrollProfileHistory, updateEmployee, updatePayrollProfile } from '@/services/api'
import { useToastStore } from '@/stores/toastStore'

// Schedule & pay for one employee. Shift and working hours sit together so they cannot disagree;
// saving updates the employee's shift (if changed) and their pay setup in one go.
const props = defineProps({
  employee: { type: Object, required: true },
  profile: { type: Object, default: null },
})
const emit = defineEmits(['saved'])
const toast = useToastStore()

const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// SSS, PhilHealth and Pag-IBIG decide month-end contributions; withholding tax is deducted only when TIN is ticked.
const contributionOptions = [{ key: 'sss', label: 'SSS' }, { key: 'philhealth', label: 'PhilHealth' }, { key: 'pagibig', label: 'Pag-IBIG' }, { key: 'tin', label: 'TIN' }]
const contributionSettings = p => ({ sss: p?.contribution_settings?.sss ?? true, philhealth: p?.contribution_settings?.philhealth ?? true, pagibig: p?.contribution_settings?.pagibig ?? true, tin: p?.contribution_settings?.tin ?? true })
const contributionSummary = p => contributionOptions.filter(option => contributionSettings(p)[option.key]).map(option => option.label).join(', ') || 'All IDs pending'
const defaultHours = shift => shift === 'night' ? { start: '21:00', end: '06:00' } : { start: '09:00', end: '18:00' }

const form = ref({})
const history = ref([])
const busy = ref(false)
const error = ref('')
function reset() {
  const p = props.profile
  const shift = String(props.employee.shift || 'day').toLowerCase() === 'night' ? 'night' : 'day'
  const hours = defaultHours(shift)
  form.value = {
    shift,
    monthlyBasicSalary: p?.monthly_basic_salary ?? '',
    monthlyCola: p?.monthly_cola ?? 0,
    biometricPersonId: p?.biometric_person_id || '',
    workStartTime: String(p?.work_start_time || hours.start).slice(0, 5),
    workEndTime: String(p?.work_end_time || hours.end).slice(0, 5),
    workdays: [...(p?.workdays || [1, 2, 3, 4, 5])],
    contributionSettings: contributionSettings(p),
    minimumWageEarner: Boolean(p?.minimum_wage_earner),
    taxShield: Number(p?.tax_shield ?? 0),
  }
  error.value = ''
}
async function loadHistory() {
  try { history.value = await getPayrollProfileHistory(props.employee.id) } catch { history.value = [] }
}
watch(() => [props.employee?.id, props.profile], () => { reset(); loadHistory() }, { immediate: true })

const clock = t => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + m }
const timeLabel = m => { m %= 1440; const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}` }
const overnight = computed(() => form.value.workEndTime < form.value.workStartTime)
// Same rule as the server: 4 to 8 paid hours; an 8-hour day keeps the one-hour unpaid lunch (1–2 PM, or 1–2 AM overnight).
const schedule = computed(() => {
  const start = clock(form.value.workStartTime); let end = clock(form.value.workEndTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return null
  if (end < start) end += 1440
  let lunch = end > 1440 ? 60 : 780
  if (end > 1440 && lunch < start) lunch += 1440
  const lunchMinutes = Math.max(0, Math.min(end, lunch + 60) - Math.max(start, lunch)), paid = end - start - lunchMinutes
  return { hours: Math.round(paid / 6) / 10, lunch: lunchMinutes > 0 ? `unpaid lunch ${timeLabel(lunch)}–${timeLabel(lunch + 60)}` : 'no unpaid lunch',
    problem: paid < 240 || paid > 480 ? 'Use a schedule with 4 to 8 paid hours.' : paid === 480 && lunchMinutes !== 60 ? 'An 8-hour day needs its one-hour unpaid lunch inside the shift.' : '' }
})
// Picking a shift suggests its usual hours when the current hours belong to the other shift.
function chooseShift(shift) {
  form.value.shift = shift
  if ((shift === 'night') !== overnight.value) { const hours = defaultHours(shift); form.value.workStartTime = hours.start; form.value.workEndTime = hours.end }
}
const shiftMismatch = computed(() => (form.value.shift === 'night') !== overnight.value)
const ready = computed(() => Number(props.profile?.monthly_basic_salary) >= 1000 && props.profile?.biometric_person_id && props.profile?.work_start_time)

async function save() {
  busy.value = true; error.value = ''
  try {
    const e = props.employee
    if (form.value.shift !== String(e.shift || 'day').toLowerCase()) {
      await updateEmployee(e.id, { employee_code: e.employee_code, first_name: e.first_name, last_name: e.last_name, department: e.department, position: e.position,
        shift: form.value.shift, date_hired: e.date_hired?.slice(0, 10) || '', last_working_date: e.last_working_date?.slice(0, 10) || '', status: e.status })
    }
    const { shift, ...pay } = form.value
    // Payroll always uses the newest saved setup; the save date is kept in the history.
    await updatePayrollProfile(e.id, { ...pay, effectiveFrom: today, unpaidBreakMinutes: 60, dailyRateDivisor: 261 })
    toast.success('Schedule & pay saved')
    emit('saved')
  } catch (e) { error.value = e.message || 'Unable to save schedule & pay.' }
  finally { busy.value = false }
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="save">
    <p v-if="error" role="alert" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)">{{ error }}</p>
    <p class="inline-flex items-center gap-1.5 text-xs font-semibold" :style="{ color: ready ? 'var(--success-text)' : 'var(--warning-text)' }"><span class="h-1.5 w-1.5 rounded-full bg-current" />{{ ready ? 'Ready for payroll' : 'Not ready for payroll yet: save a salary, Attendance ID and hours' }}</p>

    <section>
      <h3 class="mb-3 text-sm font-semibold text-gray-100">Shift and hours</h3>
      <div class="flex gap-2" role="group" aria-label="Shift">
        <button v-for="option in ['day', 'night']" :key="option" type="button" class="rounded-lg border px-4 py-2 text-sm font-semibold" :class="form.shift === option ? 'border-primary-500 bg-primary-500 text-gray-950' : 'border-gray-700 text-gray-300 hover:border-gray-500'" :aria-pressed="form.shift === option" @click="chooseShift(option)">{{ option === 'day' ? 'Day shift' : 'Night shift' }}</button>
      </div>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label class="text-xs font-medium text-gray-400">Work starts<input v-model="form.workStartTime" type="time" required class="form-control mt-1.5"></label>
        <label class="text-xs font-medium text-gray-400">Work ends{{ overnight ? ' · next day' : '' }}<input v-model="form.workEndTime" type="time" required class="form-control mt-1.5"></label>
        <fieldset class="sm:col-span-2"><legend class="text-xs font-medium text-gray-400">Workdays</legend><div class="mt-2 flex flex-wrap gap-2"><label v-for="(day, index) in days" :key="day" class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-800 px-2.5 py-2 text-sm"><input v-model="form.workdays" type="checkbox" :value="index">{{ day }}</label></div></fieldset>
      </div>
      <p v-if="schedule" class="mt-3 text-xs text-gray-500">{{ schedule.hours }} paid hours · {{ schedule.lunch }}</p>
      <div v-if="shiftMismatch || schedule?.problem" class="mt-3 rounded-lg border p-3 text-sm" style="color:var(--warning-text);background:var(--warning-bg);border-color:var(--warning-border)">
        <p v-if="shiftMismatch">{{ overnight ? 'These hours run overnight' : 'These are daytime hours' }} for a {{ form.shift }}-shift employee. Check the shift or the hours.</p>
        <p v-if="schedule?.problem" role="alert" class="font-medium">{{ schedule.problem }}</p>
      </div>
    </section>

    <section class="border-t border-gray-800 pt-5">
      <h3 class="mb-3 text-sm font-semibold text-gray-100">Pay and attendance ID</h3>
      <div class="grid gap-4 sm:grid-cols-3">
        <label class="text-xs font-medium text-gray-400">Monthly basic salary<input v-model.number="form.monthlyBasicSalary" type="number" min="0.01" step="0.01" required class="form-control mt-1.5"></label>
        <label class="text-xs font-medium text-gray-400">Monthly COLA<input v-model.number="form.monthlyCola" type="number" min="0" step="0.01" class="form-control mt-1.5"></label>
        <label class="text-xs font-medium text-gray-400">Biometric Attendance ID<input v-model="form.biometricPersonId" class="form-control mt-1.5" maxlength="80" placeholder="Keep leading zeroes"></label>
      </div>
    </section>

    <fieldset class="border-t border-gray-800 pt-5">
      <legend class="float-left mb-1 w-full text-sm font-semibold text-gray-100">Government IDs</legend>
      <p id="contribution-help" class="clear-both mb-3 text-xs text-gray-500">Tick each ID that is ready. A pending SSS, PhilHealth or Pag-IBIG ID is left out of month-end contributions. A pending TIN means no withholding tax.</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label v-for="option in contributionOptions" :key="option.key" class="flex cursor-pointer items-start gap-3 rounded-lg border p-3" :style="{ borderColor: form.contributionSettings?.[option.key] ? 'var(--success-border)' : 'var(--warning-border)', background: form.contributionSettings?.[option.key] ? 'var(--success-bg)' : 'var(--warning-bg)' }">
          <input v-model="form.contributionSettings[option.key]" type="checkbox" class="mt-1" :aria-label="`${option.label} ID ready`" aria-describedby="contribution-help">
          <span><span class="block text-sm font-semibold text-gray-100">{{ option.label }}</span><span class="mt-1 block text-xs" :style="{ color: form.contributionSettings?.[option.key] ? 'var(--success-text)' : 'var(--warning-text)' }">{{ form.contributionSettings?.[option.key] ? 'ID ready' : 'ID pending' }}</span></span>
        </label>
      </div>
    </fieldset>

    <section class="border-t border-gray-800 pt-5">
      <h3 class="text-sm font-semibold text-gray-100">Withholding tax</h3>
      <p id="tax-help" class="mb-3 mt-1 text-xs text-gray-500">Worked out every payday from the <RouterLink to="/settings/tax" class="underline hover:text-gray-300">BIR tax table</RouterLink>, like the workbook. {{ form.contributionSettings?.tin ? '' : 'No tax while the TIN is pending.' }}</p>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-800 p-3">
          <input v-model="form.minimumWageEarner" type="checkbox" class="mt-1" aria-describedby="tax-help">
          <span><span class="block text-sm font-semibold text-gray-100">Minimum wage earner</span><span class="mt-1 block text-xs text-gray-500">No withholding tax</span></span>
        </label>
        <label class="text-xs font-medium text-gray-400">Tax shield per payday<input v-model.number="form.taxShield" type="number" min="0" step="0.01" class="form-control mt-1.5" :disabled="form.minimumWageEarner" aria-describedby="tax-shield-help"><span id="tax-shield-help" class="mt-1 block font-normal text-gray-500">Taken off taxable pay. Usually 0.</span></label>
      </div>
    </section>

    <div class="flex justify-end gap-2 border-t border-gray-800 pt-4">
      <AppButton type="button" variant="outline" :disabled="busy" @click="reset">Undo changes</AppButton>
      <AppButton type="submit" :loading="busy" :disabled="!!schedule?.problem">Save schedule & pay</AppButton>
    </div>

    <details class="border-t border-gray-800 pt-4">
      <summary class="cursor-pointer text-sm font-semibold text-gray-300">Schedule & pay history <span class="ml-1 text-xs font-normal text-gray-500">{{ history.length }} records</span></summary>
      <div class="mt-3 overflow-auto">
        <table v-if="history.length" class="w-full text-left text-sm">
          <thead><tr><th class="table-heading">Saved</th><th class="table-heading">Monthly basic</th><th class="table-heading">COLA</th><th class="table-heading">Hours</th><th class="table-heading">Contributions</th></tr></thead>
          <tbody><tr v-for="p in history" :key="p.id" class="border-t border-gray-800"><td class="table-cell whitespace-nowrap">{{ p.effective_from }}{{ p.effective_to ? ` – ${p.effective_to}` : ' · current' }}</td><td class="table-cell">{{ Number(p.monthly_basic_salary).toFixed(2) }}</td><td class="table-cell">{{ Number(p.monthly_cola).toFixed(2) }}</td><td class="table-cell whitespace-nowrap">{{ timeLabel(clock(p.work_start_time)) }} – {{ timeLabel(clock(p.work_end_time)) }}</td><td class="table-cell">{{ contributionSummary(p) }}</td></tr></tbody>
        </table>
        <p v-else class="text-sm text-gray-500">Nothing saved yet.</p>
      </div>
    </details>
  </form>
</template>
