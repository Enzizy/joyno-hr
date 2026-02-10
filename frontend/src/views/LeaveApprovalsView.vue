<script setup>
import { ref, onMounted } from 'vue'
import { useLeaveStore } from '@/stores/leaveStore'
import { useToastStore } from '@/stores/toastStore'
import AppTable from '@/components/ui/AppTable.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const leaveStore = useLeaveStore()
const toast = useToastStore()
const rejectModal = ref(false)
const rejectingRow = ref(null)
const rejectionComment = ref('')
const rejecting = ref(false)
const reasonModal = ref(false)
const reasonRow = ref(null)

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

onMounted(() => leaveStore.fetchRequests())

async function approve(row) {
  try {
    await leaveStore.approve(row.id)
    toast.success('Leave request approved.')
  } catch (err) {
    toast.error(err.message || 'Failed to approve.')
  }
}

function openRejectModal(row) {
  rejectingRow.value = row
  rejectionComment.value = ''
  rejectModal.value = true
}

function closeRejectModal() {
  rejectModal.value = false
  rejectingRow.value = null
  rejectionComment.value = ''
}

function openReasonModal(row) {
  reasonRow.value = row
  reasonModal.value = true
}

function closeReasonModal() {
  reasonModal.value = false
  reasonRow.value = null
}

async function confirmReject() {
  const comment = rejectionComment.value.trim()
  if (!comment) {
    toast.warning('Please enter a reason for the rejection.')
    return
  }
  if (!rejectingRow.value) return
  rejecting.value = true
  try {
    await leaveStore.reject(rejectingRow.value.id, { comment })
    toast.success('Leave request rejected.')
    closeRejectModal()
  } catch (err) {
    toast.error(err.message || 'Failed to reject.')
  } finally {
    rejecting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">Leave Approvals</h1>
      <p class="mt-1 text-sm text-gray-400">Approve or reject leave requests.</p>
    </div>
    <AppTable :loading="leaveStore.loading">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Employee</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Dates</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Type</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Reason</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Attachment</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Status</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Rejection reason</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in leaveStore.requests" :key="row.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm font-medium text-primary-200">
            {{ row.employee_name ?? `${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim() }}
          </td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ formatRange(row.start_date, row.end_date) }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.leave_type_name ?? row.leave_type?.name ?? row.leave_type_id }}</td>
          <td class="px-4 py-3 text-sm text-gray-300 max-w-xs truncate">
            <button
              v-if="row.reason"
              class="text-left text-gray-300 hover:text-primary-200"
              :title="row.reason"
              @click="openReasonModal(row)"
            >
              {{ row.reason }}
            </button>
            <span v-else>-</span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-300">
            <a
              v-if="row.attachment_data"
              :href="row.attachment_data"
              target="_blank"
              rel="noopener"
              class="text-primary-300 hover:text-primary-200"
            >
              View
            </a>
            <span v-else>-</span>
          </td>
          <td class="px-4 py-3">
            <StatusBadge :status="row.status" />
          </td>
          <td class="px-4 py-3 text-sm text-gray-300 max-w-xs truncate" :title="row.rejection_comment">{{ row.status === 'rejected' ? (row.rejection_comment || '-') : '-' }}</td>
          <td class="px-4 py-3 text-right">
            <template v-if="row.status === 'pending'">
              <AppButton variant="primary" size="sm" @click="approve(row)">Approve</AppButton>
              <AppButton variant="danger" size="sm" class="ml-1" @click="openRejectModal(row)">Reject</AppButton>
            </template>
            <span v-else class="text-sm text-gray-400">-</span>
          </td>
        </tr>
        <tr v-if="!leaveStore.requests.length && !leaveStore.loading">
          <td colspan="8" class="px-4 py-8 text-center text-sm text-gray-400">No leave requests.</td>
        </tr>
      </tbody>
    </AppTable>

    <AppModal :show="rejectModal" title="Reject leave request" @close="closeRejectModal">
      <p v-if="rejectingRow" class="mb-3 text-sm text-gray-300">
        Rejecting leave for <strong>{{ rejectingRow.employee_name || 'Employee' }}</strong>
        ({{ formatRange(rejectingRow.start_date, rejectingRow.end_date) }})?
      </p>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Reason for rejection <span class="text-red-500">*</span></label>
        <textarea
          v-model="rejectionComment"
          rows="3"
          required
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 placeholder:text-gray-500 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="Explain why this leave request is being rejected..."
        />
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="closeRejectModal">Cancel</AppButton>
        <AppButton variant="danger" :loading="rejecting" :disabled="!rejectionComment.trim()" @click="confirmReject">Reject</AppButton>
      </template>
    </AppModal>
  </div>
</template>

<AppModal :show="reasonModal" title="Leave reason" @close="closeReasonModal">
  <p class="text-sm text-gray-200 whitespace-pre-wrap">{{ reasonRow?.reason || '-' }}</p>
  <template #footer>
    <AppButton variant="secondary" @click="closeReasonModal">Close</AppButton>
  </template>
</AppModal>


