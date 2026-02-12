<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useToastStore } from '@/stores/toastStore'
import {
  getClients,
  createClient,
  updateClient,
  getClientConversations,
  createClientConversation,
} from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'

const toast = useToastStore()
const loading = ref(false)
const clients = ref([])
const total = ref(0)
const statusFilter = ref('all')
const searchQuery = ref('')
const pageSize = ref(10)
const page = ref(1)
const moreOpenId = ref(null)
const showClientModal = ref(false)
const editingClient = ref(null)
const savingClient = ref(false)
const openingConversationClientId = ref(null)

const showConversationModal = ref(false)
const conversationClient = ref(null)
const conversations = ref([])
const conversationLoading = ref(false)
const conversationSaving = ref(false)

const clientStatuses = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'inactive', label: 'Inactive' },
]

const packageOptions = [
  { value: 'basic', label: 'Basic' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'custom', label: 'Custom' },
]

const serviceOptions = [
  { value: 'social_media_management', label: 'Social Media' },
  { value: 'website_development', label: 'Website' },
]

const durationOptions = [
  { value: 3, label: '3 months' },
  { value: 6, label: '6 months' },
  { value: 12, label: '12 months' },
  { value: 24, label: '24 months' },
]

const pageSizeOptions = [10, 20, 50]

const clientForm = ref({
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
  address: '',
  status: 'active',
  package_name: 'standard',
  package_details: '',
  services: [],
  monthly_value: '',
  contract_start_date: '',
  contract_duration_months: 12,
  notes: '',
})

