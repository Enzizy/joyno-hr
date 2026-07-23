<script setup>
import { computed, onMounted, ref } from 'vue'
import { getLeaveReport } from '@/services/backendService'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppTable from '@/components/ui/AppTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const toast = useToastStore()
const now = new Date()
const dateFrom = ref(toISO(new Date(now.getFullYear(), now.getMonth(), 1)))
const dateTo = ref(toISO(now))
const loading = ref(false)
const exporting = ref(false)
const hasRun = ref(false)
const dateError = ref('')
const leaveData = ref([])
const activeTab = ref('overview')

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Leave records' },
  { id: 'risks', label: 'Risk flags' },
  { id: 'awol', label: 'AWOL' },
]

function toISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function setRange(range) {
  const today = new Date()
  if (range === 'month') dateFrom.value = toISO(new Date(today.getFullYear(), today.getMonth(), 1))
  if (range === 'quarter') dateFrom.value = toISO(new Date(today.getFullYear(), today.getMonth() - 2, 1))
  if (range === 'year') dateFrom.value = toISO(new Date(today.getFullYear(), 0, 1))
  dateTo.value = toISO(today)
  loadLeave()
}

async function loadLeave() {
  if (!dateFrom.value || !dateTo.value) {
    dateError.value = 'Select both dates.'
    return
  }
  if (dateFrom.value > dateTo.value) {
    dateError.value = 'The start date must be before the end date.'
    return
  }
  dateError.value = ''
  loading.value = true
  try {
    const rows = await getLeaveReport(dateFrom.value, dateTo.value)
    leaveData.value = rows
      .filter((row) => String(row.status || '').toLowerCase() === 'approved')
      .map((row) => ({
        ...row,
        employee_name: row.employee_name || row.employee_id,
        department: row.department || 'Unassigned',
        leave_type_name: row.leave_type_name || row.leave_type_id,
        leave_pay_type: row.leave_pay_type || 'unpaid',
        paid_days: Number(row.paid_days || 0),
        unpaid_days: Number(row.unpaid_days || 0),
        reason: row.reason || '-',
        days: Number(row.leave_days || 0) || (row.start_date && row.end_date
          ? Math.max(1, Math.ceil((new Date(row.end_date) - new Date(row.start_date)) / 86400000) + 1)
          : 0),
      }))
    hasRun.value = true
  } catch (error) {
    leaveData.value = []
    toast.error(error.message || 'Unable to generate the leave report.')
  } finally {
    loading.value = false
  }
}

const metrics = computed(() => ({
  requests: leaveData.value.length,
  paidDays: leaveData.value.reduce((sum, row) => sum + row.paid_days, 0),
  unpaidDays: leaveData.value.reduce((sum, row) => sum + row.unpaid_days, 0),
  employees: new Set(leaveData.value.map((row) => row.employee_id || row.employee_name)).size,
}))

const employeeSummary = computed(() => {
  const map = new Map()
  for (const row of leaveData.value) {
    const key = String(row.employee_id || row.employee_name)
    if (!map.has(key)) map.set(key, { employee_name: row.employee_name, paid_days: 0, unpaid_days: 0, requests: 0 })
    const item = map.get(key)
    item.paid_days += row.paid_days
    item.unpaid_days += row.unpaid_days
    item.requests += 1
  }
  return [...map.values()].sort((a, b) => b.unpaid_days - a.unpaid_days || a.employee_name.localeCompare(b.employee_name))
})

const departmentImpact = computed(() => {
  const map = new Map()
  for (const row of leaveData.value) {
    if (!map.has(row.department)) map.set(row.department, { department: row.department, paid_days: 0, unpaid_days: 0, requests: 0 })
    const item = map.get(row.department)
    item.paid_days += row.paid_days
    item.unpaid_days += row.unpaid_days
    item.requests += 1
  }
  return [...map.values()].sort((a, b) => b.requests - a.requests)
})

