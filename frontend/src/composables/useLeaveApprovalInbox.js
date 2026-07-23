import { ref } from 'vue'
import { getLeaveApprovalInbox } from '@/services/backendService'

export function useLeaveApprovalInbox(leaveStore, toast) {
  const inboxRows = ref([])
  const inboxLoading = ref(false)
  const bulkApproving = ref(false)

  async function loadInbox() {
    inboxLoading.value = true
    try {
      inboxRows.value = await getLeaveApprovalInbox()
    } catch (error) {
      toast.error(error.message || 'Failed to load approval inbox.')
    } finally {
      inboxLoading.value = false
    }
  }

  function resolveInboxRow(row) {
    return leaveStore.requests.find((item) => Number(item.id) === Number(row.id)) || row
  }

  async function bulkApprove(ids) {
    if (!ids.length) return
    bulkApproving.value = true
    let approved = 0
    try {
      for (const id of ids) {
        await leaveStore.approve(id)
        approved += 1
      }
      toast.success(`${approved} low-risk leave request${approved === 1 ? '' : 's'} approved.`)
      await loadInbox()
    } catch (error) {
      toast.error(`${approved} approved before an error occurred: ${error.message || 'Approval failed.'}`)
    } finally {
      bulkApproving.value = false
    }
  }

  return { bulkApprove, bulkApproving, inboxLoading, inboxRows, loadInbox, resolveInboxRow }
}
