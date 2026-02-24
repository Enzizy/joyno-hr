<script setup>
import { ref } from 'vue'
import { getLeaveReport } from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'

const dateFrom = ref(new Date().toISOString().slice(0, 10))
const dateTo = ref(new Date().toISOString().slice(0, 10))
const loading = ref(false)
const leaveData = ref([])
const exporting = ref(false)
const summaryData = ref([])

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

function downloadReport() {
  if (!leaveData.value.length || exporting.value) return
  exporting.value = true
  const params = new URLSearchParams()
  if (dateFrom.value) params.set('from', dateFrom.value)
  if (dateTo.value) params.set('to', dateTo.value)
  const url = `${API_BASE}/api/reports/leave.xlsx?${params.toString()}`
  const token = localStorage.getItem('token')
  fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (res) => {
      if (!res.ok) throw new Error('Failed to export report')
      const blob = await res.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const from = dateFrom.value || 'from'
      const to = dateTo.value || 'to'
      link.href = downloadUrl
      link.download = `leave-report-${from}-to-${to}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)
    })
    .catch(() => {})
    .finally(() => {
      exporting.value = false
    })
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
      status: r.status || 'pending',
      leave_pay_type: r.leave_pay_type || 'unpaid',
      paid_days: Number(r.paid_days || 0),
      unpaid_days: Number(r.unpaid_days || 0),
      reason: r.reason || '-',
      days: r.start_date && r.end_date ? Math.max(1, Math.ceil((new Date(r.end_date) - new Date(r.start_date)) / (24 * 60 * 60 * 1000)) + 1) : '-',
    }))

    const byEmployee = new Map()
    leaveData.value.forEach((row) => {
      const key = String(row.employee_id ?? row.employee_name ?? '')
      if (!key) return
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          employee_name: row.employee_name ?? row.employee_id,
          approved_paid_days: 0,
          approved_unpaid_days: 0,
          pending_days: 0,
          deductible_salary_days: 0,
        })
      }
      const item = byEmployee.get(key)
      if (row.status === 'approved') {
        item.approved_paid_days += Number(row.paid_days || 0)
        item.approved_unpaid_days += Number(row.unpaid_days || 0)
        item.deductible_salary_days += Number(row.unpaid_days || 0)
      } else if (row.status === 'pending') {
        item.pending_days += Number(row.days || 0)
      }
    })
    summaryData.value = Array.from(byEmployee.values()).sort((a, b) =>
      String(a.employee_name).localeCompare(String(b.employee_name))
    )
  } catch {
    leaveData.value = []
    summaryData.value = []
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
      <AppButton variant="secondary" :disabled="!leaveData.length || exporting" :loading="exporting" @click="downloadReport">
        Export XLSX
      </AppButton>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="border-b border-gray-800 px-4 py-3">
        <h2 class="text-sm font-semibold text-primary-200">Leave Salary Impact Summary</h2>
        <p class="mt-1 text-xs text-gray-400">
          Salary deduction basis uses approved unpaid leave days only.
        </p>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-800">
          <thead class="bg-gray-950">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Employee</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Approved paid days</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Approved unpaid days</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Pending days</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Deduct salary days</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800 bg-gray-900">
            <tr v-for="(row, i) in summaryData" :key="`sum-${i}`" class="hover:bg-gray-950">
              <td class="px-4 py-3 text-sm text-primary-200">{{ row.employee_name }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.approved_paid_days }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.approved_unpaid_days }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.pending_days }}</td>
              <td class="px-4 py-3 text-sm font-semibold text-amber-300">{{ row.deductible_salary_days }}</td>
            </tr>
            <tr v-if="!summaryData.length && !loading">
              <td colspan="5" class="px-4 py-8 text-center text-sm text-gray-400">Run report to see summary.</td>
            </tr>
          </tbody>
        </table>
      </div>
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
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Pay</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Paid days</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Unpaid days</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Reason</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Days</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800 bg-gray-900">
            <tr v-for="(row, i) in leaveData" :key="i" class="hover:bg-gray-950">
              <td class="px-4 py-3 text-sm text-primary-200">{{ row.employee_name ?? row.employee_id }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.leave_type_name ?? row.leave_type_id }}</td>
              <td class="px-4 py-3 text-sm text-gray-300 uppercase">{{ row.leave_pay_type }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.paid_days }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.unpaid_days }}</td>
              <td class="px-4 py-3 text-sm text-gray-300 max-w-xs truncate" :title="row.reason">{{ row.reason }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.days ?? '-' }}</td>
            </tr>
            <tr v-if="!leaveData.length && !loading">
              <td colspan="7" class="px-4 py-8 text-center text-sm text-gray-400">Run report to see data.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>