const riskFlags = computed(() => {
  const map = new Map()
  for (const row of leaveData.value) {
    const key = String(row.employee_id || row.employee_name)
    if (!map.has(key)) map.set(key, { employee_name: row.employee_name, department: row.department, unpaid_days: 0, emergency_count: 0, short_notice_count: 0 })
    const item = map.get(key)
    item.unpaid_days += row.unpaid_days
    if (String(row.leave_type_name).toLowerCase().includes('emergency')) item.emergency_count += 1
    const filed = new Date(row.created_at)
    const starts = new Date(row.start_date)
    if (!Number.isNaN(filed.getTime()) && !Number.isNaN(starts.getTime()) && Math.floor((starts - filed) / 86400000) <= 1) item.short_notice_count += 1
  }
  return [...map.values()].filter((item) => item.unpaid_days >= 3 || item.emergency_count >= 2 || item.short_notice_count >= 2)
})

const awolSummary = computed(() => {
  const rows = leaveData.value.filter((row) => String(row.leave_type_name).toLowerCase().includes('absent without official leave'))
  const today = toISO(new Date())
  return { active: rows.filter((row) => row.start_date <= today && row.end_date >= today).length, rows }
})

async function exportFile(endpoint, filename) {
  if (!leaveData.value.length || exporting.value) return
  exporting.value = true
  try {
    const params = new URLSearchParams({ from: dateFrom.value, to: dateTo.value })
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_BASE}${endpoint}?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!response.ok) throw new Error('Export failed')
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}-${dateFrom.value}-to-${dateTo.value}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success('Report downloaded.')
  } catch (error) {
    toast.error(error.message || 'Unable to export the report.')
  } finally {
    exporting.value = false
  }
}

