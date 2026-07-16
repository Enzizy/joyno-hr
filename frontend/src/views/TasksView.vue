<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import {
  getTasks,
  createTask,
  updateTask,
  completeTask,
  cancelTask,
  getTaskProofUrl,
  getTaskAttachmentUrl,
  getClients,
  getServices,
  getUsers,
} from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import TaskCompletionModal from '@/components/tasks/TaskCompletionModal.vue'
import TaskDetailsModal from '@/components/tasks/TaskDetailsModal.vue'
import TaskEditorModal from '@/components/tasks/TaskEditorModal.vue'
import {
  formatPriority, formatStatus, priorityTone, resolveTaskType, serviceBadgeClass,
  serviceBadgeLabel, serviceCardClass, statusTone, taskTypeBadgeClass, taskTypeLabel,
} from '@/components/tasks/taskPresentation'

const route = useRoute()
const authStore = useAuthStore()
const toast = useToastStore()

const loading = ref(false)
const tasks = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const tab = ref('active')
const searchQuery = ref('')
const clientFilter = ref('all')
const employeeFilter = ref('all')
const taskTypeFilter = ref('all')
const myRelevantOnly = ref(authStore.isEmployee)

const clients = ref([])
const services = ref([])
const users = ref([])

const showTaskModal = ref(false)
const editingTask = ref(null)
const savingTask = ref(false)
const createMode = ref('task')
const showCreateMenu = ref(false)
const showDetailsModal = ref(false)
const selectedTask = ref(null)
const openActionsTaskId = ref(null)

const showCompleteModal = ref(false)
const completingTask = ref(null)
const completing = ref(false)
const completeNotes = ref('')
const proofFile = ref(null)

const actionLoadingId = ref(null)

const tabOptions = [
  { value: 'active', label: 'Active' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
]

const pageSizeOptions = [10, 20, 50]
const taskTypeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'task', label: 'Task' },
  { value: 'meeting', label: 'Meeting' },
]

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const offset = computed(() => (page.value - 1) * pageSize.value)

function userLabel(id) {
  const user = users.value.find((u) => Number(u.id) === Number(id))
  if (!user) return `User #${id}`
  const first = (user.first_name || '').trim()
  const last = (user.last_name || '').trim()
  const fullName = `${first} ${last}`.trim()
  if (fullName) return fullName
  if (user.email) return user.email
  return `User #${id}`
}

function assigneeSummary(row, limit = 4) {
  const ids = Array.isArray(row.assigned_to_ids) ? row.assigned_to_ids : []
  const normalized = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
  const names = (normalized.length ? normalized : [row.assigned_to]).map((id) => userLabel(id)).filter(Boolean)
  const shown = names.slice(0, limit)
  const remaining = Math.max(0, names.length - shown.length)
  return {
    text: shown.join(', '),
    remaining,
    total: names.length,
  }
}

function openDetails(row) {
  openActionsTaskId.value = null
  selectedTask.value = row
  showDetailsModal.value = true
}

function typeLabel(serviceType) {
  if (serviceType === 'social_media_management') return 'Social Media'
  if (serviceType === 'website_development') return 'Website Dev'
  return serviceType || '-'
}

function dateOnly(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function formatDate(value) {
  const iso = dateOnly(value)
  if (!iso) return '-'
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })
}

async function loadLookups() {
  const [clientData, serviceRows, userRows] = await Promise.all([
    getClients({ status: 'active', limit: 100, offset: 0 }),
    getServices({}),
    getUsers(),
  ])
  clients.value = Array.isArray(clientData) ? clientData : clientData.items || []
  services.value = serviceRows
  users.value = userRows
}

