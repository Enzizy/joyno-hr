<script setup>
import { ref, onMounted, computed } from 'vue'
import { getAuditLogs } from '@/services/backendService'
import AppTable from '@/components/ui/AppTable.vue'

const list = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = 10

onMounted(load)

async function load() {
  loading.value = true
  try {
    const offset = (page.value - 1) * pageSize
    list.value = await getAuditLogs({ limit: pageSize, offset })
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function formatDate(value) {
  if (!value) return '-'
  const date = value?.toDate?.() || new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function titleize(text) {
  if (!text) return '-'
  return String(text)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function formatAction(action) {
  return titleize(action)
}

function formatTarget(table, id) {
  const name = titleize(table)
  if (!id && id !== 0) return name
  return `${name} #${id}`
}

function targetLabel(row) {
  if (row.target_table === 'employees') {
    const name = `${row.target_employee_first_name || ''} ${row.target_employee_last_name || ''}`.trim()
    return name || formatTarget(row.target_table, row.target_id)
  }
  if (row.target_table === 'users') {
    return row.target_user_email || formatTarget(row.target_table, row.target_id)
  }
  if (row.target_table === 'leave_requests') {
    const parts = []
    if (row.target_leave_employee_name) parts.push(row.target_leave_employee_name)
    if (row.target_leave_type_name) parts.push(row.target_leave_type_name)
    return parts.length ? parts.join(' • ') : formatTarget(row.target_table, row.target_id)
  }
  return formatTarget(row.target_table, row.target_id)
}

function userLabel(row) {
  const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim()
  if (fullName) return fullName
  if (row.email) return row.email
  if (row.user_id != null) return `User #${row.user_id}`
  return '-'
}

const rows = computed(() =>
  list.value.map((row) => ({
    ...row,
    timeLabel: formatDate(row.created_at),
    actionLabel: formatAction(row.action),
    targetLabel: targetLabel(row),
    userLabel: userLabel(row),
  }))
)

const canPrev = computed(() => page.value > 1)
const canNext = computed(() => list.value.length === pageSize)

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
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">Audit Logs</h1>
      <p class="mt-1 text-sm text-gray-400">System activity and changes.</p>
    </div>
    <AppTable :loading="loading">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Time</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">User</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Action</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Target</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in rows" :key="row.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.timeLabel }}</td>
          <td class="px-4 py-3 text-sm text-primary-200">{{ row.userLabel }}</td>
          <td class="px-4 py-3 text-sm text-primary-200">{{ row.actionLabel }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.targetLabel }}</td>
        </tr>
        <tr v-if="!list.length && !loading">
          <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">No audit logs.</td>
        </tr>
      </tbody>
    </AppTable>
    <div class="flex items-center justify-end gap-2">
      <button
        class="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200 transition hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canPrev || loading"
        @click="prevPage"
      >
        &larr;
      </button>
      <span class="text-sm text-gray-400">Page {{ page }}</span>
      <button
        class="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200 transition hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canNext || loading"
        @click="nextPage"
      >
        &rarr;
      </button>
    </div>
  </div>
</template>



