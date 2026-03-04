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
  getClients,
  getServices,
  getUsers,
} from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppInput from '@/components/ui/AppInput.vue'

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

const clients = ref([])
const services = ref([])
const users = ref([])

const showTaskModal = ref(false)
const editingTask = ref(null)
const savingTask = ref(false)
const showDetailsModal = ref(false)
const selectedTask = ref(null)
const assigneeSearch = ref('')
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

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const pageSizeOptions = [10, 20, 50]

const taskForm = ref({
  title: '',
  description: '',
  client_id: '',
  service_id: '',
  assigned_to: '',
  assigned_to_ids: [],
  assign_department: '',
  notify_ceo: false,
  status: 'in_progress',
  priority: 'medium',
  due_date: '',
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const offset = computed(() => (page.value - 1) * pageSize.value)
const departmentOptions = computed(() => {
  const values = new Set()
  for (const user of users.value) {
    const dept = String(user.department || '').trim()
    if (dept) values.add(dept)
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b))
})
const formServices = computed(() => {
  if (!taskForm.value.client_id) return []
  return services.value.filter((s) => Number(s.client_id) === Number(taskForm.value.client_id))
})
const assignableUsers = computed(() => users.value.filter((u) => String(u.role || '').toLowerCase() !== 'ceo'))
const filteredAssignableUsers = computed(() => {
  const q = String(assigneeSearch.value || '').trim().toLowerCase()
  if (!q) return assignableUsers.value
  return assignableUsers.value.filter((user) => {
    const label = userLabel(user.id).toLowerCase()
    const email = String(user.email || '').toLowerCase()
    return label.includes(q) || email.includes(q)
  })
})

function formatStatus(value) {
  return statusOptions.find((v) => v.value === value)?.label || value
}

function formatPriority(value) {
  return priorityOptions.find((v) => v.value === value)?.label || value
}

function statusTone(value) {
  if (value === 'completed') return 'bg-emerald-900/60 text-emerald-200'
  if (value === 'in_progress') return 'bg-amber-900/60 text-amber-200'
  if (value === 'cancelled') return 'bg-gray-800 text-gray-300'
  return 'bg-sky-900/60 text-sky-200'
}

function priorityTone(value) {
  if (value === 'urgent') return 'bg-red-900/70 text-red-200'
  if (value === 'high') return 'bg-orange-900/70 text-orange-200'
  if (value === 'medium') return 'bg-amber-900/70 text-amber-200'
  return 'bg-gray-800 text-gray-300'
}

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

function assigneeNames(row) {
  const ids = Array.isArray(row?.assigned_to_ids) ? row.assigned_to_ids : []
  const normalized = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
  const names = (normalized.length ? normalized : [row?.assigned_to]).map((id) => userLabel(id)).filter(Boolean)
  return names.join(', ') || '-'
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

function dueState(row) {
  if (row.status === 'completed' || row.status === 'cancelled') return 'normal'
  const today = new Date().toISOString().slice(0, 10)
  const due = dateOnly(row.due_date)
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  return 'normal'
}

function cardClass(row) {
  // Keep service-type border colors visually consistent across all tabs.
  // Due state is shown by filters/status badges, not by border/ring overrides.
  const state = dueState(row)
  if (state === 'overdue') return ''
  if (state === 'today') return ''
  return ''
}

function serviceCardClass(row) {
  if (row.service_type === 'website_development') return 'border-cyan-700/70 bg-cyan-950/10'
  if (row.service_type === 'social_media_management') return 'border-violet-700/70 bg-violet-950/10'
  return 'border-gray-800 bg-gray-900'
}

function serviceBadgeClass(serviceType) {
  if (serviceType === 'website_development') return 'border-cyan-600/60 bg-cyan-900/30 text-cyan-200'
  if (serviceType === 'social_media_management') return 'border-violet-600/60 bg-violet-900/30 text-violet-200'
  return 'border-gray-700 text-gray-300'
}

function serviceBadgeLabel(serviceType) {
  if (serviceType === 'website_development') return 'Web Dev'
  if (serviceType === 'social_media_management') return 'SocMed'
  return 'General'
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
    const data = await getTasks({
      tab: tab.value,
      search: searchQuery.value.trim(),
      client_id: clientFilter.value !== 'all' ? clientFilter.value : null,
      assigned_to: employeeFilter.value !== 'all' ? employeeFilter.value : null,
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
  if (!openActionsTaskId.value) return
  const target = event.target
  if (!(target instanceof Element)) {
    openActionsTaskId.value = null
    return
  }
  const menuKey = `task-${openActionsTaskId.value}`
  if (!target.closest(`[data-task-actions-menu="${menuKey}"]`)) {
    openActionsTaskId.value = null
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

function openCreate() {
  editingTask.value = null
  closeActionsMenu()
  assigneeSearch.value = ''
  taskForm.value = {
    title: '',
    description: '',
    client_id: '',
    service_id: '',
    assigned_to: '',
    assigned_to_ids: [],
    assign_department: '',
    notify_ceo: false,
    status: 'in_progress',
    priority: 'medium',
    due_date: new Date().toISOString().slice(0, 10),
  }
  showTaskModal.value = true
}

function openEdit(row) {
  closeActionsMenu()
  editingTask.value = row
  assigneeSearch.value = ''
  taskForm.value = {
    title: row.title || '',
    description: row.description || '',
    client_id: row.client_id ? String(row.client_id) : '',
    service_id: row.service_id ? String(row.service_id) : '',
    assigned_to: row.assigned_to ? String(row.assigned_to) : '',
    assigned_to_ids: [],
    assign_department: '',
    notify_ceo: false,
    status: row.status || 'pending',
    priority: row.priority || 'medium',
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : '',
  }
  showTaskModal.value = true
}

async function saveTask() {
  const hasAssignee = editingTask.value
    ? Boolean(taskForm.value.assigned_to)
    : (Array.isArray(taskForm.value.assigned_to_ids) && taskForm.value.assigned_to_ids.length > 0) || Boolean(taskForm.value.assign_department)
  if (!taskForm.value.title || !hasAssignee || !taskForm.value.due_date) {
    toast.warning('Task title, assigned user(s), and due date are required.')
    return
  }
  savingTask.value = true
  try {
    const payload = {
      ...taskForm.value,
      client_id: taskForm.value.client_id || null,
      service_id: taskForm.value.service_id || null,
      assigned_to: Number(taskForm.value.assigned_to),
      assigned_to_ids: (taskForm.value.assigned_to_ids || []).map((id) => Number(id)).filter(Boolean),
      assign_department: taskForm.value.assign_department || null,
      notify_ceo: Boolean(taskForm.value.notify_ceo),
      status: editingTask.value ? taskForm.value.status : 'in_progress',
    }
    if (editingTask.value) {
      await updateTask(editingTask.value.id, payload)
      toast.success('Task updated.')
    } else {
      await createTask(payload)
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-primary-200">Tasks</h1>
        <p class="mt-1 text-sm text-gray-400">Central task management for all CRM work.</p>
      </div>
      <AppButton @click="openCreate">Create Task</AppButton>
    </div>

    <div class="flex flex-wrap gap-2">
      <button v-for="item in tabOptions" :key="item.value" type="button" class="rounded-lg px-3 py-2 text-sm font-medium" :class="tab === item.value ? 'bg-primary-500 text-gray-900' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'" @click="tab = item.value; applyFilters()">
        {{ item.label }}
      </button>
    </div>

    <div class="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm sm:grid-cols-5">
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
        <select v-model="employeeFilter" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="applyFilters">
          <option value="all">All Employees</option>
          <option v-for="user in assignableUsers" :key="user.id" :value="String(user.id)">{{ userLabel(user.id) }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-gray-400">Rows</label>
        <select v-model.number="pageSize" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="applyFilters">
          <option v-for="s in pageSizeOptions" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
    </div>

    <div class="space-y-3">
      <div v-for="row in tasks" :key="row.id" class="rounded-xl border p-4 shadow-sm" :class="[serviceCardClass(row), cardClass(row)]">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0 space-y-2 md:pr-4">
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-semibold text-primary-200">
                {{ row.title }}
              </h3>
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

  <AppModal :show="showTaskModal" :title="editingTask ? 'Edit Task' : 'Create Task'" @close="showTaskModal = false">
    <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveTask">
      <div class="sm:col-span-2"><AppInput v-model="taskForm.title" label="Task Title" required /></div>
      <div class="sm:col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-200">Description</label>
        <textarea v-model="taskForm.description" rows="3" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Client</label>
        <select v-model="taskForm.client_id" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option value="">No client</option>
          <option v-for="client in clients" :key="client.id" :value="String(client.id)">{{ client.company_name }}</option>
        </select>
      </div>
      <div v-if="taskForm.client_id">
        <label class="mb-1 block text-sm font-medium text-gray-200">Service</label>
        <select v-model="taskForm.service_id" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option value="">No service</option>
          <option v-for="service in formServices" :key="service.id" :value="String(service.id)">{{ typeLabel(service.service_type) }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Assign To</label>
        <template v-if="editingTask">
          <select v-model="taskForm.assigned_to" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
            <option value="" disabled>Select employee</option>
            <option v-for="user in assignableUsers" :key="user.id" :value="String(user.id)">{{ userLabel(user.id) }}</option>
          </select>
        </template>
        <template v-else>
          <div class="rounded-lg border border-gray-700 bg-gray-900 p-2">
            <input
              v-model="assigneeSearch"
              type="text"
              placeholder="Search employee"
              class="mb-2 block w-full rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-100"
            />
            <div class="max-h-36 space-y-1 overflow-y-auto pr-1">
              <label v-for="user in filteredAssignableUsers" :key="user.id" class="flex items-center gap-2 rounded px-2 py-1 text-sm text-gray-200 hover:bg-gray-800">
                <input v-model="taskForm.assigned_to_ids" type="checkbox" :value="String(user.id)" class="rounded border-gray-700 bg-gray-900" />
                <span>{{ userLabel(user.id) }}</span>
              </label>
              <p v-if="!filteredAssignableUsers.length" class="px-2 py-1 text-xs text-gray-400">No employee found.</p>
            </div>
            <p class="mt-2 text-xs text-gray-400">Selected: {{ taskForm.assigned_to_ids.length }}</p>
          </div>
        </template>
      </div>
      <div v-if="!editingTask">
        <label class="mb-1 block text-sm font-medium text-gray-200">Assign Department (optional)</label>
        <select v-model="taskForm.assign_department" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option value="">No department</option>
          <option v-for="dept in departmentOptions" :key="dept" :value="dept">{{ dept }}</option>
        </select>
        <p class="mt-1 text-xs text-gray-400">Creates tasks for all accounts linked to employees in this department.</p>
      </div>
      <div v-if="!editingTask" class="sm:col-span-2">
        <label class="inline-flex items-center gap-2 text-sm text-gray-200">
          <input v-model="taskForm.notify_ceo" type="checkbox" class="rounded border-gray-700 bg-gray-900" />
          <span>Notify CEO by email about this employee meeting/task</span>
        </label>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Priority</label>
        <select v-model="taskForm.priority" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option v-for="priority in priorityOptions" :key="priority.value" :value="priority.value">{{ priority.label }}</option>
        </select>
      </div>
      <div v-if="editingTask">
        <label class="mb-1 block text-sm font-medium text-gray-200">Status</label>
        <select v-model="taskForm.status" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option v-for="status in statusOptions" :key="status.value" :value="status.value">{{ status.label }}</option>
        </select>
      </div>
      <AppInput v-model="taskForm.due_date" type="date" label="Due Date" required />
    </form>

    <template #footer>
      <AppButton variant="secondary" @click="showTaskModal = false">Cancel</AppButton>
      <AppButton :loading="savingTask" @click="saveTask">{{ editingTask ? 'Update Task' : 'Create Task' }}</AppButton>
    </template>
  </AppModal>

  <AppModal :show="showCompleteModal" title="Complete Task" @close="showCompleteModal = false">
    <div class="space-y-4">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Completion Notes</label>
        <textarea v-model="completeNotes" rows="3" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Proof of Work</label>
        <input type="file" class="block w-full text-sm text-gray-300" @change="onProofSelected" />
      </div>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="showCompleteModal = false">Cancel</AppButton>
      <AppButton :loading="completing" @click="completeTaskAction">Mark Complete</AppButton>
    </template>
  </AppModal>

  <AppModal :show="showDetailsModal" title="Task Details" @close="showDetailsModal = false">
    <div v-if="selectedTask" class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold text-primary-200">{{ selectedTask.title }}</h3>
        <p class="mt-1 text-sm text-gray-300 whitespace-pre-wrap break-words">
          {{ selectedTask.description || 'No description.' }}
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-gray-800 bg-gray-950 p-3">
          <p class="text-xs text-gray-400">Status</p>
          <p class="mt-1 text-sm text-gray-200">{{ formatStatus(selectedTask.status) }}</p>
        </div>
        <div class="rounded-lg border border-gray-800 bg-gray-950 p-3">
          <p class="text-xs text-gray-400">Priority</p>
          <p class="mt-1 text-sm text-gray-200">{{ formatPriority(selectedTask.priority) }}</p>
        </div>
        <div class="rounded-lg border border-gray-800 bg-gray-950 p-3">
          <p class="text-xs text-gray-400">Due Date</p>
          <p class="mt-1 text-sm text-gray-200">{{ formatDate(selectedTask.due_date) }}</p>
        </div>
        <div class="rounded-lg border border-gray-800 bg-gray-950 p-3">
          <p class="text-xs text-gray-400">Service</p>
          <p class="mt-1 text-sm text-gray-200">{{ typeLabel(selectedTask.service_type) }}</p>
        </div>
        <div class="rounded-lg border border-gray-800 bg-gray-950 p-3 sm:col-span-2">
          <p class="text-xs text-gray-400">Client</p>
          <p class="mt-1 text-sm text-gray-200">{{ selectedTask.company_name || '-' }}</p>
        </div>
      </div>

      <div class="rounded-lg border border-gray-800 bg-gray-950 p-3">
        <p class="text-xs text-gray-400">Assigned Employees</p>
        <p class="mt-1 text-sm text-gray-200 break-words">{{ assigneeNames(selectedTask) }}</p>
      </div>
    </div>
    <template #footer>
      <AppButton variant="secondary" @click="showDetailsModal = false">Close</AppButton>
    </template>
  </AppModal>
</template>
