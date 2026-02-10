<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { getPayslips } from '@/services/api'
import AppTable from '@/components/ui/AppTable.vue'
import AppButton from '@/components/ui/AppButton.vue'

const authStore = useAuthStore()
const list = ref([])
const loading = ref(false)
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const isEmployee = computed(() => authStore.role === 'employee')

onMounted(load)

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

function formatRange(start, end) {
  if (!start && !end) return '-'
  return `${formatDate(start)} - ${formatDate(end)}`
}

async function load() {
  loading.value = true
  try {
    const params = isEmployee.value ? { mine: 1 } : {}
    list.value = await getPayslips(params)
  } finally {
    loading.value = false
  }
}

async function downloadPdf(row) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}/api/payslips/${row.id}.pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `payslip-${row.id}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">Payslips</h1>
      <p class="mt-1 text-sm text-gray-400">View and download payslips.</p>
    </div>
    <AppTable :loading="loading">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Employee</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Period</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Base</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Allowance</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Gross</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Download</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in list" :key="row.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm text-primary-200">{{ row.employee_name || '-' }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ formatRange(row.period_start, row.period_end) }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ Number(row.base_salary || 0).toFixed(2) }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ Number(row.total_allowance || 0).toFixed(2) }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ Number(row.gross_pay || 0).toFixed(2) }}</td>
          <td class="px-4 py-3 text-right">
            <AppButton variant="secondary" size="sm" @click="downloadPdf(row)">PDF</AppButton>
          </td>
        </tr>
        <tr v-if="!list.length && !loading">
          <td colspan="6" class="px-4 py-8 text-center text-sm text-gray-400">No payslips yet.</td>
        </tr>
      </tbody>
    </AppTable>
  </div>
</template>
