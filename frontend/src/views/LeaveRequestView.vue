<script setup>
import { ref, onMounted, computed } from 'vue'
import { useLeaveStore } from '@/stores/leaveStore'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppTable from '@/components/ui/AppTable.vue'
import AppModal from '@/components/ui/AppModal.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const leaveStore = useLeaveStore()
const authStore = useAuthStore()
const toast = useToastStore()

const form = ref({ leave_type_id: '', start_date: '', end_date: '', reason: '' })
const submitting = ref(false)
const isOnLeave = computed(() => authStore.user?.status === 'on_leave')
const attachment = ref(null)
const cancelModal = ref(false)
const cancellingRow = ref(null)
const cancelling = ref(false)
const attachmentModal = ref(false)
const attachmentUrl = ref('')
const attachmentLoading = ref(false)
function onAttachmentChange(event) {
  const file = event?.target?.files && event.target.files[0]
  attachment.value = file || null
}
const myRequests = computed(() => {
  const employeeId = authStore.user?.employee_id
  if (!employeeId) return []
  return leaveStore.requests.filter((r) => r.employee_id === employeeId)
})
const todayISO = computed(() => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
})
const endMinDate = computed(() => form.value.start_date || todayISO.value)

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

function hasOverlap(startDate, endDate) {
  if (!startDate || !endDate) return false
  return myRequests.value.some((r) => {
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
    if (attachment.value) {
      const payload = new FormData()
      payload.append('leave_type_id', form.value.leave_type_id)
      payload.append('start_date', form.value.start_date)
      payload.append('end_date', form.value.end_date)
      payload.append('reason', form.value.reason)
      payload.append('attachment', attachment.value)
      await leaveStore.createRequest(payload)
    } else {
      await leaveStore.createRequest({ ...form.value })
    }
    toast.success('Leave request submitted.')
    form.value = { leave_type_id: '', start_date: '', end_date: '', reason: '' }
    attachment.value = null
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

function openCancelModal(row) {
  cancellingRow.value = row
  cancelModal.value = true
}

function closeCancelModal() {
  cancelModal.value = false
  cancellingRow.value = null
}

async function confirmCancel() {
  if (!cancellingRow.value) return
  cancelling.value = true
  try {
    await leaveStore.cancel(cancellingRow.value.id)
    toast.success('Leave request cancelled.')
    closeCancelModal()
  } catch (err) {
    toast.error(err.response?.data?.message || err.message || 'Failed to cancel request.')
  } finally {
    cancelling.value = false
  }
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
        <AppDatePicker
          v-model="form.start_date"
          label="Start date"
          required
          :min="todayISO"
          :disabled="isOnLeave || submitting"
        />
        <AppDatePicker
          v-model="form.end_date"
          label="End date"
          required
          :min="endMinDate"
          :disabled="isOnLeave || submitting"
        />
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
          <label class="mb-1 block text-sm font-medium text-gray-200">Attachment (optional)</label>
          <input
            type="file"
            accept="image/*"
            :disabled="isOnLeave || submitting"
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            @change="onAttachmentChange"
          />
          <p class="mt-1 text-xs text-gray-400">Images only. Max 1MB.</p>
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
            <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Attachment</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Rejection reason</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800 bg-gray-900">
          <tr v-for="row in myRequests" :key="row.id" class="hover:bg-gray-950">
            <td class="px-4 py-3 text-sm text-primary-200">{{ formatRange(row.start_date, row.end_date) }}</td>
            <td class="px-4 py-3 text-sm text-gray-300">{{ row.leave_type_name ?? row.leave_type?.name ?? row.leave_type_id }}</td>
            <td class="px-4 py-3">
              <StatusBadge :status="row.status" />
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
            <td class="px-4 py-3 text-sm text-gray-300 max-w-xs truncate" :title="row.rejection_comment">{{ row.status === 'rejected' ? (row.rejection_comment || '-') : '-' }}</td>
            <td class="px-4 py-3 text-right">
              <AppButton
                v-if="row.status === 'pending'"
                variant="danger"
                size="sm"
                @click="openCancelModal(row)"
              >
                Cancel
              </AppButton>
              <span v-else class="text-sm text-gray-500">-</span>
            </td>
          </tr>
          <tr v-if="!myRequests.length && !leaveStore.loading">
            <td colspan="6" class="px-4 py-8 text-center text-sm text-gray-400">No requests yet.</td>
          </tr>
        </tbody>
      </AppTable>
    </div>
  </div>

  <AppModal :show="cancelModal" title="Cancel leave request" @close="closeCancelModal">
    <p v-if="cancellingRow" class="text-sm text-gray-300">
      Cancel leave request for
      <strong>{{ formatRange(cancellingRow.start_date, cancellingRow.end_date) }}</strong>?
    </p>
    <template #footer>
      <AppButton variant="secondary" @click="closeCancelModal">Close</AppButton>
      <AppButton variant="danger" :loading="cancelling" @click="confirmCancel">Cancel request</AppButton>
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
</template>


