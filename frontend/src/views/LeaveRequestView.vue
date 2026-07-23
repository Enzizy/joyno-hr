<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useLeaveStore } from '@/stores/leaveStore'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { createLeaveComment, getLeaveComments, getLeavePolicySettings, getLeaveTimeline } from '@/services/backendService'
import { usePhilippineWorkingDays } from '@/composables/usePhilippineWorkingDays'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppModal from '@/components/ui/AppModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmployeeLeaveRequestForm from '@/components/leave/EmployeeLeaveRequestForm.vue'
import EmployeeLeaveRequestsList from '@/components/leave/EmployeeLeaveRequestsList.vue'
import LeaveBalanceCards from '@/components/leave/LeaveBalanceCards.vue'
import LeaveCalendarPanel from '@/components/leave/LeaveCalendarPanel.vue'
import LeaveDetailsModal from '@/components/leave/LeaveDetailsModal.vue'
import LeavePolicyDetails from '@/components/leave/LeavePolicyDetails.vue'
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

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
const editModal = ref(false)
const editingRow = ref(null)
const editSubmitting = ref(false)
const editAttachment = ref(null)
const editForm = ref({ leave_type_id: '', start_date: '', end_date: '', reason: '' })
const conversationModal = ref(false)
const conversationRow = ref(null)
const comments = ref([])
const commentsLoading = ref(false)
const reply = ref('')
const sendingReply = ref(false)
const replyModal = ref(false)
const timeline = ref([])
const timelineLoading = ref(false)
const policySettings = ref({ probationary_months: 6, probationary_leave_type_id: 'leave_of_absence' })
function onAttachmentChange(event) {
  const file = event?.target?.files && event.target.files[0]
  attachment.value = file || null
}
const myRequests = computed(() => {
  const employeeId = authStore.user?.employee_id
  if (!employeeId) return []
  return leaveStore.requests.filter((r) => r.employee_id === employeeId)
})
const { workingDays: requestedDays } = usePhilippineWorkingDays(
  computed(() => form.value.start_date),
  computed(() => form.value.end_date)
)
function isPaidLeaveEligible(dateHired, leaveStartDate, minMonths = 0) {
  if (!dateHired || !leaveStartDate) return false
  const hired = new Date(dateHired)
  const leaveStart = new Date(leaveStartDate)
  if (Number.isNaN(hired.getTime()) || Number.isNaN(leaveStart.getTime())) return false
  const minDate = new Date(hired)
  minDate.setMonth(minDate.getMonth() + Number(minMonths || 0))
  return leaveStart >= minDate
}
function isBelowProbationaryService(dateHired) {
  if (!dateHired) return true
  const hired = new Date(dateHired)
  const today = new Date()
  if (Number.isNaN(hired.getTime())) return true
  let months = (today.getFullYear() - hired.getFullYear()) * 12 + (today.getMonth() - hired.getMonth())
  if (today.getDate() < hired.getDate()) months -= 1
  return months < Number(policySettings.value.probationary_months ?? 6)
}
const leaveTypeMap = computed(() =>
  leaveStore.leaveTypes.reduce((acc, type) => {
    acc[type.id] = type
    return acc
  }, {})
)
const selectedLeaveType = computed(() => leaveTypeMap.value[form.value.leave_type_id] || null)
const selectedEditLeaveType = computed(() => leaveTypeMap.value[editForm.value.leave_type_id] || null)
const isBelowSixMonths = computed(() => isBelowProbationaryService(authStore.user?.date_hired))
const missingRequiredDocumentForPaid = computed(
  () => Boolean(selectedLeaveType.value?.requires_attachment_for_paid) && !attachment.value
)
function filingNoticeDays(type) {
  return Math.max(0, Number(type?.filing_notice_days || 0))
}
function addDaysToISO(dateStr, daysToAdd = 0) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  date.setDate(date.getDate() + Number(daysToAdd || 0))
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function paidDaysCap(typeId) {
  const type = leaveTypeMap.value[typeId]
  return Number(type?.paid_days_per_year ?? 0)
}

function paidDaysUsedForType(typeName, year) {
  return myRequests.value
    .filter((r) => {
      if (r.status !== 'approved') return false
      if (!['paid', 'partial_paid'].includes((r.leave_pay_type || '').toLowerCase())) return false
      if ((r.leave_type_name || '').toLowerCase() !== String(typeName || '').toLowerCase()) return false
      const startYear = String(r.start_date || '').slice(0, 4)
      return Number(startYear) === Number(year)
    })
    .reduce((sum, r) => sum + Number(r.credits_deducted || 0), 0)
}

