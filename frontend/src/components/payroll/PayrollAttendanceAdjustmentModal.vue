<script setup>
import { computed, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'

const props = defineProps({
  show: Boolean,
  day: { type: Object, default: null },
  saving: Boolean,
})

const emit = defineEmits(['close', 'save'])

const adjustmentType = ref('actual_times')
const timeIn = ref('')
const timeOut = ref('')
const undertimeMinutes = ref(null)
const reason = ref('')

const usesTimes = computed(() => ['actual_times', 'undertime', 'half_day'].includes(adjustmentType.value))
const needsCustomMinutes = computed(() => adjustmentType.value === 'undertime')

watch(() => [props.show, props.day], () => {
  if (!props.show || !props.day) return
  adjustmentType.value = props.day.status === 'absent' ? 'absent' : 'actual_times'
  timeIn.value = props.day.timeIn || ''
  timeOut.value = props.day.timeOut || ''
  undertimeMinutes.value = Number(props.day.undertime_minutes ?? props.day.undertimeMinutes ?? 0) || null
  reason.value = ''
}, { immediate: true })

watch(adjustmentType, (type) => {
  if (type === 'half_day') {
    timeIn.value = '09:00'
    timeOut.value = '13:00'
    undertimeMinutes.value = 240
  } else if (type === 'undertime') {
    undertimeMinutes.value ||= 60
  } else if (type === 'actual_times') {
    undertimeMinutes.value = null
  }
})

function submit() {
  if (!reason.value.trim()) return
  const payload = {
    adjustmentType: adjustmentType.value,
    reason: reason.value.trim(),
  }

  if (usesTimes.value) {
    payload.status = 'present'
    payload.timeIn = timeIn.value
    payload.timeOut = timeOut.value
  } else {
    payload.status = adjustmentType.value
    payload.timeIn = null
    payload.timeOut = null
  }

  if (adjustmentType.value === 'half_day') {
    payload.lateMinutes = 0
    payload.undertimeMinutes = 240
  } else if (adjustmentType.value === 'undertime') {
    payload.undertimeMinutes = Number(undertimeMinutes.value)
  }

  emit('save', payload)
}
</script>

<template>
  <AppModal :show="show" title="Adjust attendance" @close="emit('close')">
    <div v-if="day" class="space-y-4">
      <div class="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
        <p class="font-medium text-gray-100">{{ day.employee_name || day.employee_code }}</p>
        <p class="mt-1 text-xs text-gray-500">{{ day.work_date }} · Current status: {{ day.status }}</p>
      </div>

      <label class="block text-sm text-gray-300">
        Adjustment
        <select v-model="adjustmentType" class="form-control mt-1.5">
          <option value="actual_times">Correct time in/out</option>
          <option value="undertime">Undertime — custom missed minutes</option>
          <option value="half_day">Half-day worked — deduct 4 hours</option>
          <option value="absent">Absent — deduct one day</option>
          <option value="paid_leave">Paid leave — no salary deduction</option>
          <option value="unpaid_leave">Unpaid leave — deduct one day</option>
        </select>
      </label>

      <div v-if="usesTimes" class="grid gap-3 sm:grid-cols-2">
        <label class="text-sm text-gray-300">Time in<input v-model="timeIn" type="time" required class="form-control mt-1.5"></label>
        <label class="text-sm text-gray-300">Time out<input v-model="timeOut" type="time" required class="form-control mt-1.5"></label>
      </div>

      <label v-if="needsCustomMinutes" class="block text-sm text-gray-300">
        Missed work minutes
        <input v-model.number="undertimeMinutes" type="number" min="1" max="480" step="1" class="form-control mt-1.5">
        <span class="mt-1 block text-xs text-gray-500">Examples: 30 minutes, 120 minutes, or 240 minutes for half a day.</span>
      </label>

      <div v-if="adjustmentType === 'half_day'" class="rounded-lg border border-amber-900/50 bg-amber-950/15 p-3 text-xs leading-5 text-amber-200">
        Half-day worked records 240 undertime minutes and deducts four salary hours. Travel fare is handled outside payroll.
      </div>

      <div v-if="['paid_leave', 'unpaid_leave'].includes(adjustmentType)" class="rounded-lg border border-blue-900/50 bg-blue-950/15 p-3 text-xs leading-5 text-blue-200">
        Use the official leave recorder when the employee submitted leave directly to management. This option is for correcting imported attendance only.
      </div>

      <label class="block text-sm text-gray-300">
        Reason for adjustment
        <textarea v-model="reason" rows="3" maxlength="500" placeholder="Example: Employee requested approved undertime directly from HR." class="form-control mt-1.5" />
      </label>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="emit('close')">Cancel</AppButton>
      <AppButton :loading="saving" :disabled="!reason.trim() || (usesTimes && (!timeIn || !timeOut))" @click="submit">Save adjustment</AppButton>
    </template>
  </AppModal>
</template>
