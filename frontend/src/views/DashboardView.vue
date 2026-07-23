<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useLeaveStore } from '@/stores/leaveStore'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getDashboardOverview } from '@/services/backendService'

const authStore = useAuthStore()
const leaveStore = useLeaveStore()
const overview = ref({ metrics: {}, pending_leave_requests: [], overdue_tasks_list: [], upcoming_tasks: [] })

const isManagement = computed(() => authStore.canAccessHR)
const firstName = computed(() => authStore.user?.first_name || authStore.user?.email?.split('@')[0] || 'there')
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})
const todayLabel = computed(() => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
const metrics = computed(() => overview.value?.metrics || {})

const todayISO = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
})

const pendingLeaves = computed(() => {
  const rows = overview.value?.pending_leave_requests
  return rows?.length ? rows : leaveStore.requests.filter((row) => row.status === 'pending').slice(0, 6)
})
const overdueTasks = computed(() => overview.value?.overdue_tasks_list || [])
const employeeUpcomingTasks = computed(() => overview.value?.upcoming_tasks || [])
const awayToday = computed(() => leaveStore.requests.filter((row) => row.status === 'approved' && row.start_date <= todayISO.value && row.end_date >= todayISO.value))
const upcomingLeave = computed(() => leaveStore.requests.filter((row) => ['pending', 'approved'].includes(row.status) && row.start_date > todayISO.value))
const recentActivity = computed(() => [...leaveStore.requests].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6))

const managementKpis = computed(() => [
  { label: 'Pending approvals', value: metrics.value.approvals_backlog ?? pendingLeaves.value.length, note: 'Requests waiting for review', tone: 'gold', route: '/leave-approvals' },
  { label: 'Away today', value: awayToday.value.length, note: 'Approved absences today', tone: 'green', route: '/leave-calendar' },
  { label: 'Overdue tasks', value: metrics.value.overdue_tasks ?? overdueTasks.value.length, note: 'Work requiring attention', tone: 'red', route: '/tasks' },
  { label: 'Upcoming leave', value: upcomingLeave.value.length, note: 'Future approved or pending', tone: 'neutral', route: '/leave-calendar' },
])

const employeeKpis = computed(() => [
  { label: 'Due today', value: metrics.value.tasks_due_today ?? 0, note: 'Assigned tasks due today', tone: 'gold', route: '/my-tasks' },
  { label: 'Overdue tasks', value: metrics.value.overdue_tasks ?? 0, note: 'Work past its due date', tone: 'red', route: '/my-tasks' },
  { label: 'Leave credits', value: Number(authStore.user?.leave_credits || metrics.value.leave_credits || 0).toFixed(2), note: 'Current available credit pool', tone: 'green', route: '/leave-request' },
  { label: 'Upcoming deadlines', value: metrics.value.upcoming_deadlines ?? employeeUpcomingTasks.value.length, note: 'Due within the next 7 days', tone: 'neutral', route: '/my-tasks' },
])

const kpis = computed(() => isManagement.value ? managementKpis.value : employeeKpis.value)

