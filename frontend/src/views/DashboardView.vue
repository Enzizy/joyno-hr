<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useLeaveStore } from '@/stores/leaveStore'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getDashboardOverview } from '@/services/backendService'

const authStore = useAuthStore()
const leaveStore = useLeaveStore()
const overview = ref(null)

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
  if (!authStore.user?.employee_id) return null
  const today = todayISO.value
  const active = leaveStore.requests.find(
    (r) =>
      r.employee_id === authStore.user?.employee_id &&
      r.status === 'approved' &&
      r.start_date &&
      r.end_date &&
      r.start_date <= today &&
      today <= r.end_date
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

function formatBadgeLabel(value) {
  const text = String(value || '').replace(/_/g, ' ').trim()
  if (!text) return '-'
  return text
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
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
  overview.value = await getDashboardOverview()
  if (authStore.isEmployee) {
    await leaveStore.fetchRequests({ scope: 'mine' })
  } else {
    await leaveStore.fetchRequests({ limit: 5 })
  }
})

const recentLeaves = computed(() => leaveStore.requests.slice(0, 5))
const activityItems = computed(() => leaveStore.requests.slice(0, 8))
const showCrmOverview = computed(() => authStore.isHR || authStore.isAdmin)

const crmStats = computed(() => [
  { label: 'Active Clients', value: overview.value?.metrics?.active_clients ?? 0, tone: 'text-emerald-300' },
  { label: 'Approvals Backlog', value: overview.value?.metrics?.approvals_backlog ?? 0, tone: 'text-amber-300' },
  { label: 'Overdue Tasks', value: overview.value?.metrics?.overdue_tasks ?? 0, tone: 'text-red-300' },
  {
    label: 'Leads Follow-up',
    value: overview.value?.metrics?.pending_leads_follow_up ?? 0,
    tone: 'text-blue-300',
  },
])

