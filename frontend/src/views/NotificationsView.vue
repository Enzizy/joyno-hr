<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import AppConfirmModal from '@/components/ui/AppConfirmModal.vue'
import AppModal from '@/components/ui/AppModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { getNotificationPreferences, updateNotificationPreferences } from '@/services/backendService'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useToastStore } from '@/stores/toastStore'

const router = useRouter()
const store = useNotificationStore()
const authStore = useAuthStore()
const toast = useToastStore()
const page = ref(1)
const pageSize = 20
const category = ref('')
const unreadOnly = ref(false)
const search = ref('')
const selectedIds = ref([])
const preferencesOpen = ref(false)
const preferencesLoading = ref(false)
const preferencesSaving = ref(false)
const deleteOpen = ref(false)
const deleteTarget = ref(null)
const preferences = ref({ email_delivery: 'immediate', leave_enabled: true, task_enabled: true, system_enabled: true })
let searchTimer

const categories = [
  { value: '', label: 'All updates' },
  { value: 'leave', label: 'Leave' },
  { value: 'task', label: 'Tasks & meetings' },
  { value: 'system', label: 'System' },
]
const totalPages = computed(() => Math.max(1, Math.ceil(store.total / pageSize)))
const allSelected = computed(() => store.items.length > 0 && store.items.every((item) => selectedIds.value.includes(item.id)))
const canManage = computed(() => ['admin', 'hr', 'ceo'].includes(authStore.role))

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function categoryLabel(item) {
  return categories.find((entry) => entry.value === item.category)?.label || 'System'
}

function resolveLink(item) {
  if (item.target_table === 'tasks') return authStore.role === 'employee' ? '/my-tasks' : '/tasks'
  if (item.target_table === 'leave_requests') return authStore.role === 'employee' ? '/leave-request' : '/leave-approvals'
  return item.target_table ? `/${item.target_table.replaceAll('_', '-')}` : null
}

function previewEntries(preview) {
  if (!preview) return []
  const labels = {
    employee_name: 'Employee', leave_type: 'Leave type', status: 'Status', start_date: 'From',
    end_date: 'To', title: 'Title', priority: 'Priority', due_date: 'Due', task_type: 'Type',
  }
  return Object.entries(preview)
    .filter(([, value]) => value !== null && value !== '')
    .slice(0, 4)
    .map(([key, value]) => ({ label: labels[key] || key, value }))
}

async function load() {
  await store.fetchList({
    limit: pageSize,
    offset: (page.value - 1) * pageSize,
    category: category.value || undefined,
    unreadOnly: unreadOnly.value,
    search: search.value.trim() || undefined,
  })
  selectedIds.value = []
}

function applyFilters() {
  page.value = 1
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 250)
}

async function openItem(item) {
  if (!item.is_read) await store.markRead(item.id)
  const link = resolveLink(item)
  if (link) await router.push(link)
}

function toggleAll() {
  selectedIds.value = allSelected.value ? [] : store.items.map((item) => item.id)
}

async function markSelectedRead() {
  await store.markManyRead(selectedIds.value)
  selectedIds.value = []
}

function requestDelete(item = null) {
  deleteTarget.value = item
  deleteOpen.value = true
}

async function confirmDelete() {
  if (deleteTarget.value) await store.remove(deleteTarget.value.id)
  else await store.removeMany(selectedIds.value)
  selectedIds.value = []
  deleteOpen.value = false
  deleteTarget.value = null
}

async function openPreferences() {
  preferencesOpen.value = true
  preferencesLoading.value = true
  try {
    preferences.value = await getNotificationPreferences()
  } catch (error) {
    toast.error(error.message || 'Unable to load email preferences.')
  } finally {
    preferencesLoading.value = false
  }
}

async function savePreferences() {
  preferencesSaving.value = true
  try {
    preferences.value = await updateNotificationPreferences(preferences.value)
    preferencesOpen.value = false
    if (preferences.value.unavailable) toast.warning('Email preferences will become active after the backend is deployed.')
    else toast.success('Notification preferences saved.')
  } catch (error) {
    toast.error(error.message || 'Unable to save preferences.')
  } finally {
    preferencesSaving.value = false
  }
}

