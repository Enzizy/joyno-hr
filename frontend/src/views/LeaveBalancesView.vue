<script setup>
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import { getEmployees, getLeaveRequests, getLeaveTypes } from '@/services/api'
import { currentManilaDate } from '@/utils/leaveEligibility'
import { leaveBalances } from '@/utils/leaveBalances'
import { downloadCsv } from '@/utils/csv'

// Paid leave left per employee and leave type, the same numbers each employee sees on My leave.
const today = currentManilaDate()
const thisYear = Number(today.slice(0, 4))
const year = ref(thisYear)
const search = ref('')
const department = ref('')
const loading = ref(true)
const error = ref('')
const data = ref({ employees: [], leaveTypes: [], requests: [] })

onMounted(async () => {
  try {
    const [employees, leaveTypes, requests] = await Promise.all([getEmployees(), getLeaveTypes(), getLeaveRequests()])
    data.value = { employees: (employees.items || employees || []).filter(e => ['active', 'on_leave'].includes(String(e.status || 'active').toLowerCase())), leaveTypes, requests }
  } catch (e) { error.value = e.message || 'Unable to load leave balances.' }
  finally { loading.value = false }
})

const asOf = computed(() => year.value === thisYear ? today : `${year.value}-12-31`)
const result = computed(() => leaveBalances({ ...data.value, year: year.value, asOf: asOf.value }))
const departments = computed(() => [...new Set(data.value.employees.map(e => e.department).filter(Boolean))].sort())
const rows = computed(() => {
  const query = search.value.trim().toLowerCase()
  return result.value.rows.filter(row => (!department.value || row.department === department.value) &&
    (!query || `${row.name} ${row.employeeCode}`.toLowerCase().includes(query))).sort((a, b) => a.name.localeCompare(b.name))
})
const days = value => `${Number(value)}`
function download() {
  const types = result.value.types
  downloadCsv(`leave-balances-${year.value}.csv`, ['Employee ID', 'Name', 'Department', ...types.flatMap(type => [`${type.name} left`, `${type.name} used`, `${type.name} eligible`])],
    rows.value.map(row => [row.employeeCode, row.name, row.department, ...row.balances.flatMap(b => [b.eligible ? b.remaining : 0, b.used, b.eligible ? 'Yes' : 'Not yet'])]))
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Leave balances" />
    <section class="grid gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label class="text-xs font-medium text-gray-400">Search<input v-model="search" type="search" class="form-control mt-1.5" placeholder="Name or employee ID"></label>
      <label class="text-xs font-medium text-gray-400">Department<select v-model="department" class="form-control mt-1.5"><option value="">All departments</option><option v-for="item in departments" :key="item" :value="item">{{ item }}</option></select></label>
      <label class="text-xs font-medium text-gray-400">Year<select v-model.number="year" class="form-control mt-1.5"><option v-for="item in [thisYear, thisYear - 1]" :key="item" :value="item">{{ item }}</option></select></label>
      <AppButton variant="secondary" :disabled="!rows.length" @click="download">Download CSV</AppButton>
    </section>
    <p v-if="error" role="alert" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)">{{ error }}</p>
    <div v-if="loading" class="h-64 animate-pulse rounded-xl bg-gray-800" />
    <section v-else class="rounded-xl border border-gray-800 bg-gray-900">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-left text-sm">
          <thead><tr class="border-b border-gray-800"><th class="table-heading">Employee</th><th v-for="type in result.types" :key="type.id" class="table-heading text-center">{{ type.name }}<span class="block font-normal normal-case text-gray-500">{{ type.paid_days_per_year }} days a year</span></th></tr></thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="row in rows" :key="row.employeeId">
              <td class="table-cell"><RouterLink :to="{ path: `/employees/${row.employeeId}`, query: { section: 'leave' } }" class="font-medium text-gray-100 hover:text-primary-300 hover:underline">{{ row.name }}</RouterLink><span class="block text-xs text-gray-500">{{ row.department }}</span></td>
              <td v-for="balance in row.balances" :key="balance.typeId" class="table-cell text-center">
                <template v-if="balance.eligible">
                  <span class="font-semibold tabular-nums" :class="balance.remaining ? 'text-gray-100' : 'text-amber-300'">{{ days(balance.remaining) }} left</span>
                  <span class="block text-xs text-gray-500">{{ days(balance.used) }} used<span v-if="balance.pending"> · {{ days(balance.pending) }} pending</span></span>
                </template>
                <span v-else class="text-xs text-gray-500">Not yet eligible</span>
              </td>
            </tr>
            <tr v-if="!rows.length"><td :colspan="result.types.length + 1" class="table-cell py-8 text-center text-gray-500">No employees match.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="border-t border-gray-800 px-5 py-3 text-xs text-gray-500">Paid days per year less approved paid leave starting in {{ year }}. Pending requests are not taken off yet.</p>
    </section>
  </div>
</template>
