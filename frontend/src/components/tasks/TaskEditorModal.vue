<script setup>
import { computed, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'

const props = defineProps({
  show: Boolean,
  mode: { type: String, default: 'task' },
  task: { type: Object, default: null },
  clients: { type: Array, default: () => [] },
  services: { type: Array, default: () => [] },
  users: { type: Array, default: () => [] },
  saving: Boolean,
})

const emit = defineEmits(['close', 'submit'])

const assigneeSearch = ref('')
const departmentFilter = ref('')
const attachmentFile = ref(null)
const formMessage = ref('')
const taskForm = ref(emptyForm())

const isEditing = computed(() => Boolean(props.task))
const isMeeting = computed(() => !isEditing.value && props.mode === 'meeting')
const modalTitle = computed(() => isEditing.value ? 'Edit Task' : isMeeting.value ? 'Create Meeting' : 'Create Task')
const entityLabel = computed(() => isMeeting.value ? 'Meeting' : 'Task')
const assignableUsers = computed(() => props.users.filter((user) => String(user.role || '').toLowerCase() !== 'ceo'))
const departmentOptions = computed(() => {
  const values = new Set(assignableUsers.value.map((user) => String(user.department || '').trim()).filter(Boolean))
  return Array.from(values).sort((a, b) => a.localeCompare(b))
})
const departmentUsers = computed(() => {
  if (!departmentFilter.value) return []
  return assignableUsers.value.filter((user) => String(user.department || '').trim() === departmentFilter.value)
})
const allDepartmentUsersSelected = computed(() => {
  if (!departmentUsers.value.length) return false
  const selected = new Set(taskForm.value.assigned_to_ids.map(String))
  return departmentUsers.value.every((user) => selected.has(String(user.id)))
})
const formServices = computed(() => {
  if (!taskForm.value.client_id) return []
  return props.services.filter((service) => Number(service.client_id) === Number(taskForm.value.client_id))
})
const filteredUsers = computed(() => {
  const query = assigneeSearch.value.trim().toLowerCase()
  const users = departmentFilter.value ? departmentUsers.value : assignableUsers.value
  if (!query) return users
  return users.filter((user) => {
    return userLabel(user).toLowerCase().includes(query) || String(user.email || '').toLowerCase().includes(query)
  })
})
const selectedUsers = computed(() => {
  const selected = new Set(taskForm.value.assigned_to_ids.map(String))
  return assignableUsers.value.filter((user) => selected.has(String(user.id)))
})

watch(() => props.show, (show) => {
  if (show) resetForm()
})

watch(() => taskForm.value.client_id, () => {
  if (taskForm.value.service_id && !formServices.value.some((service) => String(service.id) === String(taskForm.value.service_id))) {
    taskForm.value.service_id = ''
  }
})

function emptyForm() {
  return {
    title: '', description: '', client_id: '', service_id: '', assigned_to: '', assigned_to_ids: [],
    notify_ceo: false, status: 'in_progress', priority: 'medium',
    due_date: new Date().toISOString().slice(0, 10),
  }
}

function resetForm() {
  const row = props.task
  taskForm.value = row ? {
    title: row.title || '',
    description: row.description || '',
    client_id: row.client_id ? String(row.client_id) : '',
    service_id: row.service_id ? String(row.service_id) : '',
    assigned_to: row.assigned_to ? String(row.assigned_to) : '',
    assigned_to_ids: [],
    notify_ceo: false,
    status: row.status || 'pending',
    priority: row.priority || 'medium',
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : '',
  } : emptyForm()
  assigneeSearch.value = ''
  departmentFilter.value = ''
  attachmentFile.value = null
  formMessage.value = ''
}

function userLabel(user) {
  const name = `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim()
  return name || user.email || `User #${user.id}`
}

function serviceLabel(value) {
  if (value === 'social_media_management') return 'Social Media'
  if (value === 'website_development') return 'Website Dev'
  return value || '-'
}

function toggleDepartmentSelection() {
  if (!departmentFilter.value || !departmentUsers.value.length) return
  const departmentIds = new Set(departmentUsers.value.map((user) => String(user.id)))
  if (allDepartmentUsersSelected.value) {
    taskForm.value.assigned_to_ids = taskForm.value.assigned_to_ids.filter((id) => !departmentIds.has(String(id)))
    formMessage.value = `Removed employees from ${departmentFilter.value}.`
    return
  }
  taskForm.value.assigned_to_ids = [...new Set([...taskForm.value.assigned_to_ids.map(String), ...departmentIds])]
  formMessage.value = `Selected ${departmentUsers.value.length} employee${departmentUsers.value.length === 1 ? '' : 's'} from ${departmentFilter.value}.`
}

function removeAssignee(userId) {
  taskForm.value.assigned_to_ids = taskForm.value.assigned_to_ids.filter((id) => String(id) !== String(userId))
}

function onAttachmentSelected(event) {
  attachmentFile.value = event.target.files?.[0] || null
}

function submitForm() {
  const hasAssignee = isEditing.value ? Boolean(taskForm.value.assigned_to) : taskForm.value.assigned_to_ids.length > 0
  if (!taskForm.value.title.trim() || !hasAssignee || !taskForm.value.due_date) {
    formMessage.value = `${entityLabel.value} title, assigned employee${isEditing.value ? '' : '(s)'}, and due date are required.`
    return
  }
  formMessage.value = ''
  emit('submit', { form: { ...taskForm.value }, attachment: attachmentFile.value })
}
</script>

<template>
  <AppModal :show="show" :title="modalTitle" size="xl" @close="emit('close')">
    <form id="task-editor-form" class="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" @submit.prevent="submitForm">
      <div class="space-y-5">
        <section class="rounded-xl border border-gray-800 bg-gray-950/50 p-4 sm:p-5">
          <div class="mb-4">
            <h4 class="font-semibold text-primary-200">{{ entityLabel }} details</h4>
            <p class="mt-1 text-xs text-gray-400">The information employees will see.</p>
          </div>
          <div class="space-y-4">
            <AppInput v-model="taskForm.title" :label="`${entityLabel} Title`" :placeholder="isMeeting ? 'e.g. Weekly team check-in' : 'e.g. Prepare monthly report'" required />
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-200">Description</label>
              <textarea v-model="taskForm.description" rows="4" class="block w-full resize-y rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-primary-500 focus:ring-primary-500" :placeholder="isMeeting ? 'Add the agenda or meeting context.' : 'Add instructions or important context.'" />
            </div>
            <div v-if="isEditing || mode === 'task'" class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-200">Client</label>
                <select v-model="taskForm.client_id" class="form-control">
                  <option value="">No client</option>
                  <option v-for="client in clients" :key="client.id" :value="String(client.id)">{{ client.company_name }}</option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-200">Service</label>
                <select v-model="taskForm.service_id" class="form-control" :disabled="!taskForm.client_id">
                  <option value="">No service</option>
                  <option v-for="service in formServices" :key="service.id" :value="String(service.id)">{{ serviceLabel(service.service_type) }}</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-xl border border-gray-800 bg-gray-950/50 p-4 sm:p-5">
          <h4 class="font-semibold text-primary-200">Schedule & options</h4>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-200">Priority</label>
              <select v-model="taskForm.priority" class="form-control">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </div>
            <div v-if="isEditing">
              <label class="mb-1 block text-sm font-medium text-gray-200">Status</label>
              <select v-model="taskForm.status" class="form-control">
                <option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
            <AppInput v-model="taskForm.due_date" type="date" :label="isMeeting ? 'Meeting Date' : 'Due Date'" required />
          </div>
          <label v-if="!isEditing" class="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/80 p-3 text-sm text-gray-200 hover:border-gray-700">
            <input v-model="taskForm.notify_ceo" type="checkbox" class="mt-0.5 rounded border-gray-700 bg-gray-900" />
            <span><span class="block font-medium">Notify CEO by email</span><span class="mt-0.5 block text-xs text-gray-400">Send a copy of this assignment.</span></span>
          </label>
        </section>

        <section v-if="!isEditing" class="rounded-xl border border-gray-800 bg-gray-950/50 p-4 sm:p-5">
          <h4 class="font-semibold text-primary-200">Attachment <span class="font-normal text-gray-500">(optional)</span></h4>
          <p class="mt-1 text-xs text-gray-400">PDF or image, up to 5MB. Emails include a direct view link.</p>
          <input type="file" accept="image/*,.pdf,application/pdf" class="mt-3 block w-full rounded-lg border border-dashed border-gray-700 bg-gray-900 px-3 py-3 text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-xs file:text-gray-200" @change="onAttachmentSelected" />
        </section>
      </div>

      <section class="flex min-h-[30rem] flex-col rounded-xl border border-gray-800 bg-gray-950/50 p-4 sm:p-5">
        <div class="flex items-start justify-between gap-4">
          <div><h4 class="font-semibold text-primary-200">{{ isMeeting ? 'Attendees' : 'Assignment' }}</h4><p class="mt-1 text-xs text-gray-400">Choose employees individually or add a department.</p></div>
          <span v-if="!isEditing" class="shrink-0 rounded-full bg-primary-500/15 px-2.5 py-1 text-xs font-medium text-primary-200">{{ selectedUsers.length }} selected</span>
        </div>

        <template v-if="isEditing">
          <div class="mt-5">
            <label class="mb-1 block text-sm font-medium text-gray-200">Assign To</label>
            <select v-model="taskForm.assigned_to" class="form-control">
              <option value="" disabled>Select employee</option>
              <option v-for="user in assignableUsers" :key="user.id" :value="String(user.id)">{{ userLabel(user) }}</option>
            </select>
          </div>
        </template>

        <template v-else>
          <div class="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select v-model="departmentFilter" class="form-control">
              <option value="">All departments</option>
              <option v-for="department in departmentOptions" :key="department" :value="department">{{ department }}</option>
            </select>
            <AppButton type="button" variant="secondary" :disabled="!departmentFilter || !departmentUsers.length" @click="toggleDepartmentSelection">
              {{ !departmentFilter ? 'Select a department' : allDepartmentUsersSelected ? `Deselect all (${departmentUsers.length})` : `Select all (${departmentUsers.length})` }}
            </AppButton>
          </div>
          <p class="mt-2 text-xs text-gray-400">The department menu filters the employee list. It does not select anyone automatically.</p>

          <div class="mt-4 rounded-xl border border-gray-800 bg-gray-900/70 p-3">
            <div class="relative">
              <svg class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg>
              <input v-model="assigneeSearch" type="search" placeholder="Search employees" class="form-control pl-9" />
            </div>
            <div class="mt-3 grid max-h-52 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
              <label v-for="user in filteredUsers" :key="user.id" class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                <input v-model="taskForm.assigned_to_ids" type="checkbox" :value="String(user.id)" class="rounded border-gray-700 bg-gray-900 text-primary-500 focus:ring-primary-500" />
                <span class="min-w-0 truncate">{{ userLabel(user) }}</span>
              </label>
              <p v-if="!filteredUsers.length" class="py-6 text-center text-sm text-gray-400 sm:col-span-2">No employees found.</p>
            </div>
          </div>

          <div class="mt-4 flex-1 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
            <div class="mb-2 flex items-center justify-between"><p class="text-xs font-medium uppercase tracking-wide text-gray-400">Selected employees</p><button v-if="selectedUsers.length" type="button" class="text-xs text-red-300 hover:text-red-200" @click="taskForm.assigned_to_ids = []">Clear all</button></div>
            <div v-if="selectedUsers.length" class="flex flex-wrap gap-2">
              <button v-for="user in selectedUsers" :key="user.id" type="button" class="inline-flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:border-red-500/50 hover:text-red-200" @click="removeAssignee(user.id)">{{ userLabel(user) }} <span aria-hidden="true">&times;</span></button>
            </div>
            <p v-else class="py-3 text-center text-xs text-gray-500">No employees selected yet.</p>
          </div>
        </template>
      </section>
    </form>

    <p v-if="formMessage" class="mt-4 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">{{ formMessage }}</p>

    <template #footer>
      <AppButton variant="secondary" @click="emit('close')">Cancel</AppButton>
      <AppButton type="submit" form="task-editor-form" :loading="saving">{{ isEditing ? 'Save Changes' : `Create ${entityLabel}` }}</AppButton>
    </template>
  </AppModal>
</template>

<style scoped>
.form-control {
  @apply block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:border-primary-500 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50;
}
</style>