function remainingPaidDays(typeId, date) {
  const type = leaveTypeMap.value[typeId]
  const cap = paidDaysCap(typeId)
  if (!type || cap <= 0) return 0
  const baseDate = date || new Date().toISOString().slice(0, 10)
  const year = new Date(baseDate).getFullYear()
  const used = paidDaysUsedForType(type.name, year)
  return Math.max(0, cap - used)
}

const payTypePreview = computed(() => {
  const type = selectedLeaveType.value
  if (!requestedDays.value || !type) return '-'
  if (isBelowSixMonths.value) return 'unpaid'
  const cap = paidDaysCap(type.id)
  if (!cap) return 'unpaid'
  if (!isPaidLeaveEligible(authStore.user?.date_hired, form.value.start_date, type.min_months_employed || 0)) {
    return 'unpaid'
  }
  if (missingRequiredDocumentForPaid.value) return 'unpaid'
  const remaining = remainingPaidDays(type.id, form.value.start_date)
  const payableDays = Math.min(remaining, leaveCreditsAvailable.value)
  if (!payableDays) return 'unpaid'
  if (requestedDays.value <= payableDays) return 'paid'
  return 'partial_paid'
})

const leaveEntitlements = computed(() => {
  const balanceDate = form.value.start_date || new Date().toISOString().slice(0, 10)
  const year = new Date(balanceDate).getFullYear()
  return leaveStore.leaveTypes
    .map((type) => ({
      id: type.id,
      name: type.name,
      total: paidDaysCap(type.id),
      remaining: remainingPaidDays(type.id, form.value.start_date),
      minMonths: Number(type.min_months_employed || 0),
      eligible: isPaidLeaveEligible(authStore.user?.date_hired, balanceDate, type.min_months_employed || 0),
      noticeDays: Number(type.filing_notice_days || 0),
      requiresAttachment: Boolean(type.requires_attachment_for_paid),
      remarks: type.remarks || '',
      year,
    }))
})
const probationaryLeaveName = computed(() =>
  leaveTypeMap.value[policySettings.value.probationary_leave_type_id]?.name || 'Leave of Absence'
)
const todayISO = computed(() => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
})
const leaveCreditsAvailable = computed(() => Number(authStore.user?.leave_credits || 0))
const startMinDate = computed(() =>
  addDaysToISO(todayISO.value, isBelowSixMonths.value ? 0 : filingNoticeDays(selectedLeaveType.value))
)
const editStartMinDate = computed(() =>
  addDaysToISO(todayISO.value, isBelowSixMonths.value ? 0 : filingNoticeDays(selectedEditLeaveType.value))
)
const endMinDate = computed(() => form.value.start_date || startMinDate.value)
const editEndMinDate = computed(() => editForm.value.start_date || editStartMinDate.value)
const selectedLeaveFilingNoticeDays = computed(() =>
  isBelowSixMonths.value ? 0 : filingNoticeDays(selectedLeaveType.value)
)
const selectedEditLeaveFilingNoticeDays = computed(() =>
  isBelowSixMonths.value ? 0 : filingNoticeDays(selectedEditLeaveType.value)
)

watch(
  () => form.value.leave_type_id,
  () => {
    if (form.value.start_date && form.value.start_date < startMinDate.value) {
      form.value.start_date = ''
      form.value.end_date = ''
    }
  }
)

watch(
  () => editForm.value.leave_type_id,
  () => {
    if (editForm.value.start_date && editForm.value.start_date < editStartMinDate.value) {
      editForm.value.start_date = ''
      editForm.value.end_date = ''
    }
  }
)

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

function hasOverlap(startDate, endDate, excludeId = null) {
  if (!startDate || !endDate) return false
  return myRequests.value.some((r) => {
    if (excludeId && r.id === excludeId) return false
    if (!['pending', 'approved'].includes(r.status)) return false
    if (!r.start_date || !r.end_date) return false
    return startDate <= r.end_date && endDate >= r.start_date
  })
}

