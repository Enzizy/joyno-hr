<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getLeaveReport } from '@/services/backendService'
import { useToastStore } from '@/stores/toastStore'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppTable from '@/components/ui/AppTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import MoreMenu from '@/components/ui/MoreMenu.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { payrollEnabled } from '@/config/features'
import { cutoffContaining } from '@/utils/payrollPeriods'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const toast = useToastStore()

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const addDays = (iso, days) => { const date = new Date(`${iso}T00:00:00`); date.setDate(date.getDate() + days); return toISO(date) }
function formatDate(value) {
  if (!value) return '-'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Quick ranges, with the payroll cutoffs first so leave lines up with the payroll HR is checking.
const today = toISO(new Date())
const thisCutoff = cutoffContaining(today)
const lastCutoff = cutoffContaining(addDays(thisCutoff.start, -1))
const now = new Date()
const ranges = [
  { id: 'cutoff', label: 'This cutoff', from: thisCutoff.start, to: thisCutoff.end },
  { id: 'last-cutoff', label: 'Last cutoff', from: lastCutoff.start, to: lastCutoff.end },
  { id: 'month', label: 'This month', from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)) },
  { id: 'last-month', label: 'Last month', from: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: toISO(new Date(now.getFullYear(), now.getMonth(), 0)) },
  { id: 'year', label: 'This year', from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` },
]
const dateFrom = ref(ranges[0].from)
const dateTo = ref(ranges[0].to)
const activeRange = computed(() => ranges.find(range => range.from === dateFrom.value && range.to === dateTo.value)?.id)
function setRange(range) { dateFrom.value = range.from; dateTo.value = range.to }

// The report reloads whenever the dates change.
const loading = ref(false)
const dateError = ref('')
const rows = ref([])
let timer = null
let requestId = 0
async function loadLeave() {
  if (!dateFrom.value || !dateTo.value) { dateError.value = 'Choose both dates.'; return }
  if (dateFrom.value > dateTo.value) { dateError.value = 'The start date must be on or before the end date.'; return }
  dateError.value = ''
  loading.value = true
  const id = ++requestId
  try {
    const result = await getLeaveReport(dateFrom.value, dateTo.value)
    if (id !== requestId) return
    rows.value = result.map(row => ({
      ...row,
      status: String(row.status || '').toLowerCase(),
      employee_name: row.employee_name || row.employee_id,
      department: row.department || 'Unassigned',
      leave_type_name: row.leave_type_name || 'Leave',
      paid_days: Number(row.paid_days || 0),
      unpaid_days: Number(row.unpaid_days || 0),
    }))
  } catch (error) {
    if (id !== requestId) return
    rows.value = []
    toast.error(error.message || 'Unable to load the leave report.')
  } finally {
    if (id === requestId) loading.value = false
  }
}
watch([dateFrom, dateTo], () => { clearTimeout(timer); timer = setTimeout(loadLeave, 250) }, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const leaveData = computed(() => rows.value.filter(row => row.status === 'approved'))
const pendingCount = computed(() => rows.value.filter(row => row.status === 'pending').length)
const payType = value => ({ paid: 'Paid', unpaid: 'Unpaid', partial_paid: 'Partly paid' })[String(value || 'unpaid').toLowerCase()] || value
const profileLink = row => row.employee_id ? { path: `/employees/${row.employee_id}`, query: { section: 'leave' } } : null

function groupBy(key, label) {
  const map = new Map()
  for (const row of leaveData.value) {
    const id = String(row[key] ?? row[label])
    if (!map.has(id)) map.set(id, { id, label: row[label], employee_id: row.employee_id, requests: 0, paid_days: 0, unpaid_days: 0 })
    const item = map.get(id)
    item.requests += 1
    item.paid_days += row.paid_days
    item.unpaid_days += row.unpaid_days
  }
  return [...map.values()]
}
const byEmployee = computed(() => groupBy('employee_id', 'employee_name').sort((a, b) => b.unpaid_days - a.unpaid_days || String(a.label).localeCompare(String(b.label))))
const byType = computed(() => groupBy('leave_type_name', 'leave_type_name').sort((a, b) => b.requests - a.requests))
const byDepartment = computed(() => groupBy('department', 'department').sort((a, b) => b.requests - a.requests))
const totals = computed(() => ({
  requests: leaveData.value.length,
  people: new Set(leaveData.value.map(row => row.employee_id || row.employee_name)).size,
  paidDays: leaveData.value.reduce((sum, row) => sum + row.paid_days, 0),
  unpaidDays: leaveData.value.reduce((sum, row) => sum + row.unpaid_days, 0),
}))

// Patterns worth a conversation: 3+ unpaid days, 2+ emergency leaves, or 2+ requests filed a day or less ahead.
const patterns = computed(() => {
  const map = new Map()
  for (const row of leaveData.value) {
    const id = String(row.employee_id || row.employee_name)
    if (!map.has(id)) map.set(id, { id, employee_id: row.employee_id, employee_name: row.employee_name, department: row.department, unpaid_days: 0, emergency: 0, shortNotice: 0 })
    const item = map.get(id)
    item.unpaid_days += row.unpaid_days
    if (String(row.leave_type_name).toLowerCase().includes('emergency')) item.emergency += 1
    const filed = new Date(row.created_at), starts = new Date(row.start_date)
    if (!Number.isNaN(filed.getTime()) && !Number.isNaN(starts.getTime()) && Math.floor((starts - filed) / 86400000) <= 1) item.shortNotice += 1
  }
  return [...map.values()].map(item => ({ ...item, reasons: [
    item.unpaid_days >= 3 && `${item.unpaid_days} unpaid days`,
    item.emergency >= 2 && `${item.emergency} emergency leaves`,
    item.shortNotice >= 2 && `${item.shortNotice} requests filed a day or less before`,
  ].filter(Boolean) })).filter(item => item.reasons.length)
})

const awol = computed(() => {
  const list = leaveData.value.filter(row => String(row.leave_type_name).toLowerCase().includes('absent without official leave'))
  return { list, active: list.filter(row => String(row.start_date).slice(0, 10) <= today && String(row.end_date).slice(0, 10) >= today).length }
})

const tabs = computed(() => [
  { id: 'summary', label: 'Summary' },
  { id: 'records', label: 'Leave records', count: leaveData.value.length },
  { id: 'patterns', label: 'Patterns to check', count: patterns.value.length, alert: patterns.value.length > 0 },
  { id: 'awol', label: 'AWOL', count: awol.value.list.length, alert: awol.value.list.length > 0 },
])
const activeTab = ref('summary')

const exporting = ref(false)
async function exportFile(endpoint, filename) {
  if (!leaveData.value.length || exporting.value) return
  exporting.value = true
  try {
    const params = new URLSearchParams({ from: dateFrom.value, to: dateTo.value })
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_BASE}${endpoint}?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!response.ok) throw new Error('Download failed')
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
    toast.error(error.message || 'Unable to download the report.')
  } finally {
    exporting.value = false
  }
}
const downloads = computed(() => [
  { label: 'Leave list (Excel)', onSelect: () => exportFile('/api/reports/leave.xlsx', 'leave-list'), disabled: !leaveData.value.length || exporting.value },
  ...(payrollEnabled ? [{ label: 'Unpaid days for payroll (Excel)', onSelect: () => exportFile('/api/reports/leave-payroll.xlsx', 'unpaid-leave-for-payroll'), disabled: !leaveData.value.length || exporting.value }] : []),
])
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Leave reports" />

    <section class="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-sm">
      <div class="grid gap-4 sm:grid-cols-2">
        <AppDatePicker v-model="dateFrom" name="report-from" label="From" :max="dateTo" />
        <AppDatePicker v-model="dateTo" name="report-to" label="To" :min="dateFrom" />
      </div>
      <p v-if="dateError" class="mt-2 text-sm text-red-400">{{ dateError }}</p>
      <div class="mt-4 flex flex-col gap-3 border-t border-gray-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-2" role="group" aria-label="Quick ranges">
          <button v-for="range in ranges" :key="range.id" type="button" class="rounded-lg px-3 py-1.5 text-xs font-medium" :class="activeRange === range.id ? 'bg-primary-500 text-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'" :aria-pressed="activeRange === range.id" @click="setRange(range)">{{ range.label }}</button>
        </div>
        <MoreMenu label="Download" :items="downloads" />
      </div>
    </section>

    <div v-if="loading && !rows.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading report"><div v-for="item in 4" :key="item" class="h-24 animate-pulse rounded-xl bg-gray-800" /></div>
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" :class="loading ? 'opacity-60' : ''" :aria-busy="loading">
        <article v-for="item in [{ label: 'Approved requests', value: totals.requests }, { label: 'People who took leave', value: totals.people }, { label: 'Paid days', value: totals.paidDays }, { label: 'Unpaid days', value: totals.unpaidDays, note: 'Taken off pay', warn: totals.unpaidDays > 0 }]" :key="item.label" class="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p class="text-sm text-gray-400">{{ item.label }}</p>
          <p class="mt-1 text-2xl font-semibold" :class="item.warn ? 'text-amber-300' : 'text-gray-100'">{{ item.value }}</p>
          <p v-if="item.note" class="mt-0.5 text-xs text-gray-500">{{ item.note }}</p>
        </article>
      </div>
      <p v-if="pendingCount" class="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm" style="color:var(--warning-text);background:var(--warning-bg);border-color:var(--warning-border)">
        <span>{{ pendingCount }} {{ pendingCount === 1 ? 'request is' : 'requests are' }} still waiting for approval in these dates and {{ pendingCount === 1 ? 'is' : 'are' }} not counted here.</span>
        <RouterLink to="/leave-approvals" class="font-semibold underline">Review requests</RouterLink>
      </p>
    </template>

    <section class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="overflow-x-auto border-b border-gray-800 px-3 pt-3">
        <div class="flex min-w-max gap-1" role="tablist" aria-label="Report sections">
          <button v-for="tab in tabs" :key="tab.id" type="button" role="tab" :aria-selected="activeTab === tab.id" class="rounded-t-lg px-4 py-2.5 text-sm font-semibold" :class="activeTab === tab.id ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:text-gray-200'" @click="activeTab = tab.id">
            {{ tab.label }}<span v-if="tab.count !== undefined" class="ml-2 rounded-full px-2 py-0.5 text-xs" :class="tab.alert ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800 text-gray-400'">{{ tab.count }}</span>
          </button>
        </div>
      </div>

      <div v-if="activeTab === 'summary'" class="p-5">
        <EmptyState v-if="!leaveData.length" title="No approved leave in these dates" description="Pick another range above." />
        <div v-else class="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <h2 class="font-semibold text-gray-100">By employee</h2>
            <p class="mb-3 mt-1 text-xs text-gray-500">Most unpaid days first. Unpaid days are taken off pay.</p>
            <AppTable><thead class="bg-gray-950"><tr><th class="table-heading">Employee</th><th class="table-heading">Requests</th><th class="table-heading">Paid days</th><th class="table-heading">Unpaid days</th></tr></thead>
              <tbody class="divide-y divide-gray-800"><tr v-for="row in byEmployee" :key="row.id"><td class="table-cell font-medium text-gray-100"><RouterLink v-if="profileLink(row)" :to="profileLink(row)" class="hover:text-primary-300 hover:underline">{{ row.label }}</RouterLink><span v-else>{{ row.label }}</span></td><td class="table-cell">{{ row.requests }}</td><td class="table-cell">{{ row.paid_days }}</td><td class="table-cell" :class="row.unpaid_days ? 'font-semibold text-amber-300' : ''">{{ row.unpaid_days }}</td></tr></tbody>
            </AppTable>
          </div>
          <div class="space-y-6">
            <div>
              <h2 class="mb-3 font-semibold text-gray-100">By leave type</h2>
              <AppTable><thead class="bg-gray-950"><tr><th class="table-heading">Leave type</th><th class="table-heading">Requests</th><th class="table-heading">Paid days</th><th class="table-heading">Unpaid days</th></tr></thead>
                <tbody class="divide-y divide-gray-800"><tr v-for="row in byType" :key="row.id"><td class="table-cell font-medium text-gray-100">{{ row.label }}</td><td class="table-cell">{{ row.requests }}</td><td class="table-cell">{{ row.paid_days }}</td><td class="table-cell" :class="row.unpaid_days ? 'font-semibold text-amber-300' : ''">{{ row.unpaid_days }}</td></tr></tbody>
              </AppTable>
            </div>
            <div>
              <h2 class="mb-3 font-semibold text-gray-100">By department</h2>
              <AppTable><thead class="bg-gray-950"><tr><th class="table-heading">Department</th><th class="table-heading">Requests</th><th class="table-heading">Paid days</th><th class="table-heading">Unpaid days</th></tr></thead>
                <tbody class="divide-y divide-gray-800"><tr v-for="row in byDepartment" :key="row.id"><td class="table-cell font-medium text-gray-100">{{ row.label }}</td><td class="table-cell">{{ row.requests }}</td><td class="table-cell">{{ row.paid_days }}</td><td class="table-cell" :class="row.unpaid_days ? 'font-semibold text-amber-300' : ''">{{ row.unpaid_days }}</td></tr></tbody>
              </AppTable>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeTab === 'records'" class="p-5">
        <EmptyState v-if="!leaveData.length" title="No approved leave in these dates" description="Pick another range above." />
        <AppTable v-else><thead class="bg-gray-950"><tr><th class="table-heading">Employee</th><th class="table-heading">Department</th><th class="table-heading">Leave type</th><th class="table-heading">Dates</th><th class="table-heading">Pay</th><th class="table-heading">Paid days</th><th class="table-heading">Unpaid days</th></tr></thead>
          <tbody class="divide-y divide-gray-800"><tr v-for="row in leaveData" :key="row.id"><td class="table-cell font-medium text-gray-100"><RouterLink v-if="profileLink(row)" :to="profileLink(row)" class="hover:text-primary-300 hover:underline">{{ row.employee_name }}</RouterLink><span v-else>{{ row.employee_name }}</span></td><td class="table-cell">{{ row.department }}</td><td class="table-cell">{{ row.leave_type_name }}</td><td class="table-cell whitespace-nowrap">{{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }}</td><td class="table-cell">{{ payType(row.leave_pay_type) }}</td><td class="table-cell">{{ row.paid_days }}</td><td class="table-cell" :class="row.unpaid_days ? 'font-semibold text-amber-300' : ''">{{ row.unpaid_days }}</td></tr></tbody>
        </AppTable>
      </div>

      <div v-else-if="activeTab === 'patterns'" class="p-5">
        <p class="mb-4 text-sm text-gray-400">Someone shows here with 3 or more unpaid days, 2 or more emergency leaves, or 2 or more requests filed a day or less before the leave.</p>
        <EmptyState v-if="!patterns.length" title="Nothing to check" description="No one reached these in the chosen dates." />
        <div v-else class="grid gap-3 lg:grid-cols-2">
          <article v-for="row in patterns" :key="row.id" class="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
            <RouterLink v-if="profileLink(row)" :to="profileLink(row)" class="font-semibold text-gray-100 hover:text-primary-300 hover:underline">{{ row.employee_name }}</RouterLink><span v-else class="font-semibold text-gray-100">{{ row.employee_name }}</span>
            <p class="mt-0.5 text-xs text-gray-500">{{ row.department }}</p>
            <ul class="mt-3 space-y-1 text-sm text-amber-300"><li v-for="reason in row.reasons" :key="reason">{{ reason }}</li></ul>
          </article>
        </div>
      </div>

      <div v-else class="p-5">
        <p class="mb-4 text-sm text-gray-400">{{ awol.active ? `${awol.active} ${awol.active === 1 ? 'person is' : 'people are'} on AWOL today.` : 'No one is on AWOL today.' }}</p>
        <EmptyState v-if="!awol.list.length" title="No AWOL in these dates" description="AWOL recorded on an employee's profile shows here." />
        <div v-else class="space-y-2">
          <article v-for="row in awol.list" :key="row.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
            <div><RouterLink v-if="profileLink(row)" :to="profileLink(row)" class="font-semibold text-gray-100 hover:text-primary-300 hover:underline">{{ row.employee_name }}</RouterLink><span v-else class="font-semibold text-gray-100">{{ row.employee_name }}</span><p class="mt-1 text-xs text-gray-500">{{ row.department }}</p></div>
            <p class="text-sm text-gray-300">{{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }}</p>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
