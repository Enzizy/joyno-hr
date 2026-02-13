<script setup>
import { computed, onMounted, ref } from 'vue'
import { useToastStore } from '@/stores/toastStore'
import { getTasks, startTask, completeTask, getTaskProofUrl } from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'

const toast = useToastStore()

const loading = ref(false)
const tasks = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const tab = ref('active')
const searchQuery = ref('')

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

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const offset = computed(() => (page.value - 1) * pageSize.value)

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

async function loadTasks() {
  loading.value = true
  try {
    const data = await getTasks({
      tab: tab.value,
      search: searchQuery.value.trim(),
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
    toast.error(err.message || 'Failed to load my tasks.')
  } finally {
    loading.value = false
  }
}

onMounted(loadTasks)

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

async function startTaskAction(row) {
  actionLoadingId.value = row.id
  try {
    await startTask(row.id)
    toast.success('Task started.')
    await loadTasks()
  } catch (err) {
    toast.error(err.message || 'Failed to start task.')
  } finally {
    actionLoadingId.value = null
  }
}

function openComplete(row) {
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

function proofUrl(taskId) {
  return getTaskProofUrl(taskId)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">My Tasks</h1>
      <p class="mt-1 text-sm text-gray-400">Employee assigned work and completion updates.</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button v-for="item in tabOptions" :key="item.value" type="button" class="rounded-lg px-3 py-2 text-sm font-medium" :class="tab === item.value ? 'bg-primary-500 text-gray-900' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'" @click="tab = item.value; applyFilters()">
        {{ item.label }}
      </button>
    </div>

    <div class="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm sm:grid-cols-4">
      <div class="sm:col-span-2">
        <label class="mb-1 block text-xs text-gray-400">Search</label>
        <input v-model="searchQuery" type="text" placeholder="Search task title" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @keyup.enter="applyFilters" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-gray-400">Rows</label>
        <select v-model.number="pageSize" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="applyFilters">
          <option v-for="s in pageSizeOptions" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="flex items-end">
        <AppButton variant="secondary" @click="applyFilters">Apply</AppButton>
      </div>
    </div>

    <div class="space-y-3">
      <div v-for="row in tasks" :key="row.id" class="rounded-xl border p-4 shadow-sm" :class="[serviceCardClass(row), cardClass(row)]">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-semibold text-primary-200">{{ row.title }}</h3>
              <span class="rounded-full border px-2 py-0.5 text-xs font-semibold" :class="serviceBadgeClass(row.service_type)">
                {{ serviceBadgeLabel(row.service_type) }}
              </span>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="priorityTone(row.priority)">{{ formatPriority(row.priority) }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusTone(row.status)">{{ formatStatus(row.status) }}</span>
            </div>
            <p class="line-clamp-2 text-sm text-gray-300">{{ row.description || 'No description.' }}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
              <span>Due: {{ formatDate(row.due_date) }}</span>
              <span>Client: {{ row.company_name || '-' }}</span>
              <span>Service: {{ typeLabel(row.service_type) }}</span>
              <a v-if="row.proof_of_work_data" :href="proofUrl(row.id)" target="_blank" rel="noopener" class="text-primary-300 hover:text-primary-200">View proof</a>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <AppButton v-if="row.status === 'pending'" variant="secondary" size="sm" :loading="actionLoadingId === row.id" @click="startTaskAction(row)">Start Task</AppButton>
            <AppButton v-if="row.status === 'pending' || row.status === 'in_progress'" variant="primary" size="sm" @click="openComplete(row)">Mark Complete</AppButton>
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
</template>
