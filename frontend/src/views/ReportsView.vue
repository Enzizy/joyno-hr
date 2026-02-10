<script setup>
import { ref } from 'vue'
import { getLeaveReport } from '@/services/firestore'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'

const dateFrom = ref(new Date().toISOString().slice(0, 10))
const dateTo = ref(new Date().toISOString().slice(0, 10))
const loading = ref(false)
const leaveData = ref([])

function csvEscape(value) {
  const str = value == null ? '' : String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function exportCsv() {
  if (!leaveData.value.length) return
  const headers = ['Employee', 'Leave type', 'Reason', 'Days']
  const rows = leaveData.value.map((row) => [
    row.employee_name ?? row.employee_id ?? '',
    row.leave_type_name ?? row.leave_type_id ?? '',
    row.reason ?? '',
    row.days ?? '',
  ])
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const from = dateFrom.value || 'from'
  const to = dateTo.value || 'to'
  link.href = url
  link.download = `leave-report-${from}-to-${to}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function loadLeave() {
  loading.value = true
  try {
    const rows = await getLeaveReport(dateFrom.value, dateTo.value)
    leaveData.value = rows.map((r) => ({
      employee_name: r.employee_name || r.employee_id,
      employee_id: r.employee_id,
      leave_type_name: r.leave_type_name || r.leave_type_id,
      leave_type_id: r.leave_type_id,
      reason: r.reason || '-',
      days: r.start_date && r.end_date ? Math.max(1, Math.ceil((new Date(r.end_date) - new Date(r.start_date)) / (24 * 60 * 60 * 1000)) + 1) : '-',
    }))
  } catch {
    leaveData.value = []
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">Reports</h1>
      <p class="mt-1 text-sm text-gray-400">Leave reports.</p>
    </div>
    <div class="flex flex-wrap items-end gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
      <AppDatePicker v-model="dateFrom" label="From" />
      <AppDatePicker v-model="dateTo" label="To" />
      <AppButton @click="loadLeave" :loading="loading">Run report</AppButton>
      <AppButton variant="secondary" :disabled="!leaveData.length" @click="exportCsv">Export CSV</AppButton>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div v-if="loading" class="flex justify-center py-12">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-800">
          <thead class="bg-gray-950">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Employee</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Leave type</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Reason</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Days</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800 bg-gray-900">
            <tr v-for="(row, i) in leaveData" :key="i" class="hover:bg-gray-950">
              <td class="px-4 py-3 text-sm text-primary-200">{{ row.employee_name ?? row.employee_id }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.leave_type_name ?? row.leave_type_id }}</td>
              <td class="px-4 py-3 text-sm text-gray-300 max-w-xs truncate" :title="row.reason">{{ row.reason }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.days ?? '-' }}</td>
            </tr>
            <tr v-if="!leaveData.length && !loading">
              <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">Run report to see data.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>


