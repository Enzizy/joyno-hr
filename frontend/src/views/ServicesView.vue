<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToastStore } from '@/stores/toastStore'
import { getServices, updateService, getClients, getUsers } from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'

const route = useRoute()
const toast = useToastStore()

const loading = ref(false)
const services = ref([])
const clients = ref([])
const users = ref([])
const typeFilter = ref('all')
const clientFilter = ref('all')
const searchQuery = ref('')
const showModal = ref(false)
const editingService = ref(null)
const saving = ref(false)

const form = ref({
  status: 'not_started',
  assigned_user_ids: [],
  platforms: [],
  website_url: '',
  progress: 0,
  notes: '',
})

const statusOptions = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'paused', label: 'Paused' },
]

const typeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'social_media_management', label: 'Social Media' },
  { value: 'website_development', label: 'Website Dev' },
]

const platformOptions = ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'youtube']

const clientOptions = computed(() => [{ id: 'all', company_name: 'All Clients' }, ...clients.value])

function parseArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function formatStatus(value) {
  return statusOptions.find((s) => s.value === value)?.label || value
}

function statusTone(value) {
  if (value === 'active') return 'bg-emerald-900/60 text-emerald-200'
  if (value === 'completed') return 'bg-sky-900/60 text-sky-200'
  if (value === 'paused') return 'bg-gray-800 text-gray-300'
  if (value === 'in_progress') return 'bg-amber-900/60 text-amber-200'
  return 'bg-gray-800 text-gray-300'
}

function labelEmployeeName(userId) {
  const user = users.value.find((u) => Number(u.id) === Number(userId))
  if (!user) return `User #${userId}`
  const first = (user.first_name || '').trim()
  const last = (user.last_name || '').trim()
  const fullName = `${first} ${last}`.trim()
  if (fullName) return fullName
  if (user.email) return user.email
  return `User #${userId}`
}

function typeLabel(value) {
  if (value === 'social_media_management') return 'Social Media Management'
  if (value === 'website_development') return 'Website Development'
  return value
}

async function loadPage() {
  loading.value = true
  try {
    const [serviceRows, clientData, userRows] = await Promise.all([
      getServices({
        search: searchQuery.value.trim(),
        type: typeFilter.value,
        client_id: clientFilter.value !== 'all' ? clientFilter.value : null,
      }),
      getClients({ status: 'active', limit: 100, offset: 0 }),
      getUsers(),
    ])
    services.value = serviceRows.map((s) => ({ ...s, assigned_user_ids: parseArray(s.assigned_user_ids), platforms: parseArray(s.platforms) }))
    clients.value = Array.isArray(clientData) ? clientData : clientData.items || []
    users.value = userRows
  } catch (err) {
    toast.error(err.message || 'Failed to load services.')
  } finally {
    loading.value = false
  }
}

function applyQueryClientFilter() {
  const q = Number.parseInt(route.query.client, 10)
  if (q) clientFilter.value = String(q)
}

onMounted(async () => {
  applyQueryClientFilter()
  await loadPage()
})

watch(() => route.query.client, async () => {
  applyQueryClientFilter()
  await loadPage()
})

function openManage(row) {
  editingService.value = row
  form.value = {
    status: row.status || 'not_started',
    assigned_user_ids: parseArray(row.assigned_user_ids),
    platforms: parseArray(row.platforms),
    website_url: row.website_url || '',
    progress: Number(row.progress || 0),
    notes: row.notes || '',
  }
  showModal.value = true
}