async function loadTasks() {
  loading.value = true
  try {
    const relevantAssignedTo =
      myRelevantOnly.value && Number(authStore.user?.id) ? Number(authStore.user?.id) : employeeFilter.value !== 'all' ? employeeFilter.value : null
    const data = await getTasks({
      tab: tab.value,
      search: searchQuery.value.trim(),
      client_id: clientFilter.value !== 'all' ? clientFilter.value : null,
      assigned_to: relevantAssignedTo,
      task_type: taskTypeFilter.value !== 'all' ? taskTypeFilter.value : null,
      limit: pageSize.value,
      offset: offset.value,
    })
    tasks.value = data.items || []
    total.value = Number(data.total || 0)
    if (page.value > totalPages.value) {
      page.value = totalPages.value
      await loadTasks()
    }
  } catch (err) {
    toast.error(err.message || 'Failed to load tasks.')
  } finally {
    loading.value = false
  }
}

async function initPage() {
  try {
    const clientId = Number.parseInt(route.query.client, 10)
    if (clientId) clientFilter.value = String(clientId)
    await loadLookups()
    await loadTasks()
  } catch (err) {
    toast.error(err.message || 'Failed to initialize tasks page.')
  }
}

function toggleActionsMenu(taskId) {
  openActionsTaskId.value = openActionsTaskId.value === taskId ? null : taskId
}

function closeActionsMenu() {
  openActionsTaskId.value = null
}

function handleOutsideActionsClick(event) {
  const target = event.target
  if (!(target instanceof Element)) {
    openActionsTaskId.value = null
    showCreateMenu.value = false
    return
  }
  if (openActionsTaskId.value) {
    const menuKey = `task-${openActionsTaskId.value}`
    if (!target.closest(`[data-task-actions-menu="${menuKey}"]`)) {
      openActionsTaskId.value = null
    }
  }
  if (showCreateMenu.value && !target.closest('[data-create-menu="tasks-create"]')) {
    showCreateMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideActionsClick)
  initPage()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideActionsClick)
})

watch(() => route.query.client, async () => {
  const clientId = Number.parseInt(route.query.client, 10)
  clientFilter.value = clientId ? String(clientId) : 'all'
  page.value = 1
  await loadTasks()
})

async function applyFilters() {
  page.value = 1
  await loadTasks()
}

async function changePage(next) {
  const target = Math.min(Math.max(next, 1), totalPages.value)
  if (target === page.value) return
  page.value = target
  await loadTasks()
}

function toggleCreateMenu() {
  showCreateMenu.value = !showCreateMenu.value
}

function openCreate(mode = 'task') {
  editingTask.value = null
  closeActionsMenu()
  showCreateMenu.value = false
  createMode.value = mode === 'meeting' ? 'meeting' : 'task'
  showTaskModal.value = true
}

function openEdit(row) {
  closeActionsMenu()
  createMode.value = resolveTaskType(row)
  editingTask.value = row
  showTaskModal.value = true
}

async function saveTask({ form, attachment }) {
  const isMeetingCreate = !editingTask.value && createMode.value === 'meeting'
  savingTask.value = true
  try {
    const payload = {
      ...form,
      client_id: isMeetingCreate ? null : form.client_id || null,
      service_id: isMeetingCreate ? null : form.service_id || null,
      task_type: editingTask.value ? resolveTaskType(editingTask.value) : createMode.value,
      assigned_to: Number(form.assigned_to),
      assigned_to_ids: (form.assigned_to_ids || []).map((id) => Number(id)).filter(Boolean),
      assign_department: form.assign_department || null,
      notify_ceo: Boolean(form.notify_ceo),
      status: editingTask.value ? form.status : 'in_progress',
    }
    if (editingTask.value) {
      await updateTask(editingTask.value.id, payload)
      toast.success('Task updated.')
    } else {
      const formData = new FormData()
      for (const [key, value] of Object.entries(payload)) {
        if (Array.isArray(value)) {
          formData.append(key, JSON.stringify(value))
        } else if (value !== undefined && value !== null) {
          formData.append(key, value)
        }
      }
      if (attachment) formData.append('attachment', attachment)
      await createTask(formData)
      toast.success('Task created.')
    }
    showTaskModal.value = false
    await loadTasks()
  } catch (err) {
    toast.error(err.message || 'Failed to save task.')
  } finally {
    savingTask.value = false
  }
}

