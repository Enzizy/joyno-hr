<script setup>
import { computed, onMounted, ref } from 'vue'
import { useToastStore } from '@/stores/toastStore'
import {
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  toggleAutomationRule,
  runAutomationRuleNow,
  deleteAutomationRule,
  getClients,
  getServices,
  getUsers,
} from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppInput from '@/components/ui/AppInput.vue'

const toast = useToastStore()
const loading = ref(false)
const rules = ref([])
const clients = ref([])
const services = ref([])
const users = ref([])

const showModal = ref(false)
const editingRule = ref(null)
const saving = ref(false)
const actionLoadingId = ref(null)

const scheduleOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays Only' },
  { value: 'custom', label: 'Custom Days' },
]

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const dayOptions = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]

const form = ref({
  rule_name: '',
  client_id: '',
  service_id: '',
  task_title_template: '',
  task_description_template: '',
  assigned_to: '',
  priority: 'medium',
  schedule_type: 'daily',
  custom_days: [],
  start_date: '',
  end_date: '',
  is_active: true,
})

const formServices = computed(() => {
  if (!form.value.client_id) return []
  return services.value.filter((s) => Number(s.client_id) === Number(form.value.client_id))
})

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

function clientName(id) {
  return clients.value.find((c) => Number(c.id) === Number(id))?.company_name || `Client #${id}`
}

function userName(id) {
  const email = users.value.find((u) => Number(u.id) === Number(id))?.email
  return email ? email.split('@')[0] : `User #${id}`
}

function formatSchedule(rule) {
  if (rule.schedule_type === 'daily') return 'Daily'
  if (rule.schedule_type === 'weekdays') return 'Weekdays'
  if (rule.schedule_type === 'custom') return parseArray(rule.custom_days).map((d) => d.toUpperCase()).join(', ') || 'Custom'
  return rule.schedule_type
}

function isExpired(rule) {
  if (!rule.end_date) return false
  const today = new Date().toISOString().slice(0, 10)
  return String(rule.end_date).slice(0, 10) < today
}

function statusLabel(rule) {
  if (isExpired(rule)) return 'Expired'
  return rule.is_active ? 'Active' : 'Paused'
}

function statusTone(rule) {
  if (isExpired(rule)) return 'bg-gray-800 text-gray-300'
  return rule.is_active ? 'bg-emerald-900/60 text-emerald-200' : 'bg-gray-800 text-gray-300'
}

function typeLabel(serviceType) {
  if (serviceType === 'social_media_management') return 'Social Media'
  if (serviceType === 'website_development') return 'Website Dev'
  return serviceType || '-'
}

async function loadPage() {
  loading.value = true
  try {
    const [rulesRows, clientData, serviceRows, userRows] = await Promise.all([
      getAutomationRules({}),
      getClients({ status: 'active', limit: 100, offset: 0 }),
      getServices({}),
      getUsers(),
    ])
    rules.value = rulesRows.map((r) => ({ ...r, custom_days: parseArray(r.custom_days) }))
    clients.value = Array.isArray(clientData) ? clientData : clientData.items || []
    services.value = serviceRows
    users.value = userRows
  } catch (err) {
    toast.error(err.message || 'Failed to load automation rules.')
  } finally {
    loading.value = false
  }
}

onMounted(loadPage)

function onClientChange() {
  form.value.service_id = ''
  const client = clients.value.find((c) => Number(c.id) === Number(form.value.client_id))
  if (!form.value.end_date && client?.contract_end_date) {
    form.value.end_date = String(client.contract_end_date).slice(0, 10)
  }
}

function openCreate() {
  editingRule.value = null
  form.value = {
    rule_name: '',
    client_id: '',
    service_id: '',
    task_title_template: '',
    task_description_template: '',
    assigned_to: '',
    priority: 'medium',
    schedule_type: 'daily',
    custom_days: [],
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    is_active: true,
  }
  showModal.value = true
}

function openEdit(rule) {
  editingRule.value = rule
  form.value = {
    rule_name: rule.rule_name || '',
    client_id: rule.client_id ? String(rule.client_id) : '',
    service_id: rule.service_id ? String(rule.service_id) : '',
    task_title_template: rule.task_title_template || '',
    task_description_template: rule.task_description_template || '',
    assigned_to: rule.assigned_to ? String(rule.assigned_to) : '',
    priority: rule.priority || 'medium',
    schedule_type: rule.schedule_type || 'daily',
    custom_days: parseArray(rule.custom_days),
    start_date: rule.start_date ? String(rule.start_date).slice(0, 10) : '',
    end_date: rule.end_date ? String(rule.end_date).slice(0, 10) : '',
    is_active: Boolean(rule.is_active),
  }
  showModal.value = true
}

async function saveRule() {
  if (!form.value.rule_name || !form.value.client_id || !form.value.task_title_template || !form.value.assigned_to) {
    toast.warning('Rule name, client, task title, and assigned user are required.')
    return
  }
  saving.value = true
  try {
    const payload = {
      ...form.value,
      client_id: Number(form.value.client_id),
      service_id: form.value.service_id ? Number(form.value.service_id) : null,
      assigned_to: Number(form.value.assigned_to),
      custom_days: form.value.schedule_type === 'custom' ? form.value.custom_days : [],
    }
    if (editingRule.value) {
      await updateAutomationRule(editingRule.value.id, payload)
      toast.success('Automation rule updated.')
    } else {
      await createAutomationRule(payload)
      toast.success('Automation rule created.')
    }
    showModal.value = false
    await loadPage()
  } catch (err) {
    toast.error(err.message || 'Failed to save rule.')
  } finally {
    saving.value = false
  }
}