async function saveService() {
  if (!editingService.value) return
  saving.value = true
  try {
    await updateService(editingService.value.id, {
      ...form.value,
      service_type: editingService.value.service_type,
    })
    toast.success('Service updated.')
    showModal.value = false
    await loadPage()
  } catch (err) {
    toast.error(err.message || 'Failed to update service.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">Services</h1>
      <p class="mt-1 text-sm text-gray-400">Track and manage services delivered to each client.</p>
    </div>

    <div class="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm sm:grid-cols-4">
      <div class="sm:col-span-2">
        <label class="mb-1 block text-xs text-gray-400">Search</label>
        <input v-model="searchQuery" type="text" placeholder="Search by client" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @keyup.enter="loadPage" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-gray-400">Type</label>
        <select v-model="typeFilter" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="loadPage">
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-gray-400">Client</label>
        <select v-model="clientFilter" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="loadPage">
          <option v-for="client in clientOptions" :key="client.id" :value="String(client.id)">{{ client.company_name }}</option>
        </select>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div v-for="row in services" :key="row.id" class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-gray-400">{{ row.service_type === 'social_media_management' ? 'Share' : 'Globe' }}</p>
            <h3 class="text-lg font-semibold text-primary-200">{{ typeLabel(row.service_type) }}</h3>
            <p class="text-sm text-gray-300">{{ row.company_name }}</p>
          </div>
          <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusTone(row.status)">{{ formatStatus(row.status) }}</span>
        </div>

        <div class="mt-3 space-y-2 text-sm text-gray-300">
          <div v-if="row.service_type === 'social_media_management'" class="flex flex-wrap gap-2">
            <span v-for="platform in row.platforms" :key="platform" class="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs uppercase">{{ platform }}</span>
            <span v-if="!row.platforms.length" class="text-gray-400">No platforms selected.</span>
          </div>
          <div v-if="row.service_type === 'website_development'" class="space-y-1">
            <a v-if="row.website_url" :href="row.website_url" target="_blank" rel="noopener" class="text-primary-300 hover:text-primary-200">{{ row.website_url }}</a>
            <p v-else class="text-gray-400">No website URL set.</p>
            <div class="mt-2 h-2 w-full rounded bg-gray-800">
              <div class="h-2 rounded bg-primary-400" :style="`width:${Math.min(100, Math.max(0, Number(row.progress || 0)))}%`" />
            </div>
            <p class="text-xs text-gray-400">Progress: {{ Number(row.progress || 0) }}%</p>
          </div>

          <p class="text-xs text-gray-400">Assigned team: {{ row.assigned_user_ids.length ? row.assigned_user_ids.map(labelEmployeeName).join(', ') : 'None' }}</p>
        </div>

        <div class="mt-4 flex justify-end">
          <AppButton variant="secondary" size="sm" @click="openManage(row)">Manage Service</AppButton>
        </div>
      </div>

      <div v-if="!services.length && !loading" class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center text-sm text-gray-400 lg:col-span-2">
        No services found for the selected filters.
      </div>
    </div>
  </div>

  <AppModal :show="showModal" title="Manage Service" @close="showModal = false">
    <div class="space-y-4">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Status</label>
        <select v-model="form.status" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <div>
        <label class="mb-2 block text-sm font-medium text-gray-200">Assigned Employees</label>
        <div class="grid gap-2 sm:grid-cols-2">
          <label v-for="user in users" :key="user.id" class="inline-flex items-center gap-2 text-sm text-gray-300">
            <input v-model="form.assigned_user_ids" :value="user.id" type="checkbox" class="rounded border-gray-700 bg-gray-900" />
            <span>{{ labelEmployeeName(user.id) }}</span>
          </label>
        </div>
      </div>

      <div v-if="editingService?.service_type === 'social_media_management'">
        <label class="mb-2 block text-sm font-medium text-gray-200">Platforms</label>
        <div class="grid gap-2 sm:grid-cols-2">
          <label v-for="platform in platformOptions" :key="platform" class="inline-flex items-center gap-2 text-sm text-gray-300">
            <input v-model="form.platforms" :value="platform" type="checkbox" class="rounded border-gray-700 bg-gray-900" />
            <span class="uppercase">{{ platform }}</span>
          </label>
        </div>
      </div>

      <div v-if="editingService?.service_type === 'website_development'" class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Website URL</label>
          <input v-model="form.website_url" type="url" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Progress ({{ form.progress }}%)</label>
          <input v-model.number="form.progress" type="range" min="0" max="100" class="w-full" />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Notes</label>
        <textarea v-model="form.notes" rows="3" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" />
      </div>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="showModal = false">Cancel</AppButton>
      <AppButton :loading="saving" @click="saveService">Update Service</AppButton>
    </template>
  </AppModal>
</template>