const conversationForm = ref({
  type: 'call',
  happened_at: '',
  summary: '',
  outcome: '',
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const offset = computed(() => (page.value - 1) * pageSize.value)
const computedContractEnd = computed(() => calculateContractEndDate(clientForm.value.contract_start_date, clientForm.value.contract_duration_months))
const emptyStateText = computed(() => {
  if (searchQuery.value.trim()) return `No clients match "${searchQuery.value.trim()}".`
  if (statusFilter.value !== 'all') {
    const label = clientStatuses.find((s) => s.value === statusFilter.value)?.label || statusFilter.value
    return `No ${label.toLowerCase()} clients found.`
  }
  return 'No clients found.'
})

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatMoney(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return '$0.00'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(num)
}

function packageLabel(value) {
  return packageOptions.find((item) => item.value === value)?.label || value || 'Custom'
}

function statusLabel(value) {
  return clientStatuses.find((item) => item.value === value)?.label || value || 'Unknown'
}

function serviceLabel(value) {
  return serviceOptions.find((item) => item.value === value)?.label || value
}

function serviceTone(value) {
  if (value === 'social_media_management') return 'bg-fuchsia-950 text-fuchsia-200 border-fuchsia-800'
  if (value === 'website_development') return 'bg-blue-950 text-blue-200 border-blue-800'
  return 'bg-gray-900 text-gray-200 border-gray-700'
}

function statusTone(status) {
  if (status === 'active') return 'bg-emerald-900/60 text-emerald-200'
  if (status === 'paused') return 'bg-amber-900/60 text-amber-200'
  return 'bg-gray-800 text-gray-300'
}

function contractWarning(row) {
  if (!row.contract_end_date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(row.contract_end_date)
  end.setHours(0, 0, 0, 0)
  const daysLeft = Math.floor((end - today) / (24 * 60 * 60 * 1000))
  if (daysLeft < 0) return { tone: 'bg-red-900/70 text-red-200', text: 'Expired' }
  if (daysLeft <= 30) return { tone: 'bg-red-900/70 text-red-200', text: `${daysLeft} days left` }
  if (daysLeft <= 60) return { tone: 'bg-amber-900/70 text-amber-200', text: `${daysLeft} days left` }
  return null
}

function normalizeServices(value) {
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

function calculateContractEndDate(startDate, durationMonths) {
  if (!startDate || !durationMonths) return ''
  const date = new Date(startDate)
  if (Number.isNaN(date.getTime())) return ''
  date.setMonth(date.getMonth() + Number(durationMonths))
  return date.toISOString().slice(0, 10)
}

function inferDurationMonths(startDate, endDate) {
  if (!startDate || !endDate) return 12
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 12
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  if ([3, 6, 12, 24].includes(months)) return months
  return 12
}

async function loadClients() {
  loading.value = true
  try {
    const data = await getClients({
      status: statusFilter.value,
      search: searchQuery.value.trim(),
      limit: pageSize.value,
      offset: offset.value,
    })
    const rows = Array.isArray(data) ? data : data.items || []
    clients.value = rows.map((row) => ({ ...row, services: normalizeServices(row.services) }))
    total.value = Array.isArray(data) ? rows.length : Number(data.total || 0)
    if (page.value > totalPages.value) {
      page.value = totalPages.value
      await loadClients()
    }
  } catch (err) {
    toast.error(err.message || 'Failed to load clients.')
  } finally {
    loading.value = false
  }
}

onMounted(loadClients)

async function applyFilters() {
  page.value = 1
  await loadClients()
}

async function changePage(nextPage) {
  const target = Math.min(Math.max(nextPage, 1), totalPages.value)
  if (target === page.value) return
  page.value = target
  await loadClients()
}

function openCreate() {
  editingClient.value = null
  clientForm.value = {
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    status: 'active',
    package_name: 'standard',
    package_details: '',
    services: [],
    monthly_value: '',
    contract_start_date: new Date().toISOString().slice(0, 10),
    contract_duration_months: 12,
    notes: '',
  }
  showClientModal.value = true
}

function openEdit(row) {
  editingClient.value = row
  clientForm.value = {
    company_name: row.company_name || '',
    contact_name: row.contact_name || '',
    email: row.email || '',
    phone: row.phone || '',
    address: row.address || '',
    status: row.status || 'active',
    package_name: row.package_name || 'custom',
    package_details: row.package_details || '',
    services: normalizeServices(row.services),
    monthly_value: row.monthly_value ?? '',
    contract_start_date: row.contract_start_date ? row.contract_start_date.slice(0, 10) : '',
    contract_duration_months: inferDurationMonths(row.contract_start_date, row.contract_end_date),
    notes: row.notes || '',
  }
  showClientModal.value = true
  moreOpenId.value = null
}

async function saveClient() {
  if (!clientForm.value.company_name || !clientForm.value.contact_name || !clientForm.value.email || !clientForm.value.contract_start_date) {
    toast.warning('Company, contact, email, and contract start date are required.')
    return
  }

  const payload = {
    ...clientForm.value,
    monthly_value: Number(clientForm.value.monthly_value || 0),
    contract_duration_months: Number(clientForm.value.contract_duration_months || 12),
    services: normalizeServices(clientForm.value.services),
    allow_services_update: false,
  }

  savingClient.value = true
  try {
    if (editingClient.value) {
      await updateClient(editingClient.value.id, payload)
      toast.success('Client updated.')
    } else {
      await createClient(payload)
      toast.success('Client created.')
    }
    showClientModal.value = false
    await loadClients()
  } catch (err) {
    toast.error(err.message || 'Failed to save client.')
  } finally {
    savingClient.value = false
  }
}

async function openConversations(row) {
  conversationClient.value = row
  conversationForm.value = { type: 'call', happened_at: '', summary: '', outcome: '' }
  showConversationModal.value = true
  conversationLoading.value = true
  openingConversationClientId.value = row.id
  moreOpenId.value = null
  try {
    conversations.value = await getClientConversations(row.id)
  } catch (err) {
    conversations.value = []
    toast.error(err.message || 'Failed to load conversations.')
  } finally {
    conversationLoading.value = false
    openingConversationClientId.value = null
  }
}

async function saveConversation() {
  if (!conversationClient.value) return
  if (!conversationForm.value.summary.trim()) {
    toast.warning('Conversation summary is required.')
    return
  }
  conversationSaving.value = true
  try {
    await createClientConversation(conversationClient.value.id, {
      ...conversationForm.value,
      happened_at: conversationForm.value.happened_at || new Date().toISOString(),
    })
    conversations.value = await getClientConversations(conversationClient.value.id)
    conversationForm.value = { type: 'call', happened_at: '', summary: '', outcome: '' }
    toast.success('Conversation logged.')
  } catch (err) {
    toast.error(err.message || 'Failed to save conversation.')
  } finally {
    conversationSaving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-primary-200">Clients</h1>
        <p class="mt-1 text-sm text-gray-400">Manage active and inactive client contracts.</p>
      </div>
      <AppButton @click="openCreate">Add Client</AppButton>
    </div>

    <div class="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm sm:grid-cols-4">
      <div class="sm:col-span-2">
        <label class="mb-1 block text-xs font-medium text-gray-400">Search</label>
        <input v-model="searchQuery" type="text" placeholder="Company, contact, email" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500" @keyup.enter="applyFilters" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-400">Status</label>
        <select v-model="statusFilter" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500" @change="applyFilters">
          <option value="all">All statuses</option>
          <option v-for="status in clientStatuses" :key="status.value" :value="status.value">{{ status.label }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-400">Rows</label>
        <select v-model.number="pageSize" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="applyFilters">
          <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
        </select>
      </div>
      <div class="sm:col-span-3 flex items-end">
        <AppButton variant="secondary" @click="applyFilters">Apply</AppButton>
      </div>
    </div>

    <div class="space-y-3">
      <div v-for="row in clients" :key="row.id" class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-semibold text-primary-200">{{ row.company_name }}</h3>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusTone(row.status)">{{ statusLabel(row.status) }}</span>
              <span v-if="contractWarning(row)" class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="contractWarning(row).tone">{{ contractWarning(row).text }}</span>
            </div>
            <p class="text-sm text-gray-300">{{ row.contact_name }}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
              <span>{{ row.email }}</span>
              <span v-if="row.phone">{{ row.phone }}</span>
              <span>{{ formatMoney(row.monthly_value) }}/mo</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span v-for="svc in normalizeServices(row.services)" :key="`${row.id}-${svc}`" class="rounded-full border px-2 py-0.5 text-xs" :class="serviceTone(svc)">{{ serviceLabel(svc) }}</span>
              <span class="rounded-full border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs text-gray-300">{{ packageLabel(row.package_name) }}</span>
            </div>
            <p class="text-xs text-gray-400">Contract: {{ formatDate(row.contract_start_date) }} - {{ formatDate(row.contract_end_date) }}</p>
          </div>

          <div class="relative flex items-center gap-2 self-start">
            <AppButton variant="ghost" size="sm" :loading="openingConversationClientId === row.id" @click="openConversations(row)">Conversation Log</AppButton>
            <button type="button" class="rounded-lg p-2 text-gray-300 hover:bg-gray-800" @click="moreOpenId = moreOpenId === row.id ? null : row.id">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6h.01M12 12h.01M12 18h.01" />
              </svg>
            </button>
            <div v-if="moreOpenId === row.id" class="absolute right-0 top-10 z-10 w-48 rounded-lg border border-gray-800 bg-gray-900 py-1 shadow-lg">
              <button type="button" class="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800" @click="openEdit(row)">Edit Client</button>
              <button type="button" class="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800" @click="openConversations(row)">View Conversations</button>
              <RouterLink :to="`/services?client=${row.id}`" class="block px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">View Services</RouterLink>
              <RouterLink :to="`/tasks?client=${row.id}`" class="block px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">View Tasks</RouterLink>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!clients.length && !loading" class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center text-sm text-gray-400">
        {{ emptyStateText }}
      </div>
    </div>

    <div class="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300">
      <span>Showing {{ clients.length ? offset + 1 : 0 }}-{{ offset + clients.length }} of {{ total }}</span>
      <div class="flex items-center gap-2">
        <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="changePage(page - 1)">Previous</AppButton>
        <span>Page {{ page }} / {{ totalPages }}</span>
        <AppButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="changePage(page + 1)">Next</AppButton>
      </div>
    </div>
  </div>

  <AppModal :show="showClientModal" :title="editingClient ? 'Edit Client' : 'Add New Client'" @close="showClientModal = false">
    <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveClient">
      <div class="sm:col-span-2"><AppInput v-model="clientForm.company_name" label="Company Name" required /></div>
      <div class="sm:col-span-2"><AppInput v-model="clientForm.contact_name" label="Contact Name" required /></div>
      <AppInput v-model="clientForm.email" type="email" label="Email" required />
      <AppInput v-model="clientForm.phone" label="Phone" />
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Status</label>
        <select v-model="clientForm.status" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100">
          <option v-for="status in clientStatuses" :key="status.value" :value="status.value">{{ status.label }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Package</label>
        <select v-model="clientForm.package_name" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100">
          <option v-for="pkg in packageOptions" :key="pkg.value" :value="pkg.value">{{ pkg.label }}</option>
        </select>
      </div>
      <div class="sm:col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-200">Package Details</label>
        <textarea v-model="clientForm.package_details" rows="2" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100" />
      </div>

      <div class="sm:col-span-2">
        <label class="mb-2 block text-sm font-medium text-gray-200">Services</label>
        <div class="flex flex-wrap gap-4 text-sm text-gray-200">
          <label v-for="svc in serviceOptions" :key="svc.value" class="inline-flex items-center gap-2">
            <input v-model="clientForm.services" :value="svc.value" type="checkbox" :disabled="Boolean(editingClient)" class="rounded border-gray-700 bg-gray-900" />
            <span>{{ svc.label }}</span>
          </label>
        </div>
        <p v-if="editingClient" class="mt-2 text-xs text-gray-400">Services cannot be changed here. Manage them in the Services section.</p>
      </div>

      <AppInput v-model="clientForm.monthly_value" type="number" label="Monthly Value ($)" />
      <AppInput v-model="clientForm.contract_start_date" type="date" label="Contract Start Date" required />

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Contract Duration</label>
        <select v-model="clientForm.contract_duration_months" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100">
          <option v-for="duration in durationOptions" :key="duration.value" :value="duration.value">{{ duration.label }}</option>
        </select>
      </div>
      <div class="self-end rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
        <p class="text-xs text-gray-400">Contract End</p>
        <p class="text-sm font-medium text-primary-200">{{ formatDate(computedContractEnd) }}</p>
      </div>

      <div class="sm:col-span-2"><AppInput v-model="clientForm.address" label="Address" /></div>

      <div class="sm:col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-200">Notes</label>
        <textarea v-model="clientForm.notes" rows="3" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100" />
      </div>
    </form>

    <template #footer>
      <AppButton variant="secondary" @click="showClientModal = false">Cancel</AppButton>
      <AppButton :loading="savingClient" @click="saveClient">{{ editingClient ? 'Update Client' : 'Add Client' }}</AppButton>
    </template>
  </AppModal>

  <AppModal :show="showConversationModal" title="Conversation Log" @close="showConversationModal = false">
    <div class="space-y-4">
      <div v-if="conversationClient" class="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
        {{ conversationClient.company_name }} - {{ conversationClient.contact_name }}
      </div>
      <div v-if="conversationLoading" class="text-sm text-gray-400">Loading conversations...</div>
      <div v-else class="space-y-2">
        <div v-for="entry in conversations" :key="entry.id" class="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-primary-200 capitalize">{{ entry.type || 'Other' }}</p>
            <p class="text-xs text-gray-400">{{ formatDateTime(entry.happened_at) }}</p>
          </div>
          <p class="mt-1 text-sm text-gray-300">{{ entry.summary }}</p>
          <p v-if="entry.outcome" class="mt-1 text-xs text-gray-400">Outcome: {{ entry.outcome }}</p>
        </div>
        <p v-if="!conversations.length" class="text-sm text-gray-400">No conversations logged yet.</p>
      </div>

      <div class="rounded-lg border border-gray-800 bg-gray-900 p-3">
        <h4 class="text-sm font-semibold text-primary-200">Log New Conversation</h4>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-200">Type</label>
            <select v-model="conversationForm.type" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="message">Message</option>
              <option value="other">Other</option>
            </select>
          </div>
          <AppInput v-model="conversationForm.happened_at" type="datetime-local" label="Date & Time" />
          <div class="sm:col-span-2">
            <label class="mb-1 block text-sm font-medium text-gray-200">Summary *</label>
            <textarea v-model="conversationForm.summary" rows="2" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" />
          </div>
          <div class="sm:col-span-2">
            <label class="mb-1 block text-sm font-medium text-gray-200">Outcome</label>
            <textarea v-model="conversationForm.outcome" rows="2" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" />
          </div>
        </div>
        <div class="mt-3 flex justify-end">
          <AppButton :loading="conversationSaving" @click="saveConversation">Save</AppButton>
        </div>
      </div>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="showConversationModal = false">Close</AppButton>
    </template>
  </AppModal>
</template>
