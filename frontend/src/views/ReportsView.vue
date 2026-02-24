<script setup>
import { ref, computed } from 'vue'
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

function downloadPayrollSummary() {
  if (exporting.value) return
  exporting.value = true
  const params = new URLSearchParams()
  if (dateFrom.value) params.set('from', dateFrom.value)
  if (dateTo.value) params.set('to', dateTo.value)
  const url = `${API_BASE}/api/reports/leave-payroll.xlsx?${params.toString()}`
  const token = localStorage.getItem('token')
  fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (res) => {
      if (!res.ok) throw new Error('Failed to export payroll summary')
      const blob = await res.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const from = dateFrom.value || 'from'
      const to = dateTo.value || 'to'
      link.href = downloadUrl
      link.download = `leave-payroll-summary-${from}-to-${to}.xlsx`
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
      department: r.department || 'Unassigned',
      leave_type_name: r.leave_type_name || r.leave_type_id,
      leave_type_id: r.leave_type_id,
      start_date: r.start_date,
      end_date: r.end_date,
      created_at: r.created_at,
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

const leaveAging = computed(() => {
  const now = Date.now()
  const pendingRows = leaveData.value.filter((row) => row.status === 'pending')
  const counts = { '1_2': 0, '3_5': 0, over_5: 0 }
  pendingRows.forEach((row) => {
    const created = new Date(row.created_at || row.start_date).getTime()
    if (!Number.isFinite(created)) return
    const ageDays = Math.floor((now - created) / (24 * 60 * 60 * 1000))
    if (ageDays >= 1 && ageDays <= 2) counts['1_2'] += 1
    else if (ageDays >= 3 && ageDays <= 5) counts['3_5'] += 1
    else if (ageDays > 5) counts.over_5 += 1
  })
  return counts
})

const departmentImpact = computed(() => {
  const map = new Map()
  leaveData.value.forEach((row) => {
    const dept = row.department || 'Unassigned'
    if (!map.has(dept)) {
      map.set(dept, { department: dept, approved_paid_days: 0, approved_unpaid_days: 0, approved_requests: 0 })
    }
    const item = map.get(dept)
    if (row.status === 'approved') {
      item.approved_paid_days += Number(row.paid_days || 0)
      item.approved_unpaid_days += Number(row.unpaid_days || 0)
      item.approved_requests += 1
    }
  })
  return Array.from(map.values()).sort((a, b) => a.department.localeCompare(b.department))
})

const riskFlags = computed(() => {
  const map = new Map()
  leaveData.value.forEach((row) => {
    const key = String(row.employee_id ?? row.employee_name ?? '')
    if (!key) return
    if (!map.has(key)) {
      map.set(key, {
        employee_name: row.employee_name || row.employee_id,
        department: row.department || '-',
        approved_unpaid_days: 0,
        emergency_count: 0,
        short_notice_count: 0,
      })
    }
    const item = map.get(key)
    if (row.status === 'approved') {
      item.approved_unpaid_days += Number(row.unpaid_days || 0)
    }
    if (String(row.leave_type_name || '').toLowerCase().includes('emergency')) {
      item.emergency_count += 1
    }
    const created = new Date(row.created_at)
    const start = new Date(row.start_date)
    if (!Number.isNaN(created.getTime()) && !Number.isNaN(start.getTime())) {
      const noticeDays = Math.floor((start - created) / (24 * 60 * 60 * 1000))
      if (noticeDays <= 1) item.short_notice_count += 1
    }
  })
  return Array.from(map.values())
    .filter((item) => item.approved_unpaid_days >= 3 || item.emergency_count >= 2 || item.short_notice_count >= 2)
    .sort((a, b) => b.approved_unpaid_days - a.approved_unpaid_days)
})

const awolSummary = computed(() => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const today = new Date()
  const awolRows = leaveData.value.filter(
    (row) =>
      row.status === 'approved' &&
      String(row.leave_type_name || '').toLowerCase().includes('absent without official leave')
  )

  let activeNow = 0
  const perEmployee = new Map()
  awolRows.forEach((row) => {
    const start = new Date(row.start_date)
    const end = new Date(row.end_date)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (start <= today && today <= end) activeNow += 1
      const overlapsMonth = start <= monthEnd && end >= monthStart
      if (overlapsMonth) {
        const key = String(row.employee_id ?? row.employee_name ?? '')
        if (!perEmployee.has(key)) {
          perEmployee.set(key, { employee_name: row.employee_name || row.employee_id, awol_days: 0 })
        }
        const item = perEmployee.get(key)
        item.awol_days += Number(row.days || 0)
      }
    }
  })

  return {
    activeNow,
    rows: Array.from(perEmployee.values()).sort((a, b) => b.awol_days - a.awol_days),
  }
})
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
        Export Leave XLSX
      </AppButton>
      <AppButton variant="secondary" :disabled="!leaveData.length || exporting" :loading="exporting" @click="downloadPayrollSummary">
        Export Payroll Summary
      </AppButton>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
      <h2 class="text-sm font-semibold text-primary-200">Leave Aging (Pending Approvals)</h2>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
          <p class="text-xs text-gray-400">1-2 days pending</p>
          <p class="mt-1 text-lg font-semibold text-primary-200">{{ leaveAging['1_2'] }}</p>
        </div>
        <div class="rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
          <p class="text-xs text-gray-400">3-5 days pending</p>
          <p class="mt-1 text-lg font-semibold text-primary-200">{{ leaveAging['3_5'] }}</p>
        </div>
        <div class="rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
          <p class="text-xs text-gray-400">&gt;5 days pending</p>
          <p class="mt-1 text-lg font-semibold text-amber-300">{{ leaveAging.over_5 }}</p>
        </div>
      </div>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="border-b border-gray-800 px-4 py-3">
        <h2 class="text-sm font-semibold text-primary-200">Department Leave Impact</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-800">
          <thead class="bg-gray-950">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Department</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Approved requests</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Approved paid days</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Approved unpaid days</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800 bg-gray-900">
            <tr v-for="(row, i) in departmentImpact" :key="`dep-${i}`" class="hover:bg-gray-950">
              <td class="px-4 py-3 text-sm text-primary-200">{{ row.department }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.approved_requests }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.approved_paid_days }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.approved_unpaid_days }}</td>
            </tr>
            <tr v-if="!departmentImpact.length && !loading">
              <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">Run report to see department impact.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="border-b border-gray-800 px-4 py-3">
        <h2 class="text-sm font-semibold text-primary-200">Employee Leave Risk Flags</h2>
        <p class="mt-1 text-xs text-gray-400">Flags: unpaid days &ge; 3, emergency leaves &ge; 2, short-notice requests &ge; 2.</p>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-800">
          <thead class="bg-gray-950">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Employee</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Department</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Approved unpaid days</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Emergency count</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Short notice count</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800 bg-gray-900">
            <tr v-for="(row, i) in riskFlags" :key="`risk-${i}`" class="hover:bg-gray-950">
              <td class="px-4 py-3 text-sm text-primary-200">{{ row.employee_name }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.department }}</td>
              <td class="px-4 py-3 text-sm text-amber-300">{{ row.approved_unpaid_days }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.emergency_count }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.short_notice_count }}</td>
            </tr>
            <tr v-if="!riskFlags.length && !loading">
              <td colspan="5" class="px-4 py-8 text-center text-sm text-gray-400">No risk flags for selected range.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="border-b border-gray-800 px-4 py-3">
        <h2 class="text-sm font-semibold text-primary-200">AWOL Monitoring</h2>
        <p class="mt-1 text-xs text-gray-400">Active AWOL cases now: <span class="font-semibold text-amber-300">{{ awolSummary.activeNow }}</span></p>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-800">
          <thead class="bg-gray-950">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Employee</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">AWOL days (this month)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800 bg-gray-900">
            <tr v-for="(row, i) in awolSummary.rows" :key="`awol-${i}`" class="hover:bg-gray-950">
              <td class="px-4 py-3 text-sm text-primary-200">{{ row.employee_name }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.awol_days }}</td>
            </tr>
            <tr v-if="!awolSummary.rows.length && !loading">
              <td colspan="2" class="px-4 py-8 text-center text-sm text-gray-400">No AWOL records for selected range/month.</td>
            </tr>
          </tbody>
        </table>
      </div>
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


