<script setup>
import { computed, reactive, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppModal from '@/components/ui/AppModal.vue'
import { usePhilippineWorkingDays } from '@/composables/usePhilippineWorkingDays'

const props = defineProps({
  show: Boolean,
  row: { type: Object, default: null },
  submitting: Boolean,
})

const emit = defineEmits(['close', 'submit'])
const form = reactive({
  request_type: 'move',
  requested_start_date: '',
  requested_end_date: '',
  reason: '',
})

const originalDays = computed(() => Number(props.row?.leave_days || 0))
const { workingDays: requestedWorkingDays } = usePhilippineWorkingDays(
  computed(() => form.requested_start_date),
  computed(() => form.requested_end_date)
)
const today = new Date()
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
const minDate = [
  tomorrow.getFullYear(),
  String(tomorrow.getMonth() + 1).padStart(2, '0'),
  String(tomorrow.getDate()).padStart(2, '0'),
].join('-')

watch(() => props.show, (show) => {
  if (!show) return
  form.request_type = 'move'
  form.requested_start_date = ''
  form.requested_end_date = ''
  form.reason = ''
})

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function submit() {
  emit('submit', {
    leave_request_id: props.row.id,
    request_type: form.request_type,
    requested_start_date: form.request_type === 'move' ? form.requested_start_date : null,
    requested_end_date: form.request_type === 'move' ? form.requested_end_date : null,
    reason: form.reason.trim(),
  })
}
</script>

<template>
  <AppModal :show="show" title="Request a leave change" @close="$emit('close')">
    <form v-if="row" class="space-y-5" @submit.prevent="submit">
      <div class="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
        <p class="text-xs uppercase tracking-wider text-gray-500">Approved leave</p>
        <p class="mt-1 font-semibold text-gray-100">{{ row.leave_type_name }}</p>
        <p class="mt-1 text-sm text-gray-400">{{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }} · {{ originalDays }} day(s)</p>
      </div>

      <div>
        <p class="mb-2 text-sm font-medium text-gray-200">What would you like to request?</p>
        <div class="grid grid-cols-2 gap-2 rounded-xl bg-gray-950 p-1">
          <button type="button" class="rounded-lg px-3 py-2.5 text-sm font-semibold transition" :class="form.request_type === 'move' ? 'bg-primary-500 text-black' : 'text-gray-400 hover:text-gray-200'" @click="form.request_type = 'move'">Move dates</button>
          <button type="button" class="rounded-lg px-3 py-2.5 text-sm font-semibold transition" :class="form.request_type === 'cancel' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-gray-200'" @click="form.request_type = 'cancel'">Cancel leave</button>
        </div>
      </div>

      <div v-if="form.request_type === 'move'" class="grid gap-4 sm:grid-cols-2">
        <AppDatePicker v-model="form.requested_start_date" label="New start date" required :min="minDate" />
        <AppDatePicker v-model="form.requested_end_date" label="New end date" required :min="form.requested_start_date || minDate" />
        <p class="sm:col-span-2 rounded-lg border border-blue-800/40 bg-blue-950/20 p-3 text-xs leading-5 text-blue-300">
          This is a date move only. Keep the same {{ originalDays }}-working-day duration and calendar year so the approved pay and credits remain unchanged.
          <strong v-if="form.requested_start_date && form.requested_end_date" class="mt-1 block">Selected: {{ requestedWorkingDays }} working day(s)</strong>
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Reason <span class="text-red-500">*</span></label>
        <textarea v-model="form.reason" rows="4" maxlength="2000" required class="form-control resize-y" :placeholder="form.request_type === 'move' ? 'Explain why you need to move this leave…' : 'Explain why this leave should be cancelled…'" />
        <p class="mt-1 text-right text-xs text-gray-500">{{ form.reason.length }} / 2000</p>
      </div>
    </form>

    <template #footer>
      <AppButton variant="secondary" @click="$emit('close')">Close</AppButton>
      <AppButton
        :variant="form.request_type === 'cancel' ? 'danger' : 'primary'"
        :loading="submitting"
        :disabled="!form.reason.trim() || (form.request_type === 'move' && (!form.requested_start_date || !form.requested_end_date || requestedWorkingDays !== originalDays))"
        @click="submit"
      >
        Submit request
      </AppButton>
    </template>
  </AppModal>
</template>
