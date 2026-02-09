<script setup>
import { ref, onMounted, computed } from 'vue'
import { useLeaveStore } from '@/stores/leaveStore'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppTable from '@/components/ui/AppTable.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const leaveStore = useLeaveStore()
const authStore = useAuthStore()
const toast = useToastStore()

const form = ref({ leave_type_id: '', start_date: '', end_date: '', reason: '' })
const submitting = ref(false)
const isOnLeave = computed(() => authStore.user?.status === 'on_leave')

function hasOverlap(startDate, endDate) {
  if (!startDate || !endDate) return false
  return leaveStore.requests.some((r) => {
    if (!['pending', 'approved'].includes(r.status)) return false
    if (!r.start_date || !r.end_date) return false
    return startDate <= r.end_date && endDate >= r.start_date
  })
}

onMounted(async () => {
  await leaveStore.fetchTypes()
  await leaveStore.fetchRequests({ scope: 'mine' })
})

async function submit() {
  if (isOnLeave.value) {
    toast.warning('You are currently on leave and cannot submit another request.')
    return
  }
  if (hasOverlap(form.value.start_date, form.value.end_date)) {
    toast.warning('You already have a pending or approved leave that overlaps these dates.')
    return
  }
  if (!form.value.leave_type_id || !form.value.start_date || !form.value.end_date) {
    toast.warning('Please fill required fields.')
    return
  }
  if (!(form.value.reason || '').trim()) {
    toast.warning('Leave reason is required.')
    return
  }
  submitting.value = true
  try {
    await leaveStore.createRequest(form.value)
    toast.success('Leave request submitted.')
    form.value = { leave_type_id: '', start_date: '', end_date: '', reason: '' }
  } catch (err) {
    const code = err?.code || err?.response?.data?.code
    if (code === 'permission-denied') {
      toast.error('You are not allowed to submit a leave request at this time.')
    } else {
      toast.error(err.response?.data?.message || err.message || 'Failed to submit request.')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">Leave Request</h1>
      <p class="mt-1 text-sm text-gray-400">Submit a new leave request.</p>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-sm">
      <p v-if="isOnLeave" class="mb-3 rounded-lg border border-amber-900/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
        You are currently on leave and cannot submit another request.
      </p>
      <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="submit">
        <div class="sm:col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-200">Leave type *</label>
          <select
            v-model="form.leave_type_id"
            required
            :disabled="isOnLeave || submitting"
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="" class="bg-gray-900 text-primary-200">Select type</option>
            <option v-for="t in leaveStore.leaveTypes" :key="t.id" :value="t.id" class="bg-gray-900 text-primary-200">{{ t.name }}</option>
          </select>
        </div>
        <AppDatePicker v-model="form.start_date" label="Start date" required :disabled="isOnLeave || submitting" />
        <AppDatePicker v-model="form.end_date" label="End date" required :disabled="isOnLeave || submitting" />
        <div class="sm:col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-200">Reason <span class="text-red-500">*</span></label>
          <textarea
            v-model="form.reason"
            rows="3"
            required
            :disabled="isOnLeave || submitting"
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 placeholder:text-gray-500 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="Reason for leave"
          />
        </div>
        <div class="sm:col-span-2">
          <AppButton type="submit" :loading="submitting" :disabled="isOnLeave">Submit request</AppButton>
        </div>
      </form>
    </div>
    <div>
      <h2 class="text-lg font-semibold text-primary-200">My leave requests</h2>
      <AppTable :loading="leaveStore.loading" class="mt-2">
        <thead class="bg-gray-950">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Dates</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Type</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Status</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Rejection reason</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800 bg-gray-900">
          <tr v-for="row in leaveStore.requests" :key="row.id" class="hover:bg-gray-950">
            <td class="px-4 py-3 text-sm text-primary-200">{{ row.start_date }} - {{ row.end_date }}</td>
            <td class="px-4 py-3 text-sm text-gray-300">{{ row.leave_type_name ?? row.leave_type?.name ?? row.leave_type_id }}</td>
            <td class="px-4 py-3">
              <StatusBadge :status="row.status" />
            </td>
            <td class="px-4 py-3 text-sm text-gray-300 max-w-xs truncate" :title="row.rejection_comment">{{ row.status === 'rejected' ? (row.rejection_comment || '-') : '-' }}</td>
          </tr>
          <tr v-if="!leaveStore.requests.length && !leaveStore.loading">
            <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">No requests yet.</td>
          </tr>
        </tbody>
      </AppTable>
    </div>
  </div>
</template>


