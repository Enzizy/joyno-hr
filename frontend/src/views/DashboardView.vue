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

onMounted(async () => {
  await leaveStore.fetchRequests({ limit: 5 })
})

const recentLeaves = computed(() => leaveStore.requests.slice(0, 5))
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{{ greeting }}</h1>
      <p class="mt-1 text-sm text-gray-500">Here’s an overview of your activity.</p>
    </div>

    <!-- Role-aware widgets -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-500">Role</p>
        <p class="mt-1 text-xl font-semibold text-gray-900 capitalize">{{ role }}</p>
      </div>
      <div v-if="authStore.user?.employee_id" class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-500">Employee ID</p>
        <p class="mt-1 text-xl font-semibold text-gray-900">{{ authStore.user.employee_id }}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-sm font-medium text-gray-500">Status</p>
        <p class="mt-1">
          <StatusBadge status="active" />
        </p>
      </div>
    </div>

    <!-- Recent leave requests -->
    <div v-if="authStore.isEmployee || authStore.isHR || authStore.isAdmin" class="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div class="border-b border-gray-200 px-4 py-3">
        <h2 class="text-lg font-semibold text-gray-900">Recent Leave Requests</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Dates</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Type</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="row in recentLeaves" :key="row.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm text-gray-900">{{ row.start_date }} – {{ row.end_date }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ row.leave_type?.name ?? row.leave_type_id }}</td>
              <td class="px-4 py-3">
                <StatusBadge :status="row.status" />
              </td>
            </tr>
            <tr v-if="!recentLeaves.length && !leaveStore.loading">
              <td colspan="3" class="px-4 py-8 text-center text-sm text-gray-500">No leave requests yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Admin/HR quick links -->
    <div v-if="authStore.canAccessHR" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <router-link
        to="/employees"
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow"
      >
        <span class="text-lg">👥</span>
        <p class="mt-2 font-medium text-gray-900">Employee Management</p>
        <p class="text-sm text-gray-500">View and manage employees</p>
      </router-link>
      <router-link
        to="/leave-approvals"
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow"
      >
        <span class="text-lg">✓</span>
        <p class="mt-2 font-medium text-gray-900">Leave Approvals</p>
        <p class="text-sm text-gray-500">Approve or reject leave</p>
      </router-link>
      <router-link
        to="/reports"
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow"
      >
        <span class="text-lg">📈</span>
        <p class="mt-2 font-medium text-gray-900">Reports</p>
        <p class="text-sm text-gray-500">Leave reports</p>
      </router-link>
    </div>
  </div>
</template>