const pendingLeavesForSla = computed(() => overview.value?.pending_leave_requests || [])
const overdueTaskItems = computed(() => overview.value?.overdue_tasks_list || [])
const leadFollowUps = computed(() => overview.value?.lead_follow_ups || [])
const employeeKpis = computed(() => overview.value?.metrics || {})
const employeeUpcomingTasks = computed(() => overview.value?.upcoming_tasks || [])

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
      <div v-if="authStore.user?.department" class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-400">Department</p>
        <p class="mt-1 text-xl font-semibold text-primary-200">{{ authStore.user.department }}</p>
      </div>
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-400">Status</p>
        <p class="mt-1">
          <StatusBadge :status="statusLabel" />
        </p>
        <p v-if="currentLeaveEnd" class="mt-2 text-xs text-gray-400">On leave until {{ formatDate(currentLeaveEnd) }}</p>
      </div>
      <div v-if="authStore.isEmployee" class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-400">Tasks Due Today</p>
        <p class="mt-1 text-xl font-semibold text-primary-200">{{ employeeKpis.tasks_due_today ?? 0 }}</p>
      </div>
      <div v-if="authStore.isEmployee" class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-400">Overdue Tasks</p>
        <p class="mt-1 text-xl font-semibold text-red-300">{{ employeeKpis.overdue_tasks ?? 0 }}</p>
      </div>
      <div v-if="authStore.isEmployee" class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-400">Leave Credits</p>
        <p class="mt-1 text-xl font-semibold text-emerald-300">{{ Number(employeeKpis.leave_credits || 0).toFixed(2) }}</p>
      </div>
      <div v-if="authStore.isEmployee" class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-400">Upcoming Deadlines</p>
        <p class="mt-1 text-xl font-semibold text-amber-300">{{ employeeKpis.upcoming_deadlines ?? 0 }}</p>
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
                <StatusBadge :status="row.status">{{ formatBadgeLabel(row.status) }}</StatusBadge>
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

    <div v-if="showCrmOverview" class="space-y-4">
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-primary-200">CRM Overview</h2>
          <RouterLink to="/leads" class="text-xs font-medium text-primary-300 hover:text-primary-200">View CRM</RouterLink>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="item in crmStats"
            :key="item.label"
            class="rounded-lg border border-gray-800 bg-gray-950 p-4"
          >
            <p class="text-xs font-medium uppercase tracking-wide text-gray-400">{{ item.label }}</p>
            <p class="mt-2 text-2xl font-semibold" :class="item.tone">{{ item.value }}</p>
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
          <div class="border-b border-gray-800 px-4 py-3">
            <h3 class="text-base font-semibold text-primary-200">Pending Leave Approvals (SLA)</h3>
          </div>
          <div class="p-4">
            <ul v-if="pendingLeavesForSla.length" class="space-y-2">
              <li
                v-for="leave in pendingLeavesForSla"
                :key="leave.id"
                class="flex items-center justify-between rounded-md border border-gray-800 bg-gray-950 px-3 py-2"
              >
                <span class="text-sm text-primary-200">{{ leave.employee_name || '-' }}</span>
                <span class="text-xs text-amber-300">{{ formatDate(leave.created_at) }}</span>
              </li>
            </ul>
            <p v-else class="text-sm text-gray-400">No pending leave approvals.</p>
          </div>
        </div>
        <div class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
          <div class="border-b border-gray-800 px-4 py-3">
            <h3 class="text-base font-semibold text-primary-200">Lead Follow-ups</h3>
          </div>
          <div class="p-4">
            <ul v-if="leadFollowUps.length" class="space-y-2">
              <li
                v-for="lead in leadFollowUps"
                :key="lead.id"
                class="flex items-center justify-between rounded-md border border-gray-800 bg-gray-950 px-3 py-2"
              >
                <span class="text-sm text-primary-200">{{ lead.company_name }}</span>
                <span class="text-xs text-amber-300">{{ formatDate(lead.next_follow_up) }}</span>
              </li>
            </ul>
            <p v-else class="text-sm text-gray-400">No lead follow-ups pending.</p>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
        <div class="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h3 class="text-base font-semibold text-primary-200">Overdue/Pending Tasks</h3>
          <RouterLink to="/tasks" class="text-xs font-medium text-primary-300 hover:text-primary-200">View tasks</RouterLink>
        </div>
        <div class="divide-y divide-gray-800">
          <div
            v-for="task in overdueTaskItems"
            :key="task.id"
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p class="text-sm font-medium text-primary-200">{{ task.title }}</p>
              <p class="text-xs text-gray-400">
                Due {{ formatDate(task.due_date) }} • {{ task.company_name || task.assigned_email || '-' }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-300">{{ formatBadgeLabel(task.priority) }}</span>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="task.status === 'pending' ? 'bg-amber-900/50 text-amber-200' : 'bg-blue-900/50 text-blue-200'"
              >
                {{ formatBadgeLabel(task.status) }}
              </span>
            </div>
          </div>
          <div v-if="!overdueTaskItems.length" class="px-4 py-6 text-sm text-gray-400">No overdue tasks.</div>
        </div>
      </div>
    </div>

    <div v-if="authStore.isEmployee" class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 class="text-lg font-semibold text-primary-200">Upcoming Deadlines</h2>
        <RouterLink to="/my-tasks" class="text-xs font-medium text-primary-300 hover:text-primary-200">View my tasks</RouterLink>
      </div>
      <div class="divide-y divide-gray-800">
        <div
          v-for="task in employeeUpcomingTasks"
          :key="task.id"
          class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        >
          <div>
            <p class="text-sm font-medium text-primary-200">{{ task.title }}</p>
            <p class="text-xs text-gray-400">Due {{ formatDate(task.due_date) }} {{ task.company_name ? `• ${task.company_name}` : '' }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-300">{{ formatBadgeLabel(task.priority) }}</span>
            <StatusBadge :status="task.status" />
          </div>
        </div>
        <div v-if="!employeeUpcomingTasks.length" class="px-4 py-6 text-sm text-gray-400">No upcoming deadlines.</div>
      </div>
    </div>

    <!-- Recent leave requests (Admin/HR) -->
    <div v-if="authStore.isHR || authStore.isAdmin" class="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div class="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 class="text-lg font-semibold text-primary-200">Recent Leave Requests</h2>
        <RouterLink to="/leave-approvals" class="text-xs font-medium text-primary-300 hover:text-primary-200">View Leave</RouterLink>
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
                <StatusBadge :status="row.status">{{ formatBadgeLabel(row.status) }}</StatusBadge>
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