onMounted(loadLeave)
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Leave Reports" description="Review approved leave, payroll impact, department patterns, and attendance risks." eyebrow="Analytics" />

    <section class="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-sm">
      <div class="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <AppDatePicker v-model="dateFrom" name="report-from" label="From" :max="dateTo" />
        <AppDatePicker v-model="dateTo" name="report-to" label="To" :min="dateFrom" />
        <AppButton :loading="loading" @click="loadLeave">Generate report</AppButton>
      </div>
      <p v-if="dateError" class="mt-2 text-sm text-red-400">{{ dateError }}</p>
      <div class="mt-4 flex flex-col gap-3 border-t border-gray-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-2"><span class="py-1.5 text-xs text-gray-500">Quick range:</span><button v-for="range in [{ id: 'month', label: 'This month' }, { id: 'quarter', label: 'Last 3 months' }, { id: 'year', label: 'This year' }]" :key="range.id" type="button" class="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700" @click="setRange(range.id)">{{ range.label }}</button></div>
        <div class="flex flex-wrap gap-2"><AppButton variant="secondary" size="sm" :disabled="!leaveData.length" :loading="exporting" @click="exportFile('/api/reports/leave.xlsx', 'leave-report')">Export details</AppButton><AppButton variant="secondary" size="sm" :disabled="!leaveData.length" :loading="exporting" @click="exportFile('/api/reports/leave-payroll.xlsx', 'leave-payroll')">Export payroll</AppButton></div>
      </div>
    </section>

    <div v-if="loading" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading report"><div v-for="item in 4" :key="item" class="h-28 animate-pulse rounded-xl bg-gray-800" /></div>
    <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="item in [{ label: 'Approved requests', value: metrics.requests, tone: 'text-primary-200' }, { label: 'Employees on leave', value: metrics.employees, tone: 'text-blue-300' }, { label: 'Approved paid days', value: metrics.paidDays, tone: 'text-emerald-300' }, { label: 'Salary deduction days', value: metrics.unpaidDays, tone: 'text-amber-300' }]" :key="item.label" class="rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-xs font-medium uppercase tracking-wider text-gray-500">{{ item.label }}</p><p class="mt-2 text-2xl font-semibold" :class="item.tone">{{ item.value }}</p></article>
    </div>

    <section class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="overflow-x-auto border-b border-gray-800 px-3 pt-3"><div class="flex min-w-max gap-1" role="tablist" aria-label="Report sections"><button v-for="tab in tabs" :key="tab.id" type="button" class="rounded-t-lg px-4 py-2.5 text-sm font-semibold" :class="activeTab === tab.id ? 'bg-gray-800 text-primary-200' : 'text-gray-400 hover:text-gray-200'" @click="activeTab = tab.id">{{ tab.label }}<span v-if="tab.id === 'risks' && riskFlags.length" class="ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">{{ riskFlags.length }}</span></button></div></div>

      <div v-if="activeTab === 'overview'" class="grid gap-5 p-5 xl:grid-cols-2">
        <div><div class="mb-3"><h2 class="font-semibold text-primary-200">Salary impact by employee</h2><p class="mt-1 text-xs text-gray-500">Only approved unpaid days are deducted.</p></div><div class="space-y-2 md:hidden"><EmptyState v-if="!employeeSummary.length" compact title="No approved leave" description="No salary impact exists for this range." /><article v-for="row in employeeSummary" :key="row.employee_name" class="rounded-xl border border-gray-800 bg-gray-950/40 p-4"><p class="break-words font-medium text-gray-100">{{ row.employee_name }}</p><div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div class="rounded-lg bg-gray-900 p-2"><strong class="block text-gray-200">{{ row.requests }}</strong><span class="text-gray-500">Requests</span></div><div class="rounded-lg bg-gray-900 p-2"><strong class="block text-emerald-300">{{ row.paid_days }}</strong><span class="text-gray-500">Paid</span></div><div class="rounded-lg bg-gray-900 p-2"><strong class="block text-amber-300">{{ row.unpaid_days }}</strong><span class="text-gray-500">Deduct</span></div></div></article></div><AppTable class="hidden md:block"><thead class="bg-gray-950"><tr><th class="table-heading">Employee</th><th class="table-heading">Requests</th><th class="table-heading">Paid</th><th class="table-heading">Deduct</th></tr></thead><tbody class="divide-y divide-gray-800"><tr v-for="row in employeeSummary" :key="row.employee_name"><td class="table-cell font-medium text-gray-100">{{ row.employee_name }}</td><td class="table-cell">{{ row.requests }}</td><td class="table-cell text-emerald-300">{{ row.paid_days }}</td><td class="table-cell text-amber-300">{{ row.unpaid_days }}</td></tr><tr v-if="!employeeSummary.length"><td colspan="4" class="p-4"><EmptyState compact title="No approved leave" description="No salary impact exists for this range." /></td></tr></tbody></AppTable></div>
        <div><div class="mb-3"><h2 class="font-semibold text-primary-200">Department impact</h2><p class="mt-1 text-xs text-gray-500">Approved leave grouped by department.</p></div><div class="space-y-2 md:hidden"><EmptyState v-if="!departmentImpact.length" compact title="No department impact" description="Approved leave will appear here." /><article v-for="row in departmentImpact" :key="row.department" class="rounded-xl border border-gray-800 bg-gray-950/40 p-4"><p class="font-medium text-gray-100">{{ row.department }}</p><div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div class="rounded-lg bg-gray-900 p-2"><strong class="block text-gray-200">{{ row.requests }}</strong><span class="text-gray-500">Requests</span></div><div class="rounded-lg bg-gray-900 p-2"><strong class="block text-emerald-300">{{ row.paid_days }}</strong><span class="text-gray-500">Paid</span></div><div class="rounded-lg bg-gray-900 p-2"><strong class="block text-amber-300">{{ row.unpaid_days }}</strong><span class="text-gray-500">Unpaid</span></div></div></article></div><AppTable class="hidden md:block"><thead class="bg-gray-950"><tr><th class="table-heading">Department</th><th class="table-heading">Requests</th><th class="table-heading">Paid</th><th class="table-heading">Unpaid</th></tr></thead><tbody class="divide-y divide-gray-800"><tr v-for="row in departmentImpact" :key="row.department"><td class="table-cell font-medium text-gray-100">{{ row.department }}</td><td class="table-cell">{{ row.requests }}</td><td class="table-cell text-emerald-300">{{ row.paid_days }}</td><td class="table-cell text-amber-300">{{ row.unpaid_days }}</td></tr><tr v-if="!departmentImpact.length"><td colspan="4" class="p-4"><EmptyState compact title="No department impact" description="Approved leave will appear here." /></td></tr></tbody></AppTable></div>
      </div>

      <div v-else-if="activeTab === 'details'" class="p-5">
        <div class="space-y-3 md:hidden"><EmptyState v-if="!leaveData.length" compact title="No approved records" description="Try another reporting period." /><article v-for="row in leaveData" :key="row.id" class="rounded-xl border border-gray-800 bg-gray-950/40 p-4"><div class="flex items-start justify-between gap-3"><div><h3 class="font-semibold text-gray-100">{{ row.employee_name }}</h3><p class="mt-1 text-xs text-gray-400">{{ row.leave_type_name }}</p></div><span class="text-xs font-semibold uppercase text-primary-300">{{ row.leave_pay_type }}</span></div><p class="mt-3 text-sm text-gray-300">{{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }}</p><div class="mt-3 flex gap-4 text-xs text-gray-500"><span>{{ row.paid_days }} paid</span><span>{{ row.unpaid_days }} unpaid</span></div></article></div>
        <AppTable class="hidden md:block"><thead class="bg-gray-950"><tr><th class="table-heading">Employee</th><th class="table-heading">Department</th><th class="table-heading">Leave type</th><th class="table-heading">Dates</th><th class="table-heading">Pay</th><th class="table-heading">Paid</th><th class="table-heading">Unpaid</th></tr></thead><tbody class="divide-y divide-gray-800"><tr v-for="row in leaveData" :key="row.id"><td class="table-cell font-medium text-gray-100">{{ row.employee_name }}</td><td class="table-cell">{{ row.department }}</td><td class="table-cell">{{ row.leave_type_name }}</td><td class="table-cell whitespace-nowrap">{{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }}</td><td class="table-cell uppercase">{{ row.leave_pay_type }}</td><td class="table-cell text-emerald-300">{{ row.paid_days }}</td><td class="table-cell text-amber-300">{{ row.unpaid_days }}</td></tr><tr v-if="!leaveData.length"><td colspan="7" class="p-4"><EmptyState title="No approved leave records" description="Try another reporting period." /></td></tr></tbody></AppTable>
      </div>

      <div v-else-if="activeTab === 'risks'" class="p-5"><EmptyState v-if="!riskFlags.length" title="No employee risk flags" description="No employee crossed the unpaid, emergency, or short-notice thresholds in this period." /><div v-else class="grid gap-3 lg:grid-cols-2"><article v-for="row in riskFlags" :key="row.employee_name" class="rounded-xl border border-red-900/40 bg-red-950/10 p-4"><div class="flex items-start justify-between gap-3"><div><h3 class="font-semibold text-gray-100">{{ row.employee_name }}</h3><p class="mt-1 text-xs text-gray-500">{{ row.department }}</p></div><span class="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300">Review</span></div><div class="mt-4 grid grid-cols-3 gap-2 text-center"><div class="rounded-lg bg-gray-950/60 p-2"><strong class="block text-amber-300">{{ row.unpaid_days }}</strong><span class="text-[10px] text-gray-500">Unpaid days</span></div><div class="rounded-lg bg-gray-950/60 p-2"><strong class="block text-gray-200">{{ row.emergency_count }}</strong><span class="text-[10px] text-gray-500">Emergency</span></div><div class="rounded-lg bg-gray-950/60 p-2"><strong class="block text-gray-200">{{ row.short_notice_count }}</strong><span class="text-[10px] text-gray-500">Short notice</span></div></div></article></div></div>

      <div v-else class="p-5"><div class="mb-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4"><p class="text-xs uppercase tracking-wider text-gray-500">Active AWOL cases today</p><p class="mt-1 text-2xl font-semibold" :class="awolSummary.active ? 'text-red-300' : 'text-emerald-300'">{{ awolSummary.active }}</p></div><EmptyState v-if="!awolSummary.rows.length" title="No AWOL records" description="No approved AWOL records fall within this reporting period." /><div v-else class="space-y-2"><article v-for="row in awolSummary.rows" :key="row.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-4"><div><p class="font-semibold text-gray-100">{{ row.employee_name }}</p><p class="mt-1 text-xs text-gray-500">{{ row.department }}</p></div><p class="text-sm text-gray-300">{{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }}</p></article></div></div>
    </section>
  </div>
</template>
