<script setup>
import { ref, onMounted, computed } from 'vue'
import { getAuditLogs } from '@/services/firestore'
import AppTable from '@/components/ui/AppTable.vue'

const list = ref([])
const loading = ref(false)

onMounted(load)

async function load() {
  loading.value = true
  try {
    list.value = await getAuditLogs()
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
    targetLabel: formatTarget(row.target_table, row.target_id),
    userLabel: userLabel(row),
  }))
)
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
  </div>
</template>


