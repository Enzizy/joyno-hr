<script setup>
import { ref, onMounted } from 'vue'
import { useLeaveStore } from '@/stores/leaveStore'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppTable from '@/components/ui/AppTable.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const leaveStore = useLeaveStore()
const toast = useToastStore()

const form = ref({ leave_type_id: '', start_date: '', end_date: '', reason: '' })
const submitting = ref(false)

onMounted(async () => {
  await leaveStore.fetchTypes()
  await leaveStore.fetchRequests()
})

async function submit() {
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
    toast.error(err.response?.data?.message || 'Failed to submit request.')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Leave Request</h1>
      <p class="mt-1 text-sm text-gray-500">Submit a new leave request.</p>
    </div>
    <div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="submit">
        <div class="sm:col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-700">Leave type *</label>
          <select
            v-model="form.leave_type_id"
            required
            class="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
          >
            <option value="">Select type</option>
            <option v-for="t in leaveStore.leaveTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <AppDatePicker v-model="form.start_date" label="Start date" required />
        <AppDatePicker v-model="form.end_date" label="End date" required />
        <div class="sm:col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-700">Reason <span class="text-red-500">*</span></label>
          <textarea
            v-model="form.reason"
            rows="3"
            required
            class="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            placeholder="Reason for leave"
          />
        </div>
        <div class="sm:col-span-2">
          <AppButton type="submit" :loading="submitting">Submit request</AppButton>
        </div>
      </form>
    </div>
    <div>
      <h2 class="text-lg font-semibold text-gray-900">My leave requests</h2>
      <AppTable :loading="leaveStore.loading" class="mt-2">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Dates</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Rejection reason</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 bg-white">
          <tr v-for="row in leaveStore.requests" :key="row.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 text-sm text-gray-900">{{ row.start_date }} – {{ row.end_date }}</td>
            <td class="px-4 py-3 text-sm text-gray-600">{{ row.leave_type?.name ?? row.leave_type_id }}</td>
            <td class="px-4 py-3">
              <StatusBadge :status="row.status" />
            </td>
            <td class="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" :title="row.rejection_comment">{{ row.status === 'rejected' ? (row.rejection_comment || '—') : '—' }}</td>
          </tr>
          <tr v-if="!leaveStore.requests.length && !leaveStore.loading">
            <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-500">No requests yet.</td>
          </tr>
        </tbody>
      </AppTable>
    </div>
  </div>
</template>
