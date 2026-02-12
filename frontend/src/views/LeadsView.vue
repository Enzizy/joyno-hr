<script setup>
import { computed, onMounted, ref } from 'vue'
import { useToastStore } from '@/stores/toastStore'
import {
  getLeads,
  createLead,
  updateLead,
  deleteLead,
  getLeadConversations,
  createLeadConversation,
  convertLead,
} from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'

const toast = useToastStore()
const loading = ref(false)
const leads = ref([])
const statusFilter = ref('all')
const sourceFilter = ref('all')
const searchQuery = ref('')
const moreOpenId = ref(null)
const showLeadModal = ref(false)
const editingLead = ref(null)
const showConversationModal = ref(false)
const conversationLead = ref(null)
const conversations = ref([])
const conversationLoading = ref(false)
const conversationSaving = ref(false)
const showConvertModal = ref(false)
const convertLeadRow = ref(null)
const converting = ref(false)

const leadStatuses = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
]

const sourceOptions = [
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
]

const serviceOptions = [
  { value: 'social_media', label: 'Social Media' },
  { value: 'website_dev', label: 'Website Dev' },
]

const leadForm = ref({
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
  source: '',
  status: 'new',
  interested_services: [],
  estimated_value: '',
  next_follow_up: '',
  notes: '',
})

const conversationForm = ref({
  type: 'call',
  happened_at: '',
  summary: '',
  outcome: '',
})

const convertForm = ref({
  package_name: 'standard',
  monthly_value: '',
  package_details: '',
  services: [],
  contract_start_date: '',
  contract_duration_months: 12,
  address: '',
})

const filteredLeads = computed(() => {
  let rows = leads.value
  if (statusFilter.value !== 'all') rows = rows.filter((row) => row.status === statusFilter.value)
  if (sourceFilter.value !== 'all') rows = rows.filter((row) => row.source === sourceFilter.value)
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter((row) => {
      const blob = `${row.company_name || ''} ${row.contact_name || ''} ${row.email || ''}`.toLowerCase()
      return blob.includes(q)
    })
  }
  return rows
})

function statusLabel(status) {
  return leadStatuses.find((item) => item.value === status)?.label || status
}

function sourceLabel(source) {
  return sourceOptions.find((item) => item.value === source)?.label || source || '-'
}

function serviceLabel(value) {
  return serviceOptions.find((item) => item.value === value)?.label || value
}

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

async function loadLeads() {
  loading.value = true
  try {
    leads.value = await getLeads()
  } catch (err) {
    toast.error(err.message || 'Failed to load leads.')
  } finally {
    loading.value = false
  }
}

onMounted(loadLeads)

function openCreate() {
  editingLead.value = null
  leadForm.value = {
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    source: '',
    status: 'new',
    interested_services: [],
    estimated_value: '',
    next_follow_up: '',
    notes: '',
  }
  showLeadModal.value = true
}

function openEdit(row) {
  editingLead.value = row
  leadForm.value = {
    company_name: row.company_name || '',
    contact_name: row.contact_name || '',
    email: row.email || '',
    phone: row.phone || '',
    source: row.source || '',
    status: row.status || 'new',
    interested_services: Array.isArray(row.interested_services) ? row.interested_services : [],
    estimated_value: row.estimated_value ?? '',
    next_follow_up: row.next_follow_up ? row.next_follow_up.slice(0, 10) : '',
    notes: row.notes || '',
  }
  showLeadModal.value = true
  moreOpenId.value = null
}

async function saveLead() {
  if (!leadForm.value.company_name || !leadForm.value.contact_name || !leadForm.value.email) {
    toast.warning('Company, contact, and email are required.')
    return
  }
  try {
    if (editingLead.value) {
      await updateLead(editingLead.value.id, leadForm.value)
      toast.success('Lead updated.')
    } else {
      await createLead(leadForm.value)
      toast.success('Lead added.')
    }
    showLeadModal.value = false
    await loadLeads()
  } catch (err) {
    toast.error(err.message || 'Failed to save lead.')
  }
}

async function removeLead(row) {
  moreOpenId.value = null
  if (!confirm(`Delete lead ${row.company_name}?`)) return
  try {
    await deleteLead(row.id)
    toast.success('Lead deleted.')
    await loadLeads()
  } catch (err) {
    toast.error(err.message || 'Failed to delete lead.')
  }
}

