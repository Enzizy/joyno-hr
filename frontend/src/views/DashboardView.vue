<script setup>
import { computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useLeaveStore } from '@/stores/leaveStore'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const authStore = useAuthStore()
const leaveStore = useLeaveStore()

const role = computed(() => authStore.role)
const greeting = computed(() => {
  const name = authStore.user?.first_name || authStore.user?.email?.split('@')[0] || 'User'
  return `Hello, ${name}`
})

const employeeCode = computed(() => authStore.user?.employee_code || authStore.user?.employee_id || '-')
const statusLabel = computed(() => authStore.user?.status || 'active')
const todayISO = computed(() => {
  const now = new Date()
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const year = local.getFullYear()
  const month = `${local.getMonth() + 1}`.padStart(2, '0')
  const day = `${local.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
})
const currentLeaveEnd = computed(() => {
  const today = todayISO.value
  const active = leaveStore.requests.find(
    (r) => r.status === 'approved' && r.start_date && r.end_date && r.start_date <= today && today <= r.end_date
  )
  return active?.end_date ?? null
})

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

function employeeLabel(row) {
  if (row.employee_name) return row.employee_name
  if (row.employee) {
    const name = `${row.employee.first_name || ''} ${row.employee.last_name || ''}`.trim()
    return name || row.employee_id || '-'
  }
  const user = authStore.user
  if (user?.employee_id && row.employee_id === user.employee_id) {
    const selfName = `${user.first_name || ''} ${user.last_name || ''}`.trim()
    return selfName || user.employee_id || '-'
  }
  return row.employee_id || '-'
}

onMounted(async () => {
  if (authStore.isEmployee) {
    await leaveStore.fetchRequests({ scope: 'mine' })
  } else {
    await leaveStore.fetchRequests({ limit: 5 })
  }
})

const recentLeaves = computed(() => leaveStore.requests.slice(0, 5))
const activityItems = computed(() => leaveStore.requests.slice(0, 8))

function actionLabel(row) {
  const roleLabel = row.approved_by_role
    ? ` (${row.approved_by_role.charAt(0).toUpperCase() + row.approved_by_role.slice(1)})`
    : ''
  if (row.status === 'approved') {
    return `Approved by ${row.approved_by_name || 'Admin'}${roleLabel}`
  }
  if (row.status === 'rejected') {
    return `Rejected by ${row.approved_by_name || 'Admin'}${roleLabel}`
  }
  return 'Pending approval'
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">{{ greeting }}</h1>
      <p class="mt-1 text-sm text-gray-400">Here's an overview of your activity.</p>
    </div>

    <!-- Role-aware widgets -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-400">Role</p>
        <p class="mt-1 text-xl font-semibold text-gray-100 capitalize">{{ role }}</p>
      </div>
      <div v-if="authStore.user?.employee_id" class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-400">Employee Code</p>
        <p class="mt-1 text-xl font-semibold text-primary-200">{{ employeeCode }}</p>
      </div>
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-400">Status</p>
        <p class="mt-1">
          <StatusBadge :status="statusLabel" />
        </p>
        <p v-if="currentLeaveEnd" class="mt-2 text-xs text-gray-400">On leave until {{ formatDate(currentLeaveEnd) }}</p>
      </div>
    </div>

    <!-- Employee activity log -->
    <div v-if="authStore.isEmployee" class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="border-b border-gray-800 px-4 py-3">
        <h2 class="text-lg font-semibold text-primary-200">Activity Log</h2>
        <RouterLink to="/leave-request" class="mt-1 inline-block text-xs font-medium text-primary-300 hover:text-primary-200">
          View my leave requests
        </RouterLink>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-800">
          <thead class="bg-gray-950">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-primary-300">Dates</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-primary-300">Type</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-primary-300">Status</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-primary-300">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="row in activityItems" :key="row.id" class="hover:bg-gray-950">
              <td class="px-4 py-3 text-sm text-primary-200">{{ formatRange(row.start_date, row.end_date) }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.leave_type_name ?? row.leave_type?.name ?? row.leave_type_id }}</td>
              <td class="px-4 py-3">
                <StatusBadge :status="row.status" />
              </td>
              <td class="px-4 py-3 text-sm text-gray-300">
                {{ actionLabel(row) }}
              </td>
            </tr>
            <tr v-if="!activityItems.length && !leaveStore.loading">
              <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">No activity yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Recent leave requests (Admin/HR) -->
    <div v-else-if="authStore.isHR || authStore.isAdmin" class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="border-b border-gray-800 px-4 py-3">
        <h2 class="text-lg font-semibold text-primary-200">Recent Leave Requests</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-800">
          <thead class="bg-gray-950">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-primary-300">Employee</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-primary-300">Dates</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-primary-300">Type</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-primary-300">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr v-for="row in recentLeaves" :key="row.id" class="hover:bg-gray-950">
              <td class="px-4 py-3 text-sm text-primary-200">
                {{ employeeLabel(row) }}
              </td>
              <td class="px-4 py-3 text-sm text-primary-200">{{ formatRange(row.start_date, row.end_date) }}</td>
              <td class="px-4 py-3 text-sm text-gray-300">{{ row.leave_type_name ?? row.leave_type?.name ?? row.leave_type_id }}</td>
              <td class="px-4 py-3">
                <StatusBadge :status="row.status" />
              </td>
            </tr>
            <tr v-if="!recentLeaves.length && !leaveStore.loading">
              <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">No leave requests yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Admin/HR quick links -->
    <div v-if="authStore.canAccessHR" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <router-link
        to="/employees"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm transition hover:border-primary-300 hover:shadow"
      >
        <p class="mt-2 font-medium text-primary-200">Employee Management</p>
        <p class="text-sm text-gray-400">View and manage employees</p>
      </router-link>
      <router-link
        to="/leave-approvals"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm transition hover:border-primary-300 hover:shadow"
      >
        <p class="mt-2 font-medium text-primary-200">Leave Approvals</p>
        <p class="text-sm text-gray-400">Approve or reject leave</p>
      </router-link>
      <router-link
        to="/reports"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm transition hover:border-primary-300 hover:shadow"
      >
        <p class="mt-2 font-medium text-primary-200">Reports</p>
        <p class="text-sm text-gray-400">Leave reports</p>
      </router-link>
    </div>
  </div>
</template>


