<script setup>
import { computed, onMounted, ref } from 'vue'
import { useNotificationStore } from '@/stores/notificationStore'
import { useAuthStore } from '@/stores/authStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppTable from '@/components/ui/AppTable.vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const store = useNotificationStore()
const authStore = useAuthStore()
const page = ref(1)
const pageSize = ref(20)
const typeFilter = ref('')
const unreadOnly = ref(false)
const selectedIds = ref([])

const totalPages = computed(() => Math.max(1, Math.ceil((store.total || 0) / pageSize.value)))
const isAdmin = computed(() => authStore.role === 'admin')
const typeOptions = computed(() => {
  const set = new Set()
  store.items.forEach((item) => {
    if (item.type) set.add(item.type)
  })
  return Array.from(set)
})
const allVisibleSelected = computed(
  () => store.items.length > 0 && store.items.every((item) => selectedIds.value.includes(item.id))
)
const hasSelection = computed(() => selectedIds.value.length > 0)

const canPrev = computed(() => page.value > 1)
const canNext = computed(() => page.value < totalPages.value)

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveLink(item) {
  if (item.target_table === 'tasks') return '/tasks'
  if (item.target_table === 'leave_requests') return '/leave-approvals'
  if (item.target_table === 'clients') return '/clients'
  if (item.target_table === 'leads') return '/leads'
  if (item.target_table === 'automation_rules') return '/automation'
  return null
}

async function load() {
  await store.fetchList({
    limit: pageSize.value,
    offset: (page.value - 1) * pageSize.value,
    type: typeFilter.value || undefined,
    unreadOnly: unreadOnly.value,
  })
  selectedIds.value = []
}

async function nextPage() {
  if (!canNext.value) return
  page.value += 1
  await load()
}

async function prevPage() {
  if (!canPrev.value) return
  page.value -= 1
  await load()
}

async function markAll() {
  await store.markAllRead()
}

function toggleSelectAll() {
  if (allVisibleSelected.value) {
    selectedIds.value = []
    return
  }
  selectedIds.value = store.items.map((item) => item.id)
}

async function markSelectedRead() {
  if (!selectedIds.value.length) return
  await store.markManyRead(selectedIds.value)
  selectedIds.value = []
}

async function runCleanup() {
  await store.runCleanup(90)
  await load()
}

async function openItem(item) {
  if (!item.is_read) await store.markRead(item.id)
  const link = resolveLink(item)
  if (link) await router.push(link)
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-primary-200">Notifications</h1>
        <p class="mt-1 text-sm text-gray-400">Unread alerts and activity notifications.</p>
      </div>
      <div class="flex gap-2">
        <AppButton v-if="isAdmin" variant="secondary" @click="runCleanup">Cleanup old read</AppButton>
        <AppButton variant="secondary" @click="markAll">Mark all read</AppButton>
      </div>
    </div>

    <div class="flex flex-wrap items-end gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div class="min-w-[180px]">
        <label class="mb-1 block text-xs font-medium text-gray-400">Type</label>
        <select
          v-model="typeFilter"
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
          @change="page = 1; load()"
        >
          <option value="">All types</option>
          <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
        </select>
      </div>
      <label class="inline-flex items-center gap-2 text-sm text-gray-300">
        <input v-model="unreadOnly" type="checkbox" class="rounded border-gray-700 bg-gray-900" @change="page = 1; load()" />
        Unread only
      </label>
      <AppButton variant="secondary" :disabled="!hasSelection" @click="markSelectedRead">Mark selected read</AppButton>
    </div>

    <AppTable :loading="store.loading">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">
            <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAll" />
          </th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Status</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Type</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Title</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Message</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Date</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="item in store.items" :key="item.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm">
            <input v-model="selectedIds" type="checkbox" :value="item.id" />
          </td>
          <td class="px-4 py-3 text-sm">
            <span
              class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="item.is_read ? 'bg-gray-800 text-gray-300' : 'bg-amber-900 text-amber-200'"
            >
              {{ item.is_read ? 'Read' : 'Unread' }}
            </span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-400">{{ item.type || '-' }}</td>
          <td class="px-4 py-3 text-sm text-primary-200">{{ item.title }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ item.message || '-' }}</td>
          <td class="px-4 py-3 text-sm text-gray-400">{{ formatDate(item.created_at) }}</td>
          <td class="px-4 py-3 text-right">
            <AppButton size="sm" variant="ghost" @click="openItem(item)">
              Open
            </AppButton>
          </td>
        </tr>
        <tr v-if="!store.items.length && !store.loading">
          <td colspan="7" class="px-4 py-8 text-center text-sm text-gray-400">No notifications.</td>
        </tr>
      </tbody>
    </AppTable>

    <div class="flex items-center justify-end gap-2">
      <button
        class="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200 transition hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canPrev"
        @click="prevPage"
      >
        &larr;
      </button>
      <span class="text-sm text-gray-400">Page {{ page }} / {{ totalPages }}</span>
      <button
        class="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200 transition hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canNext"
        @click="nextPage"
      >
        &rarr;
      </button>
    </div>
  </div>
</template>
