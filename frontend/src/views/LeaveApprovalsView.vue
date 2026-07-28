<script setup>
import { ref, onMounted, computed } from 'vue'
import { useLeaveStore } from '@/stores/leaveStore'
import { useToastStore } from '@/stores/toastStore'
import {
  createLeaveComment,
  getEmployees,
  getLeaveAvailability,
  getLeaveComments,
  getLeaveTimeline,
} from '@/services/backendService'
import AppTable from '@/components/ui/AppTable.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LeaveDetailsModal from '@/components/leave/LeaveDetailsModal.vue'
import LeaveApprovalCards from '@/components/leave/LeaveApprovalCards.vue'
import LeaveApprovalInbox from '@/components/leave/LeaveApprovalInbox.vue'
import LeaveApprovalDecisionModals from '@/components/leave/LeaveApprovalDecisionModals.vue'
import LeaveAttachmentPreviewModal from '@/components/leave/LeaveAttachmentPreviewModal.vue'
import LeaveChangeRequestInbox from '@/components/leave/LeaveChangeRequestInbox.vue'
import { usePersistentFilters } from '@/composables/usePersistentFilters'
import { useLeaveApprovalInbox } from '@/composables/useLeaveApprovalInbox'
import { useLeaveDocumentApproval } from '@/composables/useLeaveDocumentApproval'
import { useAttachmentPreview } from '@/composables/useAttachmentPreview'
import { getAttachmentReviewPresentation } from '@/utils/leaveAttachmentPresentation'
import trashIcon from '@/assets/icons/trash.svg?raw'
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const leaveStore = useLeaveStore()
const toast = useToastStore()
const rejectModal = ref(false)
const rejectingRow = ref(null)
const rejectionComment = ref('')
const rejecting = ref(false)
const deleteModal = ref(false)
const deletingRow = ref(null)
const deleting = ref(false)
const {
  close: closeAttachment,
  isPdf: attachmentIsPdf,
  loading: attachmentLoading,
  open: openAttachment,
  show: attachmentModal,
  url: attachmentUrl,
} = useAttachmentPreview(API_BASE)
const statusFilter = ref('all')
const typeFilter = ref('all')
const nameQuery = ref('')
const page = ref(1)
const pageSize = ref(10)
usePersistentFilters('leave-approvals', { statusFilter, typeFilter, nameQuery, pageSize })
const reasonMax = 24
const detailsModal = ref(false)
const detailsRow = ref(null)
const comments = ref([])
const commentsLoading = ref(false)
const noteModal = ref(false)
const note = ref('')
const savingNote = ref(false)
const employees = ref([])
const availability = ref(null)
const availabilityLoading = ref(false)
const timeline = ref([])
const timelineLoading = ref(false)
const { bulkApprove, bulkApproving, inboxLoading, inboxRows, loadInbox, resolveInboxRow } = useLeaveApprovalInbox(leaveStore, toast)
const entitlementRows = computed(() =>
  leaveStore.leaveTypes.map((type) => ({
    id: type.id,
    name: type.name,
    paidDays: Number(type.paid_days_per_year ?? 0),
    minMonths: Number(type.min_months_employed || 0),
    requiresAttachment: Boolean(type.requires_attachment_for_paid),
    remarks: type.remarks || '',
  }))
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
onMounted(async () => {
  const [, employeeRows] = await Promise.all([
    leaveStore.fetchRequests(),
    getEmployees().catch(() => []),
    loadInbox(),
  ])
  employees.value = employeeRows
})
async function openDetails(row) {
  detailsRow.value = row
  detailsModal.value = true
  commentsLoading.value = true
  availabilityLoading.value = true
  timelineLoading.value = true
  const commentsPromise = getLeaveComments(row.id)
  const timelinePromise = getLeaveTimeline(row.id).catch(() => [])
  const availabilityPromise = getLeaveAvailability({
    employeeId: row.employee_id,
    from: row.start_date,
    to: row.end_date,
    excludeId: row.id,
  }).catch(() => calculateAvailability(row))
  try {
    comments.value = await commentsPromise
    row.unread_comment_count = 0
  } catch (err) {
    toast.error(err.message || 'Failed to load leave conversation.')
  } finally {
    commentsLoading.value = false
  }
  timeline.value = await timelinePromise
  availability.value = await availabilityPromise
  timelineLoading.value = false
  availabilityLoading.value = false
}
function closeDetails() {
  detailsModal.value = false
  detailsRow.value = null
  comments.value = []
  timeline.value = []
  availability.value = null
}
function calculateAvailability(row) {
  const employeeMap = new Map(employees.value.map((employee) => [Number(employee.id), employee]))
  const employee = employeeMap.get(Number(row.employee_id))
  const department = employee?.department || 'Unassigned'
  const departmentEmployees = employees.value.filter((item) => (item.department || 'Unassigned') === department && ['active', 'on_leave'].includes(item.status))
  const conflicts = leaveStore.requests.filter((request) => {
    if (Number(request.id) === Number(row.id) || Number(request.employee_id) === Number(row.employee_id)) return false
    if (!['pending', 'approved'].includes(request.status)) return false
    const requestEmployee = employeeMap.get(Number(request.employee_id))
    if ((requestEmployee?.department || 'Unassigned') !== department) return false
    return request.start_date <= row.end_date && request.end_date >= row.start_date
  })
  return {
    department,
    department_headcount: departmentEmployees.length,
    unavailable_count: conflicts.length,
    remaining_available: Math.max(0, departmentEmployees.length - conflicts.length - 1),
    warning_threshold: 2,
    has_warning: conflicts.length >= 2,
    conflicts,
  }
}
async function saveNote() {
  if (!detailsRow.value || !note.value.trim()) return
  savingNote.value = true
  try {
    const created = await createLeaveComment(detailsRow.value.id, note.value.trim())
    comments.value.push(created)
    note.value = ''
    noteModal.value = false
    toast.success('Note added.')
  } catch (err) {
    toast.error(err.message || 'Failed to add note.')
  } finally {
    savingNote.value = false
  }
}
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
    const q = nameQuery.value.trim().toLowerCase()
    if (q) {
      const emp = String(
        r.employee_name ?? `${r.employee?.first_name || ''} ${r.employee?.last_name || ''}`
      )
        .trim()
        .toLowerCase()
      if (!emp.includes(q)) return false
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
  nameQuery.value = ''
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

const {
  approveModal,
  approving,
  approvingRow,
  approvalBlockedForReview,
  approvalDocumentStatus,
  approvalRequiresUnpaidConfirmation,
  confirmApprove,
  markDocumentValid: reviewDocumentAsValid,
  openApproveModal,
  openReplacementModal,
  replacementDays,
  replacementModal,
  replacementReason,
  requestDocumentReplacement: submitDocumentReplacementRequest,
  reviewingDocument,
  unpaidApprovalConfirmed,
} = useLeaveDocumentApproval(leaveStore, toast, { loadInbox, closeDetails })

function syncDetailsRow(updated) {
  if (detailsRow.value && Number(detailsRow.value.id) === Number(updated.id)) detailsRow.value = updated
}

function markDocumentValid(row) {
  return reviewDocumentAsValid(row, syncDetailsRow)
}

function requestDocumentReplacement() {
  return submitDocumentReplacementRequest(syncDetailsRow)
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

function openDeleteModal(row) {
  deletingRow.value = row
  deleteModal.value = true
}

function closeDeleteModal() {
  deleteModal.value = false
  deletingRow.value = null
}

function truncateReason(text) {
  if (!text) return '-'
  const str = String(text)
  if (str.length <= reasonMax) return str
  return `${str.slice(0, reasonMax)}…`
}

function payBreakdown(row) {
  const paid = Number(row?.paid_days || 0)
  const unpaid = Number(row?.unpaid_days || 0)
  if (paid <= 0 && unpaid <= 0) return ''
  return `${paid.toFixed(0)} paid / ${unpaid.toFixed(0)} unpaid`
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
    await loadInbox()
  } catch (err) {
    toast.error(err.message || 'Failed to reject.')
  } finally {
    rejecting.value = false
  }
}

async function confirmDelete() {
  if (!deletingRow.value) return
  deleting.value = true
  try {
    await leaveStore.removeByAdmin(deletingRow.value.id)
    toast.success('Leave request deleted.')
    closeDeleteModal()
  } catch (err) {
    toast.error(err.message || 'Failed to delete leave request.')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Leave Approvals" description="Review request details, communicate with employees, and make informed decisions." eyebrow="Leave management" />
    <LeaveChangeRequestInbox />
    <LeaveApprovalInbox :rows="inboxRows" :loading="inboxLoading" :bulk-loading="bulkApproving" @details="openDetails(resolveInboxRow($event))" @approve="openApproveModal(resolveInboxRow($event))" @reject="openRejectModal(resolveInboxRow($event))" @bulk-approve="bulkApprove" />
    <details class="group surface-card-muted">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-gray-300">
        <span>Leave policy reference <span class="ml-2 text-xs font-normal text-gray-600">Eligibility, allowances, and documents</span></span>
        <span class="text-gray-600 transition group-open:rotate-180">⌄</span>
      </summary>
      <div class="grid gap-3 border-t border-gray-800 p-4 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="type in entitlementRows" :key="`ent-${type.id}`" class="rounded-lg border border-gray-800 bg-gray-900 p-3 text-xs text-gray-400">
          <p class="font-semibold text-gray-200">{{ type.name }}</p>
          <p class="mt-1.5 leading-5"><template v-if="type.paidDays > 0">{{ type.paidDays }} paid day(s) after {{ type.minMonths }} month(s).</template><template v-else>Unpaid by default.</template><span v-if="type.requiresAttachment"> Supporting document required.</span></p>
        </div>
        <p class="rounded-lg border border-gray-800 bg-black/25 p-3 text-xs leading-5 text-gray-500">AWOL is assigned by Admin or HR and cannot be requested by employees.</p>
      </div>
    </details>
    <div class="filter-panel flex flex-wrap items-end gap-4">
      <div class="min-w-[220px]">
        <label class="mb-1 block text-sm font-medium text-gray-200">Employee</label>
        <input
          v-model="nameQuery"
          type="text"
          placeholder="Search name"
          class="form-control"
        />
      </div>
      <div class="min-w-[180px]">
        <label class="mb-1 block text-sm font-medium text-gray-200">Status</label>
        <select
          v-model="statusFilter"
          class="form-control"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div class="min-w-[200px]">
        <label class="mb-1 block text-sm font-medium text-gray-200">Type</label>
        <select
          v-model="typeFilter"
          class="form-control"
        >
          <option value="all">All</option>
          <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
        </select>
      </div>
      <div class="min-w-[140px]">
        <label class="mb-1 block text-sm font-medium text-gray-200">Rows</label>
        <select
          :value="pageSize"
          class="form-control"
          @change="changePageSize"
        >
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </div>
      <AppButton variant="secondary" @click="resetFilters">Reset</AppButton>
    </div>
    <LeaveApprovalCards :rows="pagedRequests" :loading="leaveStore.loading" @details="openDetails" @approve="openApproveModal" @reject="openRejectModal" @delete="openDeleteModal" />
    <AppTable :loading="leaveStore.loading" class="hidden md:block">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Employee</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Dates</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Type</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Pay</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Reason</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Attachment</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Status</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in pagedRequests" :key="row.id" class="cursor-pointer hover:bg-gray-950" @click="openDetails(row)">
          <td class="px-4 py-3 text-sm font-medium text-primary-200">
            <span class="relative inline-block">
              {{ row.employee_name ?? `${row.employee?.first_name || ''} ${row.employee?.last_name || ''}`.trim() }}
              <span v-if="row.unread_comment_count" class="absolute -right-2 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" title="Unread leave reply" />
            </span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ formatRange(row.start_date, row.end_date) }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.leave_type_name ?? row.leave_type?.name ?? row.leave_type_id }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">
            <span class="uppercase">{{ row.leave_pay_type || 'unpaid' }}</span>
            <span v-if="payBreakdown(row)" class="ml-1 text-xs text-gray-400">
              ({{ payBreakdown(row) }})
            </span>
            <span v-if="Number(row.credits_deducted || 0) > 0" class="ml-1 text-xs text-gray-400">
              ({{ Number(row.credits_deducted).toFixed(2) }} cr)
            </span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-300 max-w-[140px] truncate">
            <span v-if="row.reason" :title="row.reason">{{ truncateReason(row.reason) }}</span>
            <span v-else>-</span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-300">
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-if="row.attachment_data"
                class="text-primary-300 hover:text-primary-200"
                @click.stop="openAttachment(row)"
              >
                View
              </button>
              <StatusBadge
                v-if="row.attachment_review_status && row.attachment_review_status !== 'not_required'"
                :status="getAttachmentReviewPresentation(row.attachment_review_status).label"
                :variant="getAttachmentReviewPresentation(row.attachment_review_status).variant"
              >
                {{ getAttachmentReviewPresentation(row.attachment_review_status).label }}
              </StatusBadge>
              <span v-if="!row.attachment_data && row.attachment_review_status === 'not_required'">-</span>
            </div>
          </td>
          <td class="px-4 py-3">
            <StatusBadge :status="row.status" />
          </td>
          <td class="px-4 py-3 text-right">
            <template v-if="row.status === 'pending'">
              <div class="flex justify-end gap-1">
                <AppButton variant="success" size="sm" @click.stop="openApproveModal(row)">Approve</AppButton>
                <AppButton variant="danger" size="sm" @click.stop="openRejectModal(row)">Reject</AppButton>
              </div>
            </template>
            <template v-else>
              <div class="flex justify-end">
                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 bg-transparent text-red-400 transition hover:border-red-500/50 hover:text-red-300"
                  title="Delete leave request"
                  @click.stop="openDeleteModal(row)"
                >
                  <span class="trash-icon" aria-hidden="true" v-html="trashIcon" />
                </button>
              </div>
            </template>
          </td>
        </tr>
        <tr v-if="!pagedRequests.length && !leaveStore.loading">
          <td colspan="8" class="p-4"><EmptyState title="No leave requests found" description="Try adjusting the filters or check back when employees submit requests." /></td>
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

    <LeaveDetailsModal
      :show="detailsModal"
      :row="detailsRow"
      :comments="comments"
      :comments-loading="commentsLoading"
      :timeline="timeline"
      :timeline-loading="timelineLoading"
      :availability="availability"
      :availability-loading="availabilityLoading"
      :document-reviewing="reviewingDocument"
      management
      @close="closeDetails"
      @add-note="noteModal = true"
      @approve="openApproveModal"
      @reject="openRejectModal"
      @view-attachment="openAttachment"
      @mark-document-valid="markDocumentValid"
      @request-document-replacement="openReplacementModal"
    />

    <LeaveApprovalDecisionModals
      :approve-modal="approveModal"
      :approving="approving"
      :row="approvingRow"
      :document-status="approvalDocumentStatus"
      :blocked-for-review="approvalBlockedForReview"
      :requires-unpaid-confirmation="approvalRequiresUnpaidConfirmation"
      :unpaid-confirmed="unpaidApprovalConfirmed"
      :replacement-modal="replacementModal"
      :replacement-reason="replacementReason"
      :replacement-days="replacementDays"
      :reviewing-document="reviewingDocument"
      @close-approve="approveModal = false"
      @approve="confirmApprove"
      @view-document="openAttachment"
      @mark-document-valid="markDocumentValid"
      @update:unpaid-confirmed="unpaidApprovalConfirmed = $event"
      @close-replacement="replacementModal = false"
      @update:replacement-reason="replacementReason = $event"
      @update:replacement-days="replacementDays = $event"
      @request-replacement="requestDocumentReplacement"
    />

    <AppModal :show="noteModal" title="Add leave note" @close="noteModal = false">
      <textarea v-model="note" rows="4" class="form-control resize-y" placeholder="Write a note for the employee..." />
      <template #footer>
        <AppButton variant="secondary" @click="noteModal = false">Cancel</AppButton>
        <AppButton :loading="savingNote" :disabled="!note.trim()" @click="saveNote">Send note</AppButton>
      </template>
    </AppModal>

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
          class="form-control resize-y"
          placeholder="Explain why this leave request is being rejected..."
        />
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="closeRejectModal">Cancel</AppButton>
        <AppButton variant="danger" :loading="rejecting" :disabled="!rejectionComment.trim()" @click="confirmReject">Reject</AppButton>
      </template>
    </AppModal>
    <AppModal :show="deleteModal" title="Delete leave request" @close="closeDeleteModal">
      <p v-if="deletingRow" class="text-sm text-gray-300">
        Delete leave request for
        <strong>{{ deletingRow.employee_name || 'Employee' }}</strong>
        ({{ formatRange(deletingRow.start_date, deletingRow.end_date) }})?
      </p>
      <p class="mt-2 text-xs text-amber-300">
        This permanently removes the record from the database.
      </p>
      <template #footer>
        <AppButton variant="secondary" @click="closeDeleteModal">Cancel</AppButton>
        <AppButton variant="danger" :loading="deleting" @click="confirmDelete">Delete</AppButton>
      </template>
    </AppModal>
    <LeaveAttachmentPreviewModal
      :show="attachmentModal"
      :loading="attachmentLoading"
      :url="attachmentUrl"
      :is-pdf="attachmentIsPdf"
      @close="closeAttachment"
    />
  </div>
</template>

<style scoped>
.trash-icon :deep(svg) {
  width: 1rem;
  height: 1rem;
  display: block;
}

.trash-icon :deep(path) {
  fill: currentColor;
}
</style>


