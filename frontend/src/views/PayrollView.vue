<script setup>
import { ref, computed, onMounted } from 'vue'
import { getEmployees, createPayrollRun } from '@/services/api'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppTable from '@/components/ui/AppTable.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'

const toast = useToastStore()
const employees = ref([])
const loading = ref(false)
const periodStart = ref(new Date().toISOString().slice(0, 10))
const periodEnd = ref(new Date().toISOString().slice(0, 10))
onMounted(async () => {
  loading.value = true
  try {
    employees.value = await getEmployees()
  } finally {
    loading.value = false
  }
})

const weeks = computed(() => {
  if (!periodStart.value || !periodEnd.value) return 0
  const start = new Date(periodStart.value)
  const end = new Date(periodEnd.value)
  const days = Math.max(1, Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1)
  return Math.max(1, Math.ceil(days / 7))
})

async function generatePayroll() {
  if (!periodStart.value || !periodEnd.value) {
    toast.warning('Please select a payroll period.')
    return
  }
  loading.value = true
  try {
    await createPayrollRun({
      period_start: periodStart.value,
      period_end: periodEnd.value,
    })
    toast.success('Payroll generated.')
  } catch (err) {
    toast.error(err.response?.data?.message || err.message || 'Failed to generate payroll.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">Payroll</h1>
      <p class="mt-1 text-sm text-gray-400">Generate monthly payroll with weekly travel allowances.</p>
    </div>
    <div class="flex flex-wrap items-end gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
      <AppDatePicker v-model="periodStart" label="Period start" />
      <AppDatePicker v-model="periodEnd" label="Period end" />
      <div class="text-sm text-gray-300">Weeks: <strong>{{ weeks }}</strong></div>
      <AppButton :loading="loading" @click="generatePayroll">Generate payroll</AppButton>
    </div>

    <AppTable :loading="loading">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Employee</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Department</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Base salary</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Weekly allowance</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in employees" :key="row.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm text-primary-200">{{ row.first_name }} {{ row.last_name }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.department || '-' }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ Number(row.salary_amount || 0).toFixed(2) }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">
            {{ Number(row.weekly_allowance || 0).toFixed(2) }}
          </td>
        </tr>
        <tr v-if="!employees.length && !loading">
          <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">No employees found.</td>
        </tr>
      </tbody>
    </AppTable>
  </div>
</template>
