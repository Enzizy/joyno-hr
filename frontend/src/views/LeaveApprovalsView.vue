<script setup>
import { computed, onMounted, ref } from 'vue'
import { useLeaveStore } from '@/stores/leaveStore'
import { useToastStore } from '@/stores/toastStore'
import { getEmployees } from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import LeaveApprovalQueue from '@/components/leave/LeaveApprovalQueue.vue'
import LeaveAttachmentPreviewModal from '@/components/leave/LeaveAttachmentPreviewModal.vue'
import LeaveChangeRequestInbox from '@/components/leave/LeaveChangeRequestInbox.vue'
import LeaveReviewPanel from '@/components/leave/LeaveReviewPanel.vue'
import { useAttachmentPreview } from '@/composables/useAttachmentPreview'
import { useLeaveApprovalInbox } from '@/composables/useLeaveApprovalInbox'
import { useLeaveApprovalWorkspace } from '@/composables/useLeaveApprovalWorkspace'
import { useLeaveReviewController } from '@/composables/useLeaveReviewController'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const leaveStore = useLeaveStore()
const toast = useToastStore()
const employees = ref([])
const deleteConfirmation = ref(false)

const {
  bulkApprove,
  bulkApproving,
  inboxLoading,
  inboxRows,
  loadInbox,
} = useLeaveApprovalInbox(leaveStore, toast)

const workspace = useLeaveApprovalWorkspace(leaveStore, employees, inboxRows)
const {
  activeTab,
  counts,
  departmentFilter,
  departmentOptions,
  documentReviewRows,
  filteredRows,
  page,
  pageCount,
  pagedRows,
  readyRows,
  resetFilters,
  rows,
  scheduleFilter,
  searchQuery,
  typeFilter,
  typeOptions,
} = workspace

const review = useLeaveReviewController({
  leaveStore,
  toast,
  workspaceRows: rows,
  refreshInbox: loadInbox,
})
const {
  actionLoading,
  addNote,
  approve,
  availability,
  closePanel,
  comments,
  detailLoading,
  loadDetails,
  markDocumentValid,
  reject,
  remove,
  requestReplacement,
  selectedId,
  selectedRow,
  timeline,
} = review

const {
  close: closeAttachment,
  isPdf: attachmentIsPdf,
  loading: attachmentLoading,
  open: openAttachment,
  show: attachmentModal,
  url: attachmentUrl,
} = useAttachmentPreview(API_BASE)

const entitlementRows = computed(() =>
  leaveStore.leaveTypes.map((type) => ({
    id: type.id,
    name: type.name,
    paidDays: Number(type.paid_days_per_year ?? 0),
    minMonths: Number(type.min_months_employed || 0),
    requiresAttachment: Boolean(type.requires_attachment_for_paid),
  }))
)
const loading = computed(() => leaveStore.loading || inboxLoading.value)
function changeTab(tab) {
  closePanel()
  activeTab.value = tab
}

async function reviewRow(row) {
  await loadDetails(row)
}

async function confirmDelete() {
  await remove()
  deleteConfirmation.value = false
}

onMounted(async () => {
  const [, employeeRows] = await Promise.all([
    Promise.all([leaveStore.fetchRequests(), leaveStore.fetchTypes(), loadInbox()]),
    getEmployees().catch(() => []),
  ])
  employees.value = employeeRows
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      title="Leave approvals"
      description="Review requests, documents, and team availability."
      eyebrow="Leave management"
    />

    <details class="group surface-card-muted">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-gray-300">
        <span>Leave move and cancellation requests</span>
        <span class="text-gray-600 transition group-open:rotate-90">›</span>
      </summary>
      <div class="border-t border-gray-800 p-3">
        <LeaveChangeRequestInbox />
      </div>
    </details>

    <div class="min-w-0">
      <LeaveApprovalQueue
        :active-tab="activeTab"
        :counts="counts"
        :rows="pagedRows"
        :document-rows="documentReviewRows"
        :ready-rows="readyRows"
        :loading="loading"
        :bulk-loading="bulkApproving"
        :selected-id="selectedId"
        :search-query="searchQuery"
        :type-filter="typeFilter"
        :department-filter="departmentFilter"
        :schedule-filter="scheduleFilter"
        :type-options="typeOptions"
        :department-options="departmentOptions"
        :page="page"
        :page-count="pageCount"
        :total="filteredRows.length"
        @update:active-tab="changeTab"
        @update:search-query="searchQuery = $event"
        @update:type-filter="typeFilter = $event"
        @update:department-filter="departmentFilter = $event"
        @update:schedule-filter="scheduleFilter = $event"
        @update:page="page = $event"
        @reset="resetFilters"
        @review="reviewRow"
        @bulk-approve="bulkApprove"
      />

      <LeaveReviewPanel
        :row="selectedRow"
        :comments="comments"
        :timeline="timeline"
        :availability="availability"
        :detail-loading="detailLoading"
        :action-loading="actionLoading"
        @close="closePanel"
        @view-document="openAttachment"
        @mark-document-valid="markDocumentValid"
        @request-replacement="requestReplacement"
        @approve="approve"
        @reject="reject"
        @add-note="addNote"
        @delete="deleteConfirmation = true"
      />
    </div>

    <details class="group surface-card-muted">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-gray-400">
        <span>Leave policy reference</span>
        <span class="text-gray-600 transition group-open:rotate-90">›</span>
      </summary>
      <div class="grid gap-3 border-t border-gray-800 p-4 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="type in entitlementRows" :key="type.id" class="rounded-lg border border-gray-800 bg-gray-900 p-3 text-xs text-gray-500">
          <p class="font-semibold text-gray-200">{{ type.name }}</p>
          <p class="mt-1.5 leading-5">
            <template v-if="type.paidDays > 0">{{ type.paidDays }} paid day(s) after {{ type.minMonths }} month(s).</template>
            <template v-else>Unpaid by default.</template>
            <span v-if="type.requiresAttachment"> Supporting document required.</span>
          </p>
        </div>
      </div>
    </details>

    <AppModal :show="deleteConfirmation" title="Delete leave request?" @close="deleteConfirmation = false">
      <p class="text-sm leading-6 text-gray-300">
        This permanently removes <strong class="text-gray-100">{{ selectedRow?.employee_name }}</strong>'s leave record.
      </p>
      <template #footer>
        <AppButton variant="secondary" @click="deleteConfirmation = false">Cancel</AppButton>
        <AppButton variant="danger" :loading="actionLoading === 'delete'" @click="confirmDelete">Delete record</AppButton>
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
