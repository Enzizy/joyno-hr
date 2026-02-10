<script setup>
import { ref, onMounted, computed } from 'vue'
import { useLeaveStore } from '@/stores/leaveStore'
import { useToastStore } from '@/stores/toastStore'
import AppTable from '@/components/ui/AppTable.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const leaveStore = useLeaveStore()
const toast = useToastStore()
const rejectModal = ref(false)
const rejectingRow = ref(null)
const rejectionComment = ref('')
const rejecting = ref(false)
const reasonModal = ref(false)
const reasonRow = ref(null)
const attachmentModal = ref(false)
const attachmentUrl = ref('')
const attachmentLoading = ref(false)
const statusFilter = ref('all')
const typeFilter = ref('all')
const page = ref(1)
const pageSize = ref(10)
const reasonMax = 24

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

const typeOptions = computed(() => {
  const set = new Set()
  leaveStore.requests.forEach((r) => {
    const name = r.leave_type_name || r.leave_type_id
    if (name) set.add(String(name))
  })
  return Array.from(set)
})

const filteredRequests = computed(() => {
  return leaveStore.requests.filter((r) => {
    if (statusFilter.value !== 'all' && r.status !== statusFilter.value) return false
    if (typeFilter.value !== 'all') {
      const name = String(r.leave_type_name || r.leave_type_id || '')
      if (name !== typeFilter.value) return false
    }
    return true
  })
})

const pagedRequests = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredRequests.value.slice(start, start + pageSize.value)
})

const canPrev = computed(() => page.value > 1)
const canNext = computed(() => filteredRequests.value.length > page.value * pageSize.value)

function resetFilters() {
  statusFilter.value = 'all'
  typeFilter.value = 'all'
  page.value = 1
}

function changePageSize(event) {
  pageSize.value = Number(event.target.value) || 10
  page.value = 1
}

function nextPage() {
  if (!canNext.value) return
  page.value += 1
}

function prevPage() {
  if (!canPrev.value) return
  page.value -= 1
}

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

function truncateReason(text) {
  if (!text) return '-'
  const str = String(text)
  if (str.length <= reasonMax) return str
  return `${str.slice(0, reasonMax)}…`
}

async function openAttachment(row) {
  if (!row?.id) return
  attachmentLoading.value = true
  attachmentModal.value = true
  const token = localStorage.getItem('token')
  try {
    const res = await fetch(`${API_BASE}/api/leave-requests/${row.id}/attachment`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('Unable to load attachment')
    const blob = await res.blob()
    attachmentUrl.value = URL.createObjectURL(blob)
  } catch {
    attachmentUrl.value = ''
  } finally {
    attachmentLoading.value = false
  }
}

function closeAttachment() {
  attachmentModal.value = false
  if (attachmentUrl.value) URL.revokeObjectURL(attachmentUrl.value)
  attachmentUrl.value = ''
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
    <div class="flex flex-wrap items-end gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
      <div class="min-w-[180px]">
        <label class="mb-1 block text-sm font-medium text-gray-200">Status</label>
        <select
          v-model="statusFilter"
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div class="min-w-[200px]">
        <label class="mb-1 block text-sm font-medium text-gray-200">Type</label>
        <select
          v-model="typeFilter"
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="all">All</option>
          <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
        </select>
      </div>
      <div class="min-w-[140px]">
        <label class="mb-1 block text-sm font-medium text-gray-200">Rows</label>
        <select
          :value="pageSize"
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
          @change="changePageSize"
        >
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </div>
      <AppButton variant="secondary" @click="resetFilters">Reset</AppButton>
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
        <tr v-for="row in pagedRequests" :key="row.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm font-medium text-primary-200">
            {{ row.employee_name ?? `${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim() }}
          </td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ formatRange(row.start_date, row.end_date) }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.leave_type_name ?? row.leave_type?.name ?? row.leave_type_id }}</td>
          <td class="px-4 py-3 text-sm text-gray-300 max-w-[140px] truncate">
            <button
              v-if="row.reason"
              class="text-left text-gray-300 hover:text-primary-200"
              :title="row.reason"
              @click="openReasonModal(row)"
            >
              {{ truncateReason(row.reason) }}
            </button>
            <span v-else>-</span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-300">
            <button
              v-if="row.attachment_data"
              class="text-primary-300 hover:text-primary-200"
              @click="openAttachment(row)"
            >
              View
            </button>
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
        <tr v-if="!pagedRequests.length && !leaveStore.loading">
          <td colspan="8" class="px-4 py-8 text-center text-sm text-gray-400">No leave requests.</td>
        </tr>
      </tbody>
    </AppTable>
    <div class="flex items-center justify-end gap-2">
      <button
        class="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200 transition hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canPrev"
        @click="prevPage"
      >
        &larr;
      </button>
      <span class="text-sm text-gray-400">Page {{ page }}</span>
      <button
        class="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-200 transition hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canNext"
        @click="nextPage"
      >
        &rarr;
      </button>
    </div>

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
    <AppModal :show="reasonModal" title="Leave reason" @close="closeReasonModal">
      <p class="text-sm text-gray-200 whitespace-pre-wrap">{{ reasonRow?.reason || '-' }}</p>
      <template #footer>
        <AppButton variant="secondary" @click="closeReasonModal">Close</AppButton>
      </template>
    </AppModal>
    <AppModal :show="attachmentModal" title="Attachment" @close="closeAttachment">
      <div v-if="attachmentLoading" class="flex items-center justify-center py-8">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
      <div v-else>
        <img v-if="attachmentUrl" :src="attachmentUrl" alt="Attachment" class="max-h-[70vh] w-full rounded-lg object-contain" />
        <p v-else class="text-sm text-gray-400">Unable to load attachment.</p>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="closeAttachment">Close</AppButton>
      </template>
    </AppModal>
  </div>
</template>


