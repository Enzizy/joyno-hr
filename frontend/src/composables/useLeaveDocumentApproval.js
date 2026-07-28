import { computed, ref } from 'vue'
import { reviewLeaveAttachment } from '@/services/backendService'

export function useLeaveDocumentApproval(leaveStore, toast, { loadInbox, closeDetails }) {
  const approveModal = ref(false)
  const approvingRow = ref(null)
  const approving = ref(false)
  const unpaidApprovalConfirmed = ref(false)
  const replacementModal = ref(false)
  const replacementRow = ref(null)
  const replacementReason = ref('')
  const replacementDays = ref(2)
  const reviewingDocument = ref(false)

  const approvalDocumentStatus = computed(() =>
    approvingRow.value?.attachment_review_status || 'not_required'
  )
  const approvalBlockedForReview = computed(() =>
    ['pending_review', 'replacement_required'].includes(approvalDocumentStatus.value)
  )
  const approvalRequiresUnpaidConfirmation = computed(() =>
    ['missing', 'deadline_missed'].includes(approvalDocumentStatus.value)
  )

  function openApproveModal(row) {
    approvingRow.value = row
    unpaidApprovalConfirmed.value = false
    approveModal.value = true
  }

  function updateRequestRow(updated) {
    const index = leaveStore.requests.findIndex((row) => Number(row.id) === Number(updated.id))
    if (index !== -1) leaveStore.requests[index] = updated
    if (approvingRow.value && Number(approvingRow.value.id) === Number(updated.id)) {
      approvingRow.value = updated
    }
  }

  async function confirmApprove() {
    if (!approvingRow.value || approvalBlockedForReview.value) return
    if (approvalRequiresUnpaidConfirmation.value && !unpaidApprovalConfirmed.value) return
    approving.value = true
    try {
      await leaveStore.approve(
        approvingRow.value.id,
        approvalRequiresUnpaidConfirmation.value
          ? { approval_mode: 'unpaid', confirm_unpaid: true }
          : {}
      )
      toast.success('Leave request approved.')
      approveModal.value = false
      closeDetails()
      await loadInbox()
    } catch (error) {
      toast.error(error.message || 'Failed to approve.')
    } finally {
      approving.value = false
    }
  }

  async function markDocumentValid(row, onUpdated) {
    reviewingDocument.value = true
    try {
      const updated = await reviewLeaveAttachment(row.id, { action: 'mark_valid' })
      updateRequestRow(updated)
      onUpdated?.(updated)
      toast.success('Supporting document marked as valid.')
      await loadInbox()
    } catch (error) {
      toast.error(error.message || 'Unable to validate the document.')
    } finally {
      reviewingDocument.value = false
    }
  }

  function openReplacementModal(row) {
    replacementRow.value = row
    replacementReason.value = ''
    replacementDays.value = 2
    replacementModal.value = true
  }

  async function requestDocumentReplacement(onUpdated) {
    if (!replacementRow.value || !replacementReason.value.trim()) return
    reviewingDocument.value = true
    try {
      const updated = await reviewLeaveAttachment(replacementRow.value.id, {
        action: 'request_replacement',
        note: replacementReason.value.trim(),
        response_days: replacementDays.value,
      })
      updateRequestRow(updated)
      onUpdated?.(updated)
      replacementModal.value = false
      replacementRow.value = null
      toast.success('Replacement request sent to the employee.')
      await loadInbox()
    } catch (error) {
      toast.error(error.message || 'Unable to request a replacement.')
    } finally {
      reviewingDocument.value = false
    }
  }

  return {
    approveModal,
    approving,
    approvingRow,
    approvalBlockedForReview,
    approvalDocumentStatus,
    approvalRequiresUnpaidConfirmation,
    confirmApprove,
    markDocumentValid,
    openApproveModal,
    openReplacementModal,
    replacementDays,
    replacementModal,
    replacementReason,
    requestDocumentReplacement,
    reviewingDocument,
    unpaidApprovalConfirmed,
  }
}
