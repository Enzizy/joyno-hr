import { computed, onMounted, ref } from 'vue'
import {
  createLeaveChangeRequest,
  getLeaveChangeRequests,
} from '@/services/backendService'

export function useEmployeeLeaveChanges() {
  const requests = ref([])
  const loading = ref(false)

  const pendingByLeaveId = computed(() => new Map(
    requests.value
      .filter((request) => request.status === 'pending')
      .map((request) => [Number(request.leave_request_id), request])
  ))

  async function refresh() {
    loading.value = true
    try {
      requests.value = await getLeaveChangeRequests({ scope: 'mine' })
      return requests.value
    } finally {
      loading.value = false
    }
  }

  async function submit(payload) {
    const created = await createLeaveChangeRequest(payload)
    requests.value = [created, ...requests.value]
    return created
  }

  onMounted(() => {
    refresh().catch(() => {})
  })

  return { loading, pendingByLeaveId, refresh, requests, submit }
}