function toneClasses(tone) {
  if (tone === 'green') return 'border-emerald-900/60 bg-emerald-950/25 text-emerald-300'
  if (tone === 'red') return 'border-red-900/60 bg-red-950/25 text-red-300'
  if (tone === 'gold') return 'border-primary-900/60 bg-primary-950/25 text-primary-300'
  return 'border-gray-700 bg-gray-800/70 text-gray-300'
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRange(start, end) {
  if (!start && !end) return '-'
  return `${formatDate(start)} – ${formatDate(end)}`
}

function formatLabel(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function initials(name) {
  return String(name || 'Employee').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

onMounted(async () => {
  const [, dashboardResult] = await Promise.allSettled([
    leaveStore.fetchRequests(authStore.isEmployee ? { scope: 'mine' } : {}),
    getDashboardOverview(),
  ])
  if (dashboardResult.status === 'fulfilled') overview.value = dashboardResult.value
})
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="eyebrow">Workspace overview</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight text-gray-100 sm:text-4xl">{{ greeting }}, {{ firstName }}</h1>
        <p class="mt-2 text-sm text-gray-400">Here’s what needs your attention across Joyno today.</p>
      </div>
      <div class="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2.5 text-right">
        <p class="text-sm font-medium text-gray-200">{{ todayLabel }}</p>
        <p class="mt-0.5 text-xs capitalize text-gray-500">{{ authStore.role }} workspace</p>
      </div>
    </header>

    <section aria-labelledby="attention-heading">
      <h2 id="attention-heading" class="mb-2.5 text-sm font-semibold text-gray-200">Needs attention</h2>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <RouterLink v-for="item in kpis" :key="item.label" :to="item.route" class="stat-card group flex items-center gap-4">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg font-semibold" :class="toneClasses(item.tone)">{{ item.value }}</span>
          <span class="min-w-0 flex-1"><span class="block text-sm font-medium text-gray-200">{{ item.label }}</span><span class="mt-1 block truncate text-xs text-gray-500">{{ item.note }}</span></span>
          <span class="text-lg text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-primary-300">›</span>
        </RouterLink>
      </div>
    </section>

    <div v-if="isManagement" class="grid gap-4 xl:grid-cols-2">
      <section class="surface-card">
        <div class="surface-header"><div><h2 class="font-semibold text-gray-100">Approval queue</h2><p class="mt-1 text-xs text-gray-500">Oldest pending leave requests first</p></div><RouterLink to="/leave-approvals" class="text-xs font-medium text-primary-300 hover:text-primary-200">Review all</RouterLink></div>
        <div v-if="pendingLeaves.length" class="divide-y divide-gray-800">
          <RouterLink v-for="leave in pendingLeaves" :key="leave.id" to="/leave-approvals" class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition hover:bg-black/25 sm:flex sm:px-5">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary-500/25 bg-primary-500/10 text-xs font-semibold text-primary-300">{{ initials(leave.employee_name) }}</span>
            <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium text-gray-200">{{ leave.employee_name || 'Employee' }}</span><span class="mt-0.5 block text-xs text-gray-500">{{ leave.leave_type_name || 'Leave' }} · {{ formatRange(leave.start_date, leave.end_date) }}</span></span>
            <span class="col-start-2 justify-self-start rounded-full border border-amber-800/60 bg-amber-950/30 px-2.5 py-1 text-[11px] font-medium text-amber-300 sm:ml-auto">Pending</span>
          </RouterLink>
        </div>
        <div v-else class="p-5"><EmptyState compact title="Approval queue is clear" description="New leave requests will appear here." /></div>
      </section>

      <section class="surface-card">
        <div class="surface-header"><div><h2 class="font-semibold text-gray-100">Priority work</h2><p class="mt-1 text-xs text-gray-500">Overdue tasks requiring follow-up</p></div><RouterLink to="/tasks" class="text-xs font-medium text-primary-300 hover:text-primary-200">View tasks</RouterLink></div>
        <div v-if="overdueTasks.length" class="divide-y divide-gray-800">
          <RouterLink v-for="task in overdueTasks" :key="task.id" to="/tasks" class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition hover:bg-black/25 sm:flex sm:px-5">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-900/60 bg-red-950/25 text-red-300">!</span>
            <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium text-gray-200">{{ task.title }}</span><span class="mt-0.5 block text-xs text-gray-500">Due {{ formatDate(task.due_date) }} · {{ task.company_name || task.assigned_email || 'Internal' }}</span></span>
            <span class="col-start-2 justify-self-start text-[11px] font-medium text-red-300 sm:ml-auto">{{ formatLabel(task.priority) }}</span>
          </RouterLink>
        </div>
        <div v-else class="p-5"><EmptyState compact title="Everything is on schedule" description="There are no overdue tasks right now." /></div>
      </section>

      <section class="surface-card">
        <div class="surface-header"><div><h2 class="font-semibold text-gray-100">Team availability</h2><p class="mt-1 text-xs text-gray-500">Approved absences active today</p></div><RouterLink to="/leave-calendar" class="text-xs font-medium text-primary-300 hover:text-primary-200">Open calendar</RouterLink></div>
        <div v-if="awayToday.length" class="grid gap-3 p-5 sm:grid-cols-2">
          <div v-for="leave in awayToday.slice(0, 6)" :key="leave.id" class="flex items-center gap-3 rounded-lg border border-gray-800 bg-black/25 p-3">
            <span class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-gray-300">{{ initials(leave.employee_name) }}</span>
            <span class="min-w-0"><span class="block truncate text-sm font-medium text-gray-200">{{ leave.employee_name }}</span><span class="text-xs text-gray-500">{{ leave.leave_type_name }}</span></span>
          </div>
        </div>
        <div v-else class="p-5"><EmptyState compact title="Full team availability" description="No approved absences are active today." /></div>
      </section>

      <section class="surface-card">
        <div class="surface-header"><div><h2 class="font-semibold text-gray-100">Recent activity</h2><p class="mt-1 text-xs text-gray-500">Latest leave workflow updates</p></div><RouterLink to="/leave-approvals" class="text-xs font-medium text-primary-300 hover:text-primary-200">View activity</RouterLink></div>
        <div v-if="recentActivity.length" class="divide-y divide-gray-800">
          <div v-for="leave in recentActivity" :key="leave.id" class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex sm:px-5">
            <span class="h-2 w-2 shrink-0 rounded-full" :class="leave.status === 'approved' ? 'bg-emerald-400' : leave.status === 'rejected' ? 'bg-red-400' : 'bg-amber-400'" />
            <span class="min-w-0 flex-1 truncate text-sm text-gray-300"><strong class="font-medium text-gray-200">{{ leave.employee_name || 'Employee' }}</strong> · {{ leave.leave_type_name || 'Leave request' }}</span>
            <StatusBadge class="col-start-2 justify-self-start sm:ml-auto" :status="leave.status" />
          </div>
        </div>
        <div v-else class="p-5"><EmptyState compact title="No activity yet" description="Leave workflow changes will appear here." /></div>
      </section>
    </div>

    <div v-else class="grid gap-4 xl:grid-cols-2">
      <section class="surface-card">
        <div class="surface-header"><div><h2 class="font-semibold text-gray-100">Upcoming work</h2><p class="mt-1 text-xs text-gray-500">Tasks due within the next seven days</p></div><RouterLink to="/my-tasks" class="text-xs font-medium text-primary-300 hover:text-primary-200">View tasks</RouterLink></div>
        <div v-if="employeeUpcomingTasks.length" class="divide-y divide-gray-800"><div v-for="task in employeeUpcomingTasks" :key="task.id" class="flex items-center gap-3 px-5 py-3.5"><span class="flex h-9 w-9 items-center justify-center rounded-lg border border-primary-900/60 bg-primary-950/25 text-primary-300">✓</span><span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium text-gray-200">{{ task.title }}</span><span class="text-xs text-gray-500">Due {{ formatDate(task.due_date) }}</span></span><StatusBadge :status="task.status" /></div></div>
        <div v-else class="p-5"><EmptyState compact title="No upcoming deadlines" description="Assigned tasks will appear here." /></div>
      </section>

      <section class="surface-card">
        <div class="surface-header"><div><h2 class="font-semibold text-gray-100">My leave activity</h2><p class="mt-1 text-xs text-gray-500">Recent requests and decisions</p></div><RouterLink to="/leave-request" class="text-xs font-medium text-primary-300 hover:text-primary-200">Manage leave</RouterLink></div>
        <div v-if="recentActivity.length" class="divide-y divide-gray-800"><div v-for="leave in recentActivity" :key="leave.id" class="flex items-center gap-3 px-5 py-3.5"><span class="min-w-0 flex-1"><span class="block text-sm font-medium text-gray-200">{{ leave.leave_type_name }}</span><span class="text-xs text-gray-500">{{ formatRange(leave.start_date, leave.end_date) }}</span></span><StatusBadge :status="leave.status" /></div></div>
        <div v-else class="p-5"><EmptyState compact title="No leave requests yet" description="Your submitted requests will appear here." /></div>
      </section>
    </div>
  </div>
</template>
