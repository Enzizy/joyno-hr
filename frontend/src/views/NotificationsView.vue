<script setup>
import { computed, onMounted, ref } from 'vue'
import { useNotificationStore } from '@/stores/notificationStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppTable from '@/components/ui/AppTable.vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const store = useNotificationStore()
const page = ref(1)
const pageSize = ref(20)

const totalPages = computed(() => Math.max(1, Math.ceil((store.total || 0) / pageSize.value)))

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
  await store.fetchList({ limit: pageSize.value, offset: (page.value - 1) * pageSize.value })
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
      <AppButton variant="secondary" @click="markAll">Mark all read</AppButton>
    </div>

    <AppTable :loading="store.loading">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Status</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Title</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Message</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Date</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="item in store.items" :key="item.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm">
            <span
              class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="item.is_read ? 'bg-gray-800 text-gray-300' : 'bg-amber-900 text-amber-200'"
            >
              {{ item.is_read ? 'Read' : 'Unread' }}
            </span>
          </td>
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
          <td colspan="5" class="px-4 py-8 text-center text-sm text-gray-400">No notifications.</td>
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

