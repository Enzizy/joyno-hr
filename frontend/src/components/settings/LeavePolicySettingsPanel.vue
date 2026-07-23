<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  getLeavePolicySettings,
  getLeaveTypes,
  updateLeavePolicySettings,
  updateLeaveType,
} from '@/services/backendService'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'

const toast = useToastStore()
const loading = ref(true)
const saving = ref(false)
const policies = ref([])
const settings = ref({
  probationary_months: 6,
  probationary_leave_type_id: 'leave_of_absence',
  availability_warning_threshold: 2,
})
const errors = ref({})

const probationaryOptions = computed(() => policies.value.filter((policy) => Number(policy.paid_days_per_year || 0) === 0))

function validate() {
  const nextErrors = {}
  if (Number(settings.value.probationary_months) < 0) nextErrors.probationary_months = 'Cannot be negative.'
  if (Number(settings.value.availability_warning_threshold) < 1) nextErrors.availability_warning_threshold = 'Use at least 1 employee.'
  for (const policy of policies.value) {
    if (Number(policy.paid_days_per_year) < 0) nextErrors[`${policy.id}-paid`] = 'Cannot be negative.'
    if (Number(policy.min_months_employed) < 0) nextErrors[`${policy.id}-months`] = 'Cannot be negative.'
    if (Number(policy.filing_notice_days) < 0) nextErrors[`${policy.id}-notice`] = 'Cannot be negative.'
  }
  errors.value = nextErrors
  return !Object.keys(nextErrors).length
}

async function load() {
  loading.value = true
  try {
    const types = await getLeaveTypes()
    policies.value = types.map((type) => ({ ...type }))
    try {
      settings.value = { ...settings.value, ...(await getLeavePolicySettings()) }
    } catch {
      // Older deployments do not expose policy settings yet; defaults remain visible.
    }
  } catch (error) {
    toast.error(error.message || 'Unable to load leave policies.')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!validate()) return
  saving.value = true
  try {
    await Promise.all(policies.value.map((policy) => updateLeaveType(policy.id, {
      paid_days_per_year: Number(policy.paid_days_per_year || 0),
      min_months_employed: Number(policy.min_months_employed || 0),
      filing_notice_days: Number(policy.filing_notice_days || 0),
      requires_attachment_for_paid: Boolean(policy.requires_attachment_for_paid),
      remarks: policy.remarks || '',
    })))
    settings.value = await updateLeavePolicySettings({
      probationary_months: Number(settings.value.probationary_months),
      probationary_leave_type_id: settings.value.probationary_leave_type_id,
      availability_warning_threshold: Number(settings.value.availability_warning_threshold),
    })
    toast.success('Leave policies updated.')
  } catch (error) {
    toast.error(error.message || 'Unable to save leave policies.')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="space-y-5">
    <div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div class="mb-5">
        <h2 class="text-base font-semibold text-primary-200">Eligibility and staffing safeguards</h2>
        <p class="mt-1 text-sm text-gray-400">These settings affect new leave requests and approval warnings.</p>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-200" for="probationary-months">Probationary service period</label>
          <div class="relative"><input id="probationary-months" v-model.number="settings.probationary_months" type="number" min="0" class="form-control pr-20" /><span class="pointer-events-none absolute right-3 top-2.5 text-xs text-gray-500">months</span></div>
          <p v-if="errors.probationary_months" class="mt-1 text-xs text-red-400">{{ errors.probationary_months }}</p>
          <p class="mt-1 text-xs text-gray-500">Employees below this tenure use the fallback leave type.</p>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-200" for="probationary-type">Probationary fallback type</label>
          <select id="probationary-type" v-model="settings.probationary_leave_type_id" class="form-control">
            <option v-for="policy in probationaryOptions" :key="policy.id" :value="policy.id">{{ policy.name }}</option>
          </select>
          <p class="mt-1 text-xs text-gray-500">Normally Leave of Absence, filed without advance notice.</p>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium text-gray-200" for="warning-threshold">Availability warning threshold</label>
          <div class="relative"><input id="warning-threshold" v-model.number="settings.availability_warning_threshold" type="number" min="1" class="form-control pr-24" /><span class="pointer-events-none absolute right-3 top-2.5 text-xs text-gray-500">employees</span></div>
          <p v-if="errors.availability_warning_threshold" class="mt-1 text-xs text-red-400">{{ errors.availability_warning_threshold }}</p>
          <p class="mt-1 text-xs text-gray-500">Warn approvers when this many department peers overlap.</p>
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-gray-800 bg-gray-900">
      <div class="border-b border-gray-800 px-5 py-4">
        <h2 class="text-base font-semibold text-primary-200">Leave type policies</h2>
        <p class="mt-1 text-sm text-gray-400">Configure paid limits, eligibility, filing notice, and supporting documents.</p>
      </div>
      <div v-if="loading" class="space-y-3 p-5" role="status" aria-label="Loading policies">
        <div v-for="item in 4" :key="item" class="h-28 animate-pulse rounded-xl bg-gray-800" />
      </div>
      <div v-else class="grid gap-4 p-5 xl:grid-cols-2">
        <article v-for="policy in policies" :key="policy.id" class="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
          <div class="mb-4 flex items-start justify-between gap-3">
            <div><h3 class="font-semibold text-gray-100">{{ policy.name }}</h3><p class="mt-0.5 text-xs text-gray-500">{{ policy.id }}</p></div>
            <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="Number(policy.paid_days_per_year) > 0 ? 'bg-emerald-900/50 text-emerald-300' : 'bg-gray-800 text-gray-300'">{{ Number(policy.paid_days_per_year) > 0 ? 'Paid allowance' : 'Unpaid' }}</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <label class="text-xs text-gray-400">Paid days / year<input v-model.number="policy.paid_days_per_year" type="number" min="0" step="0.5" class="form-control mt-1" /><span v-if="errors[`${policy.id}-paid`]" class="mt-1 block text-red-400">{{ errors[`${policy.id}-paid`] }}</span></label>
            <label class="text-xs text-gray-400">Minimum service<input v-model.number="policy.min_months_employed" type="number" min="0" class="form-control mt-1" /><span v-if="errors[`${policy.id}-months`]" class="mt-1 block text-red-400">{{ errors[`${policy.id}-months`] }}</span></label>
            <label class="text-xs text-gray-400">Advance notice<input v-model.number="policy.filing_notice_days" type="number" min="0" class="form-control mt-1" /><span v-if="errors[`${policy.id}-notice`]" class="mt-1 block text-red-400">{{ errors[`${policy.id}-notice`] }}</span></label>
          </div>
          <label class="mt-3 flex items-center gap-2 text-sm text-gray-300"><input v-model="policy.requires_attachment_for_paid" type="checkbox" class="rounded border-gray-700 bg-gray-900 text-primary-500" /> Require attachment for paid leave</label>
          <label class="mt-3 block text-xs text-gray-400">Employee guidance<textarea v-model="policy.remarks" rows="2" maxlength="1000" class="form-control mt-1 resize-y" /></label>
        </article>
      </div>
      <div class="flex justify-end border-t border-gray-800 px-5 py-4"><AppButton :loading="saving" :disabled="loading" @click="save">Save leave policies</AppButton></div>
    </div>
  </section>
</template>