async function toggleRule(rule) {
  actionLoadingId.value = rule.id
  try {
    await toggleAutomationRule(rule.id)
    await loadPage()
  } catch (err) {
    toast.error(err.message || 'Failed to toggle rule.')
  } finally {
    actionLoadingId.value = null
  }
}

async function runNow(rule) {
  actionLoadingId.value = rule.id
  try {
    await runAutomationRuleNow(rule.id)
    toast.success('Task created successfully!')
  } catch (err) {
    toast.error(err.message || 'Failed to run rule now.')
  } finally {
    actionLoadingId.value = null
  }
}

async function removeRule(rule) {
  if (!confirm(`Delete automation rule "${rule.rule_name}"?`)) return
  actionLoadingId.value = rule.id
  try {
    await deleteAutomationRule(rule.id)
    toast.success('Rule deleted.')
    await loadPage()
  } catch (err) {
    toast.error(err.message || 'Failed to delete rule.')
  } finally {
    actionLoadingId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-xl border border-amber-700/50 bg-amber-900/20 p-4 text-sm text-amber-100">
      Automation rules create tasks automatically based on your schedule. Rules should usually end on the client's contract end date.
    </div>

    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-primary-200">Automation</h1>
        <p class="mt-1 text-sm text-gray-400">Create recurring rules that generate tasks.</p>
      </div>
      <AppButton @click="openCreate">Create Rule</AppButton>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div v-for="rule in rules" :key="rule.id" class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm" :class="isExpired(rule) ? 'opacity-60' : ''">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-primary-200">{{ rule.rule_name }}</h3>
            <p class="text-sm text-gray-300">"{{ rule.task_title_template }}"</p>
            <p class="mt-1 text-xs text-gray-400">Client: {{ clientName(rule.client_id) }} | Service: {{ typeLabel(rule.service_type) }}</p>
            <p class="text-xs text-gray-400">Assigned: {{ userName(rule.assigned_to) }} | {{ formatSchedule(rule) }}</p>
          </div>
          <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusTone(rule)">{{ statusLabel(rule) }}</span>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
          <span class="rounded border border-gray-700 px-2 py-0.5">Ends {{ rule.end_date || '-' }}</span>
          <span class="rounded border border-gray-700 px-2 py-0.5">Priority: {{ rule.priority }}</span>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <AppButton variant="secondary" size="sm" @click="openEdit(rule)">Edit Rule</AppButton>
          <AppButton variant="secondary" size="sm" :loading="actionLoadingId === rule.id" @click="runNow(rule)">Run Now</AppButton>
          <AppButton variant="danger" size="sm" :loading="actionLoadingId === rule.id" @click="removeRule(rule)">Delete</AppButton>
          <AppButton variant="ghost" size="sm" :disabled="isExpired(rule)" :loading="actionLoadingId === rule.id" @click="toggleRule(rule)">
            {{ rule.is_active ? 'Pause' : 'Activate' }}
          </AppButton>
        </div>
      </div>

      <div v-if="!rules.length && !loading" class="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center text-sm text-gray-400 lg:col-span-2">
        No automation rules yet.
      </div>
    </div>
  </div>

  <AppModal :show="showModal" :title="editingRule ? 'Edit Rule' : 'Create Rule'" @close="showModal = false">
    <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveRule">
      <div class="sm:col-span-2"><AppInput v-model="form.rule_name" label="Rule Name" required /></div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Client</label>
        <select v-model="form.client_id" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @change="onClientChange">
          <option value="" disabled>Select client</option>
          <option v-for="client in clients" :key="client.id" :value="String(client.id)">{{ client.company_name }}</option>
        </select>
      </div>
      <div v-if="form.client_id">
        <label class="mb-1 block text-sm font-medium text-gray-200">Service</label>
        <select v-model="form.service_id" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option value="">No service</option>
          <option v-for="service in formServices" :key="service.id" :value="String(service.id)">{{ typeLabel(service.service_type) }}</option>
        </select>
      </div>
      <div class="sm:col-span-2"><AppInput v-model="form.task_title_template" label="Task Title Template" required /></div>
      <div class="sm:col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-200">Task Description Template</label>
        <textarea v-model="form.task_description_template" rows="3" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Assign To</label>
        <select v-model="form.assigned_to" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option value="" disabled>Select user</option>
          <option v-for="user in users" :key="user.id" :value="String(user.id)">{{ user.email }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Priority</label>
        <select v-model="form.priority" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Schedule</label>
        <select v-model="form.schedule_type" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100">
          <option v-for="opt in scheduleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div v-if="form.schedule_type === 'custom'" class="sm:col-span-2">
        <label class="mb-2 block text-sm font-medium text-gray-200">Custom Days</label>
        <div class="flex flex-wrap gap-3">
          <label v-for="day in dayOptions" :key="day.value" class="inline-flex items-center gap-2 text-sm text-gray-300">
            <input v-model="form.custom_days" :value="day.value" type="checkbox" class="rounded border-gray-700 bg-gray-900" />
            <span>{{ day.label }}</span>
          </label>
        </div>
      </div>
      <AppInput v-model="form.start_date" type="date" label="Start Date" />
      <AppInput v-model="form.end_date" type="date" label="End Date" />
      <div class="sm:col-span-2">
        <label class="inline-flex items-center gap-2 text-sm text-gray-300">
          <input v-model="form.is_active" type="checkbox" class="rounded border-gray-700 bg-gray-900" />
          <span>Active</span>
        </label>
      </div>
    </form>

    <template #footer>
      <AppButton variant="secondary" @click="showModal = false">Cancel</AppButton>
      <AppButton :loading="saving" @click="saveRule">{{ editingRule ? 'Update Rule' : 'Create Rule' }}</AppButton>
    </template>
  </AppModal>
</template>
