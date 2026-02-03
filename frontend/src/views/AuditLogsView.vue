<script setup>
import { ref, onMounted } from 'vue'
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
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Audit Logs</h1>
      <p class="mt-1 text-sm text-gray-500">System activity and changes.</p>
    </div>
    <AppTable :loading="loading">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Time</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">User</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Action</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Target</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200 bg-white">
        <tr v-for="row in list" :key="row.id" class="hover:bg-gray-50">
          <td class="px-4 py-3 text-sm text-gray-600">{{ row.created_at?.toDate?.()?.toLocaleString?.() ?? row.created_at ?? '—' }}</td>
          <td class="px-4 py-3 text-sm text-gray-900">{{ row.user_id ?? '—' }}</td>
          <td class="px-4 py-3 text-sm text-gray-900">{{ row.action }}</td>
          <td class="px-4 py-3 text-sm text-gray-600">{{ row.target_table }} #{{ row.target_id }}</td>
        </tr>
        <tr v-if="!list.length && !loading">
          <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-500">No audit logs.</td>
        </tr>
      </tbody>
    </AppTable>
  </div>
</template>