async function openConversations(row) {
  conversationLead.value = row
  conversationForm.value = { type: 'call', happened_at: '', summary: '', outcome: '' }
  showConversationModal.value = true
  conversationLoading.value = true
  moreOpenId.value = null
  try {
    conversations.value = await getLeadConversations(row.id)
  } catch (err) {
    conversations.value = []
    toast.error(err.message || 'Failed to load conversations.')
  } finally {
    conversationLoading.value = false
  }
}

async function saveConversation() {
  if (!conversationLead.value) return
  if (!conversationForm.value.summary.trim()) {
    toast.warning('Conversation summary is required.')
    return
  }
  conversationSaving.value = true
  try {
    await createLeadConversation(conversationLead.value.id, {
      ...conversationForm.value,
      happened_at: conversationForm.value.happened_at || new Date().toISOString(),
    })
    conversations.value = await getLeadConversations(conversationLead.value.id)
    conversationForm.value = { type: 'call', happened_at: '', summary: '', outcome: '' }
    toast.success('Conversation logged.')
  } catch (err) {
    toast.error(err.message || 'Failed to save conversation.')
  } finally {
    conversationSaving.value = false
  }
}

function openConvert(row) {
  convertLeadRow.value = row
  convertForm.value = {
    package_name: 'standard',
    monthly_value: '',
    package_details: '',
    services: [],
    contract_start_date: new Date().toISOString().slice(0, 10),
    contract_duration_months: 12,
    address: '',
  }
  showConvertModal.value = true
  moreOpenId.value = null
}

