<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppModal from '@/components/ui/AppModal.vue'

const props = defineProps({
  show: Boolean,
  entry: { type: Object, default: null },
  employees: { type: Array, default: () => [] },
  leaveTypes: { type: Array, default: () => [] },
  saving: Boolean,
})

const emit = defineEmits(['close', 'save', 'request-delete'])
const error = ref('')
const employeeSearch = ref('')
const form = reactive({
  entry_type: 'leave',
  employee_id: '',
  leave_type_name: '',
  title: '',
  start_date: '',
  end_date: '',
  description: '',
  is_employee_visible: true,
})

const isEditing = computed(() => Boolean(props.entry?.record_id))
const sortedEmployees = computed(() => [...props.employees].sort((left, right) =>
  `${left.first_name || ''} ${left.last_name || ''}`.localeCompare(
    `${right.first_name || ''} ${right.last_name || ''}`
  )
))
const filteredEmployees = computed(() => {
  const query = employeeSearch.value.trim().toLowerCase()
  if (!query) return sortedEmployees.value
  return sortedEmployees.value.filter((employee) =>
    [
      employee.employee_code,
      employee.first_name,
      employee.last_name,
      employee.department,
      employee.position,
    ].some((value) => String(value || '').toLowerCase().includes(query))
  )
})

function resetForm() {
  const entry = props.entry || {}
  form.entry_type = entry.entry_type || 'leave'
  form.employee_id = entry.employee_id ? String(entry.employee_id) : ''
  form.leave_type_name = entry.leave_type_name || ''
  form.title = entry.entry_type === 'note' ? entry.title || entry.employee_name || '' : ''
  form.start_date = String(entry.start_date || '').slice(0, 10)
  form.end_date = String(entry.end_date || entry.start_date || '').slice(0, 10)
  form.description = entry.description || ''
  form.is_employee_visible = entry.is_employee_visible ?? true
  employeeSearch.value = ''
  error.value = ''
}

function submit() {
  error.value = ''
  if (!form.start_date || !form.end_date || form.end_date < form.start_date) {
    error.value = 'Choose a valid start and end date.'
    return
  }
  if (form.entry_type === 'leave' && (!form.employee_id || !form.leave_type_name)) {
    error.value = 'Employee and leave type are required.'
    return
  }
  if (form.entry_type === 'note' && !form.title.trim()) {
    error.value = 'Add a short title for the calendar note.'
    return
  }

  emit('save', {
    entry_type: form.entry_type,
    employee_id: form.entry_type === 'leave' ? Number(form.employee_id) : null,
    leave_type_name: form.entry_type === 'leave' ? form.leave_type_name : null,
    title: form.entry_type === 'note' ? form.title.trim() : 'HR-recorded leave',
    start_date: form.start_date,
    end_date: form.end_date,
    description: form.description.trim(),
    is_employee_visible: form.entry_type === 'leave' && form.is_employee_visible,
  })
}

watch(() => [props.show, props.entry], ([show]) => {
  if (show) resetForm()
}, { immediate: true })
</script>

<template>
  <AppModal
    :show="show"
    :title="isEditing ? 'Edit calendar entry' : 'Add calendar entry'"
    size="lg"
    @close="emit('close')"
  >
    <form class="space-y-5" @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-2 rounded-xl border border-gray-800 bg-gray-950/40 p-1.5">
        <button
          type="button"
          class="rounded-lg px-4 py-2.5 text-sm font-semibold transition"
          :class="form.entry_type === 'leave' ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40' : 'text-gray-400 hover:bg-gray-800'"
          @click="form.entry_type = 'leave'"
        >
          HR-recorded leave
        </button>
        <button
          type="button"
          class="rounded-lg px-4 py-2.5 text-sm font-semibold transition"
          :class="form.entry_type === 'note' ? 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-500/40' : 'text-gray-400 hover:bg-gray-800'"
          @click="form.entry_type = 'note'"
        >
          Calendar note
        </button>
      </div>

      <div v-if="form.entry_type === 'leave'" class="grid gap-4 sm:grid-cols-2">
        <label class="text-sm font-medium text-gray-200">
          Employee <span class="text-red-500">*</span>
          <input
            v-model="employeeSearch"
            class="form-control mt-1.5"
            placeholder="Search name, code, or department"
          />
          <select v-model="form.employee_id" class="form-control mt-2">
            <option value="">Select employee</option>
            <option v-for="employee in filteredEmployees" :key="employee.id" :value="employee.id">
              {{ employee.first_name }} {{ employee.last_name }} · {{ employee.department || 'Unassigned' }}
            </option>
          </select>
        </label>
        <label class="text-sm font-medium text-gray-200">
          Leave type <span class="text-red-500">*</span>
          <select v-model="form.leave_type_name" class="form-control mt-1.5">
            <option value="">Select leave type</option>
            <option v-for="leaveType in leaveTypes" :key="leaveType.id" :value="leaveType.name">
              {{ leaveType.name }}
            </option>
          </select>
        </label>
      </div>

      <label v-else class="block text-sm font-medium text-gray-200">
        Short title <span class="text-red-500">*</span>
        <input
          v-model.trim="form.title"
          maxlength="160"
          class="form-control mt-1.5"
          placeholder="e.g. Written leave letter received"
        />
      </label>

      <div class="grid gap-4 sm:grid-cols-2">
        <AppDatePicker v-model="form.start_date" label="Start date" name="calendar-entry-start" required />
        <AppDatePicker v-model="form.end_date" label="End date" name="calendar-entry-end" :min="form.start_date" required />
      </div>

      <label class="block text-sm font-medium text-gray-200">
        Short description <span class="font-normal text-gray-500">(optional)</span>
        <textarea
          v-model="form.description"
          rows="3"
          maxlength="500"
          class="form-control mt-1.5 resize-y"
          :placeholder="form.entry_type === 'leave' ? 'How the request was received or other context…' : 'Add helpful context for HR and management…'"
        />
        <span class="mt-1 block text-right text-xs text-gray-500">{{ form.description.length }} / 500</span>
      </label>

      <label v-if="form.entry_type === 'leave'" class="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
        <input v-model="form.is_employee_visible" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary-500" />
        <span>
          <span class="block text-sm font-medium text-gray-200">Show this entry to the employee</span>
          <span class="mt-1 block text-xs leading-5 text-gray-500">The employee will see that HR recorded this leave on their calendar.</span>
        </span>
      </label>

      <p class="rounded-xl border border-amber-700/30 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-200">
        Calendar tracking only. This entry does not deduct leave credits, change payroll, or replace the formal leave approval workflow.
      </p>

      <p v-if="error" class="rounded-lg border border-red-700/40 bg-red-500/10 p-3 text-sm text-red-300">
        {{ error }}
      </p>
    </form>

    <template #footer>
      <AppButton
        v-if="isEditing"
        class="mr-auto"
        variant="danger"
        :disabled="saving"
        @click="emit('request-delete', entry)"
      >
        Delete
      </AppButton>
      <AppButton variant="secondary" :disabled="saving" @click="emit('close')">Cancel</AppButton>
      <AppButton :loading="saving" @click="submit">{{ isEditing ? 'Save changes' : 'Add to calendar' }}</AppButton>
    </template>
  </AppModal>
</template>