async function changePage(nextPage) {
  page.value = nextPage
  await load()
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Notification center" description="Keep track of leave, work, and system activity without losing context." eyebrow="Workspace">
      <template #actions>
        <AppButton variant="secondary" @click="openPreferences">Email preferences</AppButton>
        <AppButton variant="secondary" @click="store.markAllRead">Mark all read</AppButton>
      </template>
    </PageHeader>

    <section class="surface-card overflow-hidden">
      <div class="border-b border-gray-800 p-4 sm:p-5">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex gap-2 overflow-x-auto pb-1">
            <button v-for="item in categories" :key="item.value || 'all'" type="button" class="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition" :class="category === item.value ? 'bg-primary-600 text-black' : 'bg-gray-800 text-gray-300 hover:text-gray-100'" @click="category = item.value; applyFilters()">{{ item.label }}</button>
          </div>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input v-model="search" class="form-control min-w-64" type="search" placeholder="Search notifications" @input="applyFilters" />
            <label class="inline-flex items-center gap-2 whitespace-nowrap text-sm text-gray-300"><input v-model="unreadOnly" type="checkbox" class="rounded border-gray-700" @change="applyFilters" /> Unread only</label>
          </div>
        </div>
        <div v-if="selectedIds.length" class="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-primary-900/20 p-3 text-sm text-gray-300">
          <strong>{{ selectedIds.length }} selected</strong>
          <AppButton size="sm" variant="secondary" @click="markSelectedRead">Mark read</AppButton>
          <AppButton size="sm" variant="danger" @click="requestDelete()">Delete</AppButton>
        </div>
      </div>

      <div v-if="store.loading" class="space-y-3 p-5"><div v-for="item in 4" :key="item" class="h-28 animate-pulse rounded-xl bg-gray-800" /></div>
      <EmptyState v-else-if="!store.items.length" title="You’re all caught up" description="No notifications match the current filters." />
      <div v-else class="divide-y divide-gray-800">
        <article v-for="item in store.items" :key="item.id" class="group flex gap-3 p-4 transition hover:bg-gray-800/30 sm:p-5" :class="!item.is_read && 'bg-primary-950/10'">
          <input v-model="selectedIds" type="checkbox" :value="item.id" class="mt-1 rounded border-gray-700" :aria-label="`Select ${item.title}`" />
          <button type="button" class="min-w-0 flex-1 text-left" @click="openItem(item)">
            <div class="flex flex-wrap items-center gap-2">
              <span v-if="!item.is_read" class="h-2 w-2 rounded-full bg-primary-500" />
              <span class="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{{ categoryLabel(item) }}</span>
              <time class="ml-auto text-xs text-gray-500">{{ formatDate(item.created_at) }}</time>
            </div>
            <h2 class="mt-2 text-sm font-semibold text-gray-100">{{ item.title }}</h2>
            <p class="mt-1 text-sm leading-6 text-gray-400">{{ item.message }}</p>
            <dl v-if="previewEntries(item.preview).length" class="mt-3 grid gap-2 rounded-lg border border-gray-800 bg-black/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div v-for="entry in previewEntries(item.preview)" :key="entry.label"><dt class="text-[10px] uppercase tracking-wide text-gray-600">{{ entry.label }}</dt><dd class="mt-0.5 truncate text-xs font-medium text-gray-300">{{ entry.value }}</dd></div>
            </dl>
          </button>
          <button type="button" class="self-start rounded-lg p-2 text-gray-600 opacity-0 transition hover:bg-red-950/30 hover:text-red-400 group-hover:opacity-100" aria-label="Delete notification" @click="requestDelete(item)">×</button>
        </article>
      </div>

      <div class="flex items-center justify-between border-t border-gray-800 px-4 py-3">
        <label class="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" :checked="allSelected" @change="toggleAll" /> Select page</label>
        <div class="flex items-center gap-2"><AppButton size="sm" variant="secondary" :disabled="page <= 1" @click="changePage(page - 1)">Previous</AppButton><span class="text-xs text-gray-500">{{ page }} / {{ totalPages }}</span><AppButton size="sm" variant="secondary" :disabled="page >= totalPages" @click="changePage(page + 1)">Next</AppButton></div>
      </div>
    </section>

    <AppModal :show="preferencesOpen" title="Email preferences" size="lg" @close="preferencesOpen = false">
      <div v-if="preferencesLoading" class="h-36 animate-pulse rounded-xl bg-gray-800" />
      <div v-else class="space-y-5">
        <p v-if="preferences.unavailable" class="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-300">The local UI is connected to the previous deployed API. These controls become active after the new backend is deployed.</p>
        <div><label class="form-label">Email delivery</label><select v-model="preferences.email_delivery" class="form-control"><option value="immediate">Send important updates immediately</option><option value="daily">One daily summary</option><option value="off">No notification emails</option></select><p class="form-help">In-app notifications remain available regardless of this setting.</p></div>
        <fieldset :disabled="preferences.email_delivery === 'off'" class="space-y-2"><legend class="form-label">Include these categories</legend><label v-for="option in [{key:'leave_enabled',label:'Leave updates'},{key:'task_enabled',label:'Tasks and meetings'},{key:'system_enabled',label:'System updates'}]" :key="option.key" class="flex items-center justify-between rounded-lg border border-gray-800 px-4 py-3 text-sm text-gray-300"><span>{{ option.label }}</span><input v-model="preferences[option.key]" type="checkbox" class="rounded border-gray-700" /></label></fieldset>
      </div>
      <template #footer><AppButton variant="secondary" @click="preferencesOpen = false">Cancel</AppButton><AppButton :loading="preferencesSaving" @click="savePreferences">Save preferences</AppButton></template>
    </AppModal>

    <AppConfirmModal :show="deleteOpen" title="Delete notification" :message="deleteTarget ? 'Delete this notification?' : `Delete ${selectedIds.length} selected notifications?`" confirm-text="Delete" @close="deleteOpen = false" @confirm="confirmDelete" />
  </div>
</template>
