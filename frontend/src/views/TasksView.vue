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
  getClients,
  getServices,
  getUsers,
} from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import TaskCompletionModal from '@/components/tasks/TaskCompletionModal.vue'
import TaskDetailsDrawer from '@/components/tasks/TaskDetailsDrawer.vue'
import TaskEditorModal from '@/components/tasks/TaskEditorModal.vue'
import TaskWorkList from '@/components/tasks/TaskWorkList.vue'
import { usePersistentFilters } from '@/composables/usePersistentFilters'
import { resolveTaskType } from '@/components/tasks/taskPresentation'

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

usePersistentFilters('tasks', { tab, searchQuery, clientFilter, employeeFilter, taskTypeFilter, myRelevantOnly, pageSize })

const clients = ref([])
const services = ref([])
const users = ref([])

const showTaskModal = ref(false)
const editingTask = ref(null)
const savingTask = ref(false)
const createMode = ref('task')
const showCreateMenu = ref(false)
const showDetailsDrawer = ref(false)
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
const assignableUsers = computed(() => users.value.filter((user) => String(user.role || '').toLowerCase() !== 'ceo'))

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

function openDetails(row) {
  openActionsTaskId.value = null
  selectedTask.value = row
  showDetailsDrawer.value = true
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
  showDetailsDrawer.value = false
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
  showDetailsDrawer.value = false
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

</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Tasks & Meetings" description="Plan work, coordinate meetings, and follow progress across the team." eyebrow="CRM workspace">
      <template #actions>
        <div class="relative" data-create-menu="tasks-create">
          <AppButton @click.stop="toggleCreateMenu">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14" /></svg>
            Create
            <svg class="h-4 w-4 transition-transform" :class="showCreateMenu ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9-7 7-7-7" /></svg>
          </AppButton>
          <div v-if="showCreateMenu" class="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 p-1.5 shadow-xl">
            <button type="button" class="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800" @click="openCreate('task')">Create Task</button>
            <button type="button" class="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800" @click="openCreate('meeting')">Create Meeting</button>
          </div>
        </div>
      </template>
    </PageHeader>

    <div class="flex flex-wrap items-center gap-2 border-b border-gray-800 pb-3" role="tablist" aria-label="Task status">
        <button v-for="item in tabOptions" :key="item.value" type="button" class="rounded-lg px-3 py-2 text-sm font-medium" :class="tab === item.value ? 'bg-primary-500 text-black' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'" @click="tab = item.value; applyFilters()">
          {{ item.label }}
        </button>
    </div>

    <div class="filter-panel grid gap-3 sm:grid-cols-6">
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

    <TaskWorkList
      :tasks="tasks"
      :users="users"
      :tab="tab"
      :loading="loading"
      :open-actions-task-id="openActionsTaskId"
      :can-manage="authStore.role !== 'employee'"
      :action-loading-id="actionLoadingId"
      @details="openDetails"
      @edit="openEdit"
      @cancel="cancelTaskAction"
      @toggle-actions="toggleActionsMenu"
    />

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

  <TaskDetailsDrawer
    :show="showDetailsDrawer"
    :task="selectedTask"
    :users="users"
    :can-manage="authStore.role !== 'employee'"
    @close="showDetailsDrawer = false"
    @edit="openEdit"
    @complete="openComplete"
  />
</template>
