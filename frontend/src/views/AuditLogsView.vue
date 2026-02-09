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
        <tr v-for="row in list" :key="row.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.created_at?.toDate?.()?.toLocaleString?.() ?? row.created_at ?? '-' }}</td>
          <td class="px-4 py-3 text-sm text-primary-200">{{ row.user_id ?? '-' }}</td>
          <td class="px-4 py-3 text-sm text-primary-200">{{ row.action }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.target_table }} #{{ row.target_id }}</td>
        </tr>
        <tr v-if="!list.length && !loading">
          <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">No audit logs.</td>
        </tr>
      </tbody>
    </AppTable>
  </div>
</template>


