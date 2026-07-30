import { computed, ref } from 'vue'
import {
  createLeaveComment,
  getLeaveAvailability,
  getLeaveComments,
  getLeaveTimeline,
  reviewLeaveAttachment,
} from '@/services/backendService'

export function useLeaveReviewController({
  leaveStore,
  toast,
  workspaceRows,
  refreshInbox,
}) {
  const selectedId = ref(null)
  const comments = ref([])
  const timeline = ref([])
  const availability = ref(null)
  const detailLoading = ref(false)
  const actionLoading = ref('')

  const selectedRow = computed(() =>
    workspaceRows.value.find((row) => Number(row.id) === Number(selectedId.value)) || null
  )

  function syncRequest(updated) {
    const index = leaveStore.requests.findIndex((row) => Number(row.id) === Number(updated.id))
    if (index !== -1) leaveStore.requests[index] = updated
  }

  async function loadDetails(row) {
    if (!row?.id) return
    selectedId.value = row.id
    detailLoading.value = true
    try {
      const [commentRows, timelineRows, availabilityResult] = await Promise.all([
        getLeaveComments(row.id).catch(() => []),
        getLeaveTimeline(row.id).catch(() => []),
        getLeaveAvailability({
          employeeId: row.employee_id,
          from: row.start_date,
          to: row.end_date,
          excludeId: row.id,
        }).catch(() => null),
      ])
      comments.value = commentRows
      timeline.value = timelineRows
      availability.value = availabilityResult
      const request = leaveStore.requests.find((item) => Number(item.id) === Number(row.id))
      if (request) request.unread_comment_count = 0
    } finally {
      detailLoading.value = false
    }
  }

  function closePanel() {
    selectedId.value = null
    comments.value = []
    timeline.value = []
    availability.value = null
  }

  async function refreshAfterAction() {
    await refreshInbox()
  }

  async function approve({ approveAsUnpaid = false } = {}) {
    if (!selectedRow.value) return
    actionLoading.value = 'approve'
    try {
      await leaveStore.approve(
        selectedRow.value.id,
        approveAsUnpaid ? { approval_mode: 'unpaid', confirm_unpaid: true } : {}
      )
      toast.success(approveAsUnpaid ? 'Leave approved as unpaid.' : 'Leave request approved.')
      await refreshAfterAction()
    } catch (error) {
      toast.error(error.message || 'Failed to approve leave.')
    } finally {
      actionLoading.value = ''
    }
  }

  async function reject(comment) {
    if (!selectedRow.value || !comment.trim()) return
    actionLoading.value = 'reject'
    try {
      await leaveStore.reject(selectedRow.value.id, { comment: comment.trim() })
      toast.success('Leave request rejected.')
      await refreshAfterAction()
    } catch (error) {
      toast.error(error.message || 'Failed to reject leave.')
    } finally {
      actionLoading.value = ''
    }
  }

  async function markDocumentValid() {
    if (!selectedRow.value) return
    actionLoading.value = 'document'
    try {
      const updated = await reviewLeaveAttachment(selectedRow.value.id, { action: 'mark_valid' })
      syncRequest(updated)
      toast.success('Supporting document marked as valid.')
      await Promise.all([refreshAfterAction(), loadDetails(updated)])
    } catch (error) {
      toast.error(error.message || 'Unable to validate the document.')
    } finally {
      actionLoading.value = ''
    }
  }

  async function requestReplacement({ note, responseDays }) {
    if (!selectedRow.value || !note.trim()) return
    actionLoading.value = 'replacement'
    try {
      const updated = await reviewLeaveAttachment(selectedRow.value.id, {
        action: 'request_replacement',
        note: note.trim(),
        response_days: responseDays,
      })
      syncRequest(updated)
      toast.success('Replacement request sent to the employee.')
      await Promise.all([refreshAfterAction(), loadDetails(updated)])
    } catch (error) {
      toast.error(error.message || 'Unable to request a replacement.')
    } finally {
      actionLoading.value = ''
    }
  }

  async function addNote(message) {
    if (!selectedRow.value || !message.trim()) return
    actionLoading.value = 'note'
    try {
      const created = await createLeaveComment(selectedRow.value.id, message.trim())
      comments.value.push(created)
      timeline.value = await getLeaveTimeline(selectedRow.value.id).catch(() => timeline.value)
      toast.success('Note added.')
    } catch (error) {
      toast.error(error.message || 'Failed to add note.')
    } finally {
      actionLoading.value = ''
    }
  }

  async function remove() {
    if (!selectedRow.value) return
    actionLoading.value = 'delete'
    try {
      await leaveStore.removeByAdmin(selectedRow.value.id)
      toast.success('Leave request deleted.')
      closePanel()
    } catch (error) {
      toast.error(error.message || 'Failed to delete leave request.')
    } finally {
      actionLoading.value = ''
    }
  }

  return {
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
  }
}
