<script setup>
import { computed } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'

const props = defineProps({
  form: { type: Object, required: true },
  leaveTypes: { type: Array, default: () => [] },
  entitlements: { type: Array, default: () => [] },
  requestedDays: { type: Number, default: 0 },
  payTypePreview: { type: String, default: '-' },
  selectedType: { type: Object, default: null },
  missingDocument: Boolean,
  filingNoticeDays: { type: Number, default: 0 },
  startMin: { type: String, default: '' },
  endMin: { type: String, default: '' },
  disabled: Boolean,
  submitting: Boolean,
})

defineEmits(['submit', 'attachment-change'])

const selectedPolicy = computed(() => {
  if (!props.selectedType) return null
  return props.entitlements.find((item) => item.id === props.selectedType.id) || {
    ...props.selectedType,
    total: Number(props.selectedType.paid_days_per_year || 0),
    minMonths: Number(props.selectedType.min_months_employed || 0),
    requiresAttachment: Boolean(props.selectedType.requires_attachment_for_paid),
  }
})

function formatPayType(value) {
  return String(value || '-').replace('_', ' ').toUpperCase()
}
</script>

<template>
  <section class="surface-card overflow-hidden">
    <div class="surface-header">
      <div><h2 class="font-semibold text-gray-100">New leave request</h2><p class="mt-1 text-xs text-gray-500">Choose your dates and provide the necessary details.</p></div>
    </div>

    <form class="grid gap-4 p-5 sm:grid-cols-2" @submit.prevent="$emit('submit')">
      <p v-if="disabled" class="rounded-lg border border-amber-900/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200 sm:col-span-2">
        You are currently on leave and cannot submit another request.
      </p>

      <div class="sm:col-span-2">
        <label class="mb-1.5 block text-sm font-medium text-gray-200" for="leave-type">Leave type <span class="text-red-400">*</span></label>
        <select id="leave-type" v-model="form.leave_type_id" required :disabled="disabled || submitting" class="form-control">
          <option value="">Select type</option>
          <option v-for="type in leaveTypes" :key="type.id" :value="type.id">{{ type.name }}</option>
        </select>
      </div>

      <div v-if="selectedPolicy" class="rounded-lg border border-primary-500/25 bg-primary-500/10 p-3 sm:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div><p class="text-[10px] uppercase tracking-wider text-gray-500">Selected policy</p><p class="mt-0.5 text-sm font-semibold text-primary-200">{{ selectedPolicy.name }}</p></div>
          <div class="flex gap-4 text-right text-xs text-gray-500">
            <span><strong class="block text-gray-200">{{ filingNoticeDays || 'None' }}</strong>Min. notice</span>
            <span><strong class="block text-gray-200">{{ selectedPolicy.total || 'Unpaid' }}</strong>{{ selectedPolicy.total ? 'Paid days' : 'Treatment' }}</span>
          </div>
        </div>
        <p v-if="selectedPolicy.requiresAttachment" class="mt-2 text-xs text-amber-300">Supporting documentation is required for paid treatment.</p>
      </div>

      <AppDatePicker v-model="form.start_date" name="leave-start" label="Start date" required :min="startMin" :disabled="disabled || submitting" />
      <AppDatePicker v-model="form.end_date" name="leave-end" label="End date" required :min="endMin" :disabled="disabled || submitting" />

      <label class="sm:col-span-2 text-sm font-medium text-gray-200">
        Reason <span class="text-red-400">*</span>
        <textarea v-model="form.reason" rows="3" required maxlength="2000" :disabled="disabled || submitting" class="form-control mt-1.5 resize-y" placeholder="Explain the reason for your leave" />
        <span class="mt-1 block text-right text-xs font-normal text-gray-500">{{ form.reason.length }} / 2000</span>
      </label>

      <label class="sm:col-span-2 text-sm font-medium text-gray-200">
        Attachment <span class="font-normal text-gray-500">(optional)</span>
        <input type="file" accept="image/*" :disabled="disabled || submitting" class="form-control mt-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-xs file:text-gray-200" @change="$emit('attachment-change', $event)" />
        <span class="mt-1 block text-xs font-normal text-gray-500">Images only, up to 1MB.</span>
      </label>

      <p v-if="missingDocument" class="rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-300 sm:col-span-2">
        {{ selectedType?.name }} requires a supporting document for paid treatment.
      </p>

      <div class="flex flex-wrap items-end justify-between gap-4 border-t border-gray-800 pt-4 sm:col-span-2">
        <dl class="flex gap-8">
          <div><dt class="text-xs text-gray-500">Chargeable duration</dt><dd class="mt-1 text-sm font-semibold text-gray-100">{{ requestedDays ? `${requestedDays} working day(s)` : 'Select dates' }}</dd><p v-if="requestedDays" class="mt-0.5 text-[11px] text-gray-500">Weekends and non-working holidays excluded</p></div>
          <div><dt class="text-xs text-gray-500">Pay treatment</dt><dd class="mt-1 text-sm font-semibold" :class="payTypePreview === 'unpaid' ? 'text-amber-300' : 'text-emerald-300'">{{ formatPayType(payTypePreview) }}</dd></div>
        </dl>
        <AppButton type="submit" :loading="submitting" :disabled="disabled || !requestedDays">Submit request</AppButton>
      </div>
    </form>
  </section>
</template>