async function confirmConvert() {
  if (!convertLeadRow.value) return
  converting.value = true
  try {
    await convertLead(convertLeadRow.value.id, convertForm.value)
    toast.success('Lead converted to client.')
    showConvertModal.value = false
    await loadLeads()
  } catch (err) {
    toast.error(err.message || 'Failed to convert lead.')
  } finally {
    converting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-primary-200">Leads</h1>
        <p class="mt-1 text-sm text-gray-400">Manage potential clients before they convert.</p>
      </div>
      <AppButton @click="openCreate">Add Lead</AppButton>
    </div>

    <div class="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm sm:grid-cols-3">
      <div class="sm:col-span-2">
        <label class="mb-1 block text-xs font-medium text-gray-400">Search</label>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Company, contact, email"
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-400">Status</label>
        <select
          v-model="statusFilter"
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="all">All statuses</option>
          <option v-for="status in leadStatuses" :key="status.value" :value="status.value">{{ status.label }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-400">Source</label>
        <select
          v-model="sourceFilter"
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="all">All sources</option>
          <option v-for="source in sourceOptions" :key="source.value" :value="source.value">{{ source.label }}</option>
        </select>
      </div>
    </div>

    <div class="space-y-3">
      <div
        v-for="row in filteredLeads"
        :key="row.id"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm"
      >
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-semibold text-primary-200">{{ row.company_name }}</h3>
              <span class="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-primary-300">{{ statusLabel(row.status) }}</span>
            </div>
            <p class="mt-1 text-sm text-gray-300">{{ row.contact_name }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
              <span>{{ row.email }}</span>
              <span v-if="row.phone">{{ row.phone }}</span>
              <span v-if="row.next_follow_up">Follow-up: {{ formatDate(row.next_follow_up) }}</span>
              <span>Source: {{ sourceLabel(row.source) }}</span>
            </div>
            <div v-if="Array.isArray(row.interested_services) && row.interested_services.length" class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="svc in row.interested_services"
                :key="`${row.id}-${svc}`"
                class="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-300"
              >
                {{ serviceLabel(svc) }}
              </span>
            </div>
          </div>
          <div class="relative flex items-center gap-2">
            <AppButton
              v-if="row.status !== 'converted' && row.status !== 'lost'"
              variant="secondary"
              size="sm"
              @click="openConvert(row)"
            >
              Convert
            </AppButton>
            <AppButton variant="ghost" size="sm" @click="openConversations(row)">Conversation Log</AppButton>
            <button
              type="button"
              class="rounded-lg p-2 text-gray-300 hover:bg-gray-800"
              @click="moreOpenId = moreOpenId === row.id ? null : row.id"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6h.01M12 12h.01M12 18h.01" />
              </svg>
            </button>
            <div
              v-if="moreOpenId === row.id"
              class="absolute right-0 top-10 z-10 w-40 rounded-lg border border-gray-800 bg-gray-900 py-1 shadow-lg"
            >
              <button type="button" class="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800" @click="openEdit(row)">Edit Lead</button>
              <button type="button" class="block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800" @click="openConversations(row)">View Conversations</button>
              <button type="button" class="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-800" @click="removeLead(row)">Delete</button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!filteredLeads.length && !loading" class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center text-sm text-gray-400">
        No leads found.
      </div>
    </div>
  </div>

  <AppModal :show="showLeadModal" :title="editingLead ? 'Edit Lead' : 'Add New Lead'" @close="showLeadModal = false">
    <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveLead">
      <div class="sm:col-span-2"><AppInput v-model="leadForm.company_name" label="Company Name" required /></div>
      <div class="sm:col-span-2"><AppInput v-model="leadForm.contact_name" label="Contact Name" required /></div>
      <AppInput v-model="leadForm.email" type="email" label="Email" required />
      <AppInput v-model="leadForm.phone" label="Phone" />
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Source</label>
        <select v-model="leadForm.source" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100">
          <option value="">Select source</option>
          <option v-for="source in sourceOptions" :key="source.value" :value="source.value">{{ source.label }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Status</label>
        <select v-model="leadForm.status" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100">
          <option v-for="status in leadStatuses" :key="status.value" :value="status.value">{{ status.label }}</option>
        </select>
      </div>
      <div class="sm:col-span-2">
        <label class="mb-2 block text-sm font-medium text-gray-200">Interested Services</label>
        <div class="flex flex-wrap gap-4 text-sm text-gray-200">
          <label v-for="svc in serviceOptions" :key="svc.value" class="inline-flex items-center gap-2">
            <input v-model="leadForm.interested_services" :value="svc.value" type="checkbox" class="rounded border-gray-700 bg-gray-900" />
            <span>{{ svc.label }}</span>
          </label>
        </div>
      </div>
      <AppInput v-model="leadForm.estimated_value" type="number" label="Estimated Value ($)" />
      <AppInput v-model="leadForm.next_follow_up" type="date" label="Next Follow-up" />
      <div class="sm:col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-200">Notes</label>
        <textarea v-model="leadForm.notes" rows="3" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100" />
      </div>
    </form>
    <template #footer>
      <AppButton variant="secondary" @click="showLeadModal = false">Cancel</AppButton>
      <AppButton @click="saveLead">{{ editingLead ? 'Update Lead' : 'Add Lead' }}</AppButton>
    </template>
  </AppModal>

  <AppModal :show="showConversationModal" title="Conversation Log" @close="showConversationModal = false">
    <div class="space-y-4">
      <div v-if="conversationLead" class="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
        {{ conversationLead.company_name }} - {{ conversationLead.contact_name }}
      </div>
      <div v-if="conversationLoading" class="text-sm text-gray-400">Loading conversations...</div>
      <div v-else class="space-y-2">
        <div
          v-for="entry in conversations"
          :key="entry.id"
          class="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2"
        >
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

  <AppModal :show="showConvertModal" title="Convert to Client" @close="showConvertModal = false">
    <div v-if="convertLeadRow" class="space-y-4">
      <div class="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
        {{ convertLeadRow.company_name }} - {{ convertLeadRow.contact_name }} - {{ convertLeadRow.email }}
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Package</label>
          <select v-model="convertForm.package_name" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
            <option value="basic">Basic</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
            <option value="enterprise">Enterprise</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <AppInput v-model="convertForm.monthly_value" type="number" label="Monthly Value ($)" />
        <div class="sm:col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-200">Package Details</label>
          <textarea v-model="convertForm.package_details" rows="2" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" />
        </div>
        <div class="sm:col-span-2">
          <label class="mb-2 block text-sm font-medium text-gray-200">Services</label>
          <div class="flex flex-wrap gap-4 text-sm text-gray-200">
            <label class="inline-flex items-center gap-2">
              <input v-model="convertForm.services" value="social_media_management" type="checkbox" class="rounded border-gray-700 bg-gray-900" />
              <span>Social Media Management</span>
            </label>
            <label class="inline-flex items-center gap-2">
              <input v-model="convertForm.services" value="website_development" type="checkbox" class="rounded border-gray-700 bg-gray-900" />
              <span>Website Development</span>
            </label>
          </div>
        </div>
        <AppInput v-model="convertForm.contract_start_date" type="date" label="Contract Start Date" />
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Contract Duration</label>
          <select v-model="convertForm.contract_duration_months" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
            <option :value="3">3 months</option>
            <option :value="6">6 months</option>
            <option :value="12">12 months</option>
            <option :value="24">24 months</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <AppInput v-model="convertForm.address" label="Address" />
        </div>
      </div>
    </div>
    <template #footer>
      <AppButton variant="secondary" @click="showConvertModal = false">Cancel</AppButton>
      <AppButton :loading="converting" @click="confirmConvert">Convert to Client</AppButton>
    </template>
  </AppModal>
</template>