function openComplete(row) {
  closeActionsMenu()
  completingTask.value = row
  completeNotes.value = ''
  proofFile.value = null
  showCompleteModal.value = true
}

function onProofSelected(event) {
  const file = event.target.files?.[0] || null
  proofFile.value = file
}

async function completeTaskAction() {
  if (!completingTask.value) return
  completing.value = true
  try {
    const formData = new FormData()
    formData.append('completion_notes', completeNotes.value || '')
    if (proofFile.value) formData.append('proof', proofFile.value)
    await completeTask(completingTask.value.id, formData)
    toast.success('Task completed.')
    showCompleteModal.value = false
    await loadTasks()
  } catch (err) {
    toast.error(err.message || 'Failed to complete task.')
  } finally {
    completing.value = false
  }
}

async function cancelTaskAction(row) {
  closeActionsMenu()
  actionLoadingId.value = row.id
  try {
    await cancelTask(row.id)
    toast.success('Task cancelled.')
    await loadTasks()
  } catch (err) {
    toast.error(err.message || 'Failed to cancel task.')
  } finally {
    actionLoadingId.value = null
  }
}

function proofUrl(taskId) {
  return getTaskProofUrl(taskId)
}

function attachmentUrl(taskId) {
  return getTaskAttachmentUrl(taskId)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-primary-200">Tasks</h1>
        <p class="mt-1 text-sm text-gray-400">Central task management for all CRM work.</p>
      </div>
      <div class="relative" data-create-menu="tasks-create">
        <AppButton @click.stop="toggleCreateMenu">Create <span class="ml-1 text-xs">v</span></AppButton>
        <div v-if="showCreateMenu" class="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-lg">
          <button type="button" class="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800" @click="openCreate('task')">Create Task</button>
          <button type="button" class="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800" @click="openCreate('meeting')">Create Meeting</button>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button v-for="item in tabOptions" :key="item.value" type="button" class="rounded-lg px-3 py-2 text-sm font-medium" :class="tab === item.value ? 'bg-primary-500 text-gray-900' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'" @click="tab = item.value; applyFilters()">
        {{ item.label }}
      </button>
    </div>

    <div class="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm sm:grid-cols-6">
      <div class="sm:col-span-2">
        <label class="mb-1 block text-xs text-gray-400">Search</label>
        <input v-model="searchQuery" type="text" placeholder="Search task title" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @keyup.enter="applyFilters" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-gray-400">Client</label>
        <select v-model="clientFilter" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="applyFilters">
          <option value="all">All Clients</option>
          <option v-for="client in clients" :key="client.id" :value="String(client.id)">{{ client.company_name }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-gray-400">Employee</label>
        <select v-model="employeeFilter" :disabled="myRelevantOnly" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 disabled:opacity-60" @change="applyFilters">
          <option value="all">All Employees</option>
          <option v-for="user in assignableUsers" :key="user.id" :value="String(user.id)">{{ userLabel(user.id) }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-gray-400">Type</label>
        <select v-model="taskTypeFilter" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="applyFilters">
          <option v-for="item in taskTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-gray-400">Rows</label>
        <select v-model.number="pageSize" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="applyFilters">
          <option v-for="s in pageSizeOptions" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="sm:col-span-6">
        <label class="inline-flex items-center gap-2 text-sm text-gray-300">
          <input v-model="myRelevantOnly" type="checkbox" class="rounded border-gray-700 bg-gray-900" @change="applyFilters" />
          <span>My relevant only</span>
        </label>
      </div>
    </div>

    <div class="space-y-3">
      <div v-for="row in tasks" :key="row.id" class="rounded-xl border p-4 shadow-sm" :class="serviceCardClass(row)">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0 space-y-2 md:pr-4">
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-semibold text-primary-200">
                {{ row.title }}
              </h3>
              <span class="rounded-full border px-2 py-0.5 text-xs font-semibold" :class="taskTypeBadgeClass(resolveTaskType(row))">
                {{ taskTypeLabel(resolveTaskType(row)) }}
              </span>
              <span class="rounded-full border px-2 py-0.5 text-xs font-semibold" :class="serviceBadgeClass(row.service_type)">
                {{ serviceBadgeLabel(row.service_type) }}
              </span>
              <span v-if="row.is_automated" class="rounded-full border border-primary-500/50 bg-primary-500/10 px-2 py-0.5 text-xs font-semibold text-primary-300">
                Automated
              </span>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="priorityTone(row.priority)">{{ formatPriority(row.priority) }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusTone(row.status)">{{ formatStatus(row.status) }}</span>
            </div>
            <p class="line-clamp-2 text-sm text-gray-300">{{ row.description || 'No description.' }}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
              <span>Due: {{ formatDate(row.due_date) }}</span>
              <span>Client: {{ row.company_name || '-' }}</span>
              <span>Service: {{ typeLabel(row.service_type) }}</span>
              <span class="max-w-full">
                Assigned ({{ assigneeSummary(row).total }}):
                {{ assigneeSummary(row).text }}
                <span v-if="assigneeSummary(row).remaining > 0">+{{ assigneeSummary(row).remaining }} more</span>
              </span>
              <a v-if="row.attachment_data" :href="attachmentUrl(row.id)" target="_blank" rel="noopener" class="text-primary-300 hover:text-primary-200">View attachment</a>
              <a v-if="row.proof_of_work_data" :href="proofUrl(row.id)" target="_blank" rel="noopener" class="text-primary-300 hover:text-primary-200">View proof</a>
            </div>
          </div>

          <div class="mt-2 flex shrink-0 flex-wrap gap-2 md:mt-0 md:justify-end">
            <AppButton v-if="row.status === 'pending' || row.status === 'in_progress'" variant="primary" size="sm" @click="openComplete(row)">Mark Complete</AppButton>
            <template v-if="row.status === 'pending' || row.status === 'in_progress'">
              <div class="relative" :data-task-actions-menu="`task-${row.id}`">
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-lg leading-none text-gray-200 hover:bg-gray-700"
                  aria-label="More actions"
                  @click.stop="toggleActionsMenu(row.id)"
                >
                  ⋮
                </button>
                <div
                  v-if="openActionsTaskId === row.id"
                  class="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-lg"
                  @click.stop
                >
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
                    @click="openDetails(row)"
                  >
                    View
                  </button>
                  <button
                    v-if="authStore.role !== 'employee'"
                    type="button"
                    class="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
                    @click="openEdit(row)"
                  >
                    Edit
                  </button>
                  <button
                    v-if="authStore.role !== 'employee'"
                    type="button"
                    class="block w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-900/30"
                    :disabled="actionLoadingId === row.id"
                    @click="cancelTaskAction(row)"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <AppButton variant="ghost" size="sm" @click="openDetails(row)">View</AppButton>
            </template>
          </div>
        </div>
      </div>

      <div v-if="!tasks.length && !loading" class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center text-sm text-gray-400">
        No tasks found for current filters.
      </div>
    </div>

    <div class="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300">
      <span>Showing {{ tasks.length ? offset + 1 : 0 }}-{{ offset + tasks.length }} of {{ total }}</span>
      <div class="flex items-center gap-2">
        <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="changePage(page - 1)">Previous</AppButton>
        <span>Page {{ page }} / {{ totalPages }}</span>
        <AppButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="changePage(page + 1)">Next</AppButton>
      </div>
    </div>
  </div>

  <TaskEditorModal
    :show="showTaskModal"
    :mode="createMode"
    :task="editingTask"
    :clients="clients"
    :services="services"
    :users="users"
    :saving="savingTask"
    @close="showTaskModal = false"
    @submit="saveTask"
  />

  <TaskCompletionModal
    v-model:notes="completeNotes"
    :show="showCompleteModal"
    :loading="completing"
    @close="showCompleteModal = false"
    @proof-selected="onProofSelected"
    @submit="completeTaskAction"
  />

  <TaskDetailsModal
    :show="showDetailsModal"
    :task="selectedTask"
    :users="users"
    @close="showDetailsModal = false"
  />
</template>