onMounted(async () => {
  await authStore.fetchMe()
  await Promise.all([
    leaveStore.fetchTypes(),
    leaveStore.fetchRequests({ scope: 'mine' }),
    getLeavePolicySettings().then((data) => { policySettings.value = data }).catch(() => {}),
  ])
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
      const created = await leaveStore.createRequest(payload)
      if (created?.compensation_message) toast.info(created.compensation_message)
    } else {
      const created = await leaveStore.createRequest({ ...form.value })
      if (created?.compensation_message) toast.info(created.compensation_message)
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

function resolveLeaveTypeId(row) {
  const byId = leaveStore.leaveTypes.find((type) => String(type.id) === String(row.leave_type_id))
  if (byId) return byId.id
  const byName = leaveStore.leaveTypes.find(
    (type) => String(type.name || '').toLowerCase() === String(row.leave_type_name || '').toLowerCase()
  )
  return byName?.id || ''
}

function openEditModal(row) {
  editingRow.value = row
  editForm.value = {
    leave_type_id: resolveLeaveTypeId(row),
    start_date: row.start_date,
    end_date: row.end_date,
    reason: row.reason || '',
  }
  editAttachment.value = null
  editModal.value = true
}

function closeEditModal() {
  editModal.value = false
  editingRow.value = null
  editAttachment.value = null
}

async function submitEdit() {
  if (!editingRow.value) return
  if (hasOverlap(editForm.value.start_date, editForm.value.end_date, editingRow.value.id)) {
    toast.warning('You already have a pending or approved leave that overlaps these dates.')
    return
  }
  if (!editForm.value.leave_type_id || !editForm.value.start_date || !editForm.value.end_date) {
    toast.warning('Please fill required fields.')
    return
  }
  if (!(editForm.value.reason || '').trim()) {
    toast.warning('Leave reason is required.')
    return
  }
  editSubmitting.value = true
  try {
    if (editAttachment.value) {
      const payload = new FormData()
      payload.append('leave_type_id', editForm.value.leave_type_id)
      payload.append('start_date', editForm.value.start_date)
      payload.append('end_date', editForm.value.end_date)
      payload.append('reason', editForm.value.reason)
      payload.append('attachment', editAttachment.value)
      const updated = await leaveStore.updateRequest(editingRow.value.id, payload)
      if (updated?.compensation_message) toast.info(updated.compensation_message)
    } else {
      const updated = await leaveStore.updateRequest(editingRow.value.id, { ...editForm.value })
      if (updated?.compensation_message) toast.info(updated.compensation_message)
    }
    toast.success('Leave request updated.')
    closeEditModal()
  } catch (err) {
    toast.error(err.response?.data?.message || err.message || 'Failed to update request.')
  } finally {
    editSubmitting.value = false
  }
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

function onEditAttachmentChange(event) {
  const file = event?.target?.files && event.target.files[0]
  editAttachment.value = file || null
}

async function openConversation(row) {
  conversationRow.value = row
  conversationModal.value = true
  commentsLoading.value = true
  timelineLoading.value = true
  const timelinePromise = getLeaveTimeline(row.id).catch(() => [])
  try {
    comments.value = await getLeaveComments(row.id)
    row.unread_comment_count = 0
  } catch (err) {
    toast.error(err.message || 'Failed to load leave conversation.')
  } finally {
    commentsLoading.value = false
  }
  timeline.value = await timelinePromise
  timelineLoading.value = false
}

async function sendReply() {
  if (!conversationRow.value || !reply.value.trim()) return
  sendingReply.value = true
  try {
    const created = await createLeaveComment(conversationRow.value.id, reply.value.trim())
    comments.value.push(created)
    timeline.value.push({ id: `comment-${created.id}`, type: 'comment', title: 'Comment added', actor: created.author_name || 'You', actor_role: 'employee', message: created.message, created_at: created.created_at })
    reply.value = ''
    replyModal.value = false
    toast.success('Reply sent.')
  } catch (err) {
    toast.error(err.message || 'Failed to send reply.')
  } finally {
    sendingReply.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Leave" description="Plan time away, understand your balance, and track every request." eyebrow="My workspace" />

    <LeaveBalanceCards :entitlements="leaveEntitlements" :leave-credits="leaveCreditsAvailable" />

    <div v-if="isBelowSixMonths" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-700/40 bg-amber-500/10 px-4 py-3 text-amber-200">
      <div class="flex min-w-0 items-center gap-3">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 font-bold text-amber-300">!</span>
        <p class="text-sm"><strong>Probationary leave policy applies.</strong> You may file without advance notice; the request will be recorded as unpaid {{ probationaryLeaveName }}.</p>
      </div>
      <span class="text-xs text-amber-300">First {{ Number(policySettings.probationary_months ?? 6) }} months</span>
    </div>

    <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
      <EmployeeLeaveRequestForm
        :form="form"
        :leave-types="leaveStore.leaveTypes"
        :entitlements="leaveEntitlements"
        :requested-days="requestedDays"
        :pay-type-preview="payTypePreview"
        :selected-type="selectedLeaveType"
        :missing-document="missingRequiredDocumentForPaid"
        :filing-notice-days="selectedLeaveFilingNoticeDays"
        :start-min="startMinDate"
        :end-min="endMinDate"
        :disabled="isOnLeave"
        :submitting="submitting"
        @submit="submit"
        @attachment-change="onAttachmentChange"
      />
      <LeaveCalendarPanel compact :show-filters="false" />
    </div>

    <EmployeeLeaveRequestsList
      :rows="myRequests"
      :loading="leaveStore.loading"
      @details="openConversation"
      @attachment="openAttachment"
      @edit="openEditModal"
      @cancel="openCancelModal"
    />
    <LeavePolicyDetails :entitlements="leaveEntitlements" />
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
  <LeaveDetailsModal
    :show="conversationModal"
    :row="conversationRow"
    :comments="comments"
    :comments-loading="commentsLoading"
    :timeline="timeline"
    :timeline-loading="timelineLoading"
    @close="conversationModal = false"
    @add-note="replyModal = true"
    @view-attachment="openAttachment"
  />
  <AppModal :show="replyModal" title="Reply to management" @close="replyModal = false">
    <label class="text-sm font-medium text-gray-200">Message<textarea v-model="reply" rows="4" maxlength="2000" class="form-control mt-1.5 resize-y" placeholder="Write your reply…" /><span class="mt-1 block text-right text-xs font-normal text-gray-500">{{ reply.length }} / 2000</span></label>
    <template #footer><AppButton variant="secondary" @click="replyModal = false">Cancel</AppButton><AppButton :loading="sendingReply" :disabled="!reply.trim()" @click="sendReply">Send reply</AppButton></template>
  </AppModal>
  <AppModal :show="editModal" title="Edit leave request" @close="closeEditModal">
    <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="submitEdit">
      <div class="sm:col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-200">Leave type *</label>
        <select
          v-model="editForm.leave_type_id"
          required
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="" class="bg-gray-900 text-primary-200">Select type</option>
          <option v-for="t in leaveStore.leaveTypes" :key="t.id" :value="t.id" class="bg-gray-900 text-primary-200">{{ t.name }}</option>
        </select>
        <p v-if="isBelowSixMonths" class="mt-2 text-xs text-amber-300">
          This request will use the configured probationary unpaid leave policy.
        </p>
        <p
          v-if="selectedEditLeaveFilingNoticeDays > 0"
          class="mt-2 inline-flex rounded-full border border-amber-700/40 bg-amber-900/20 px-3 py-1 text-xs font-medium text-amber-200"
        >
          Advance filing required: at least {{ selectedEditLeaveFilingNoticeDays }} days before start date.
        </p>
      </div>
      <AppDatePicker
        v-model="editForm.start_date"
        label="Start date"
        required
        :min="editStartMinDate"
      />
      <AppDatePicker
        v-model="editForm.end_date"
        label="End date"
        required
        :min="editEndMinDate"
      />
      <div class="sm:col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-200">Reason <span class="text-red-500">*</span></label>
        <textarea
          v-model="editForm.reason"
          rows="3"
          required
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 placeholder:text-gray-500 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="Reason for leave"
        />
      </div>
      <div class="sm:col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-200">Replace attachment (optional)</label>
        <input
          type="file"
          accept="image/*"
          class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          @change="onEditAttachmentChange"
        />
        <p class="mt-1 text-xs text-gray-400">Leave empty to keep current attachment.</p>
      </div>
      <div class="sm:col-span-2 flex justify-end gap-2">
        <AppButton type="button" variant="secondary" @click="closeEditModal">Close</AppButton>
        <AppButton type="submit" :loading="editSubmitting">Save changes</AppButton>
      </div>
    </form>
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


