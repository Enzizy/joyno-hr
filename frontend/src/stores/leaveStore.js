import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import {
  getLeaveTypes,
  getLeaveBalances,
  getLeaveRequests,
  getLeaveRequestsForEmployee,
  createLeaveRequest as createRequestApi,
  approveLeaveRequest,
  rejectLeaveRequest,
} from '@/services/firestore'

export const useLeaveStore = defineStore('leave', () => {
  const leaveTypes = ref([])
  const balances = ref([])
  const requests = ref([])
  const loading = ref(false)
  const total = ref(0)

  async function fetchTypes() {
    leaveTypes.value = await getLeaveTypes()
    return leaveTypes.value
  }

  async function fetchBalances(employeeId = null) {
    const id = employeeId ?? useAuthStore().user?.employee_id
    if (!id) {
      balances.value = []
      return []
    }
    balances.value = await getLeaveBalances(id)
    return balances.value
  }

  async function fetchRequests(options = {}) {
    loading.value = true
    try {
      if (options.scope === 'mine') {
        requests.value = await getLeaveRequestsForEmployee()
      } else {
        requests.value = await getLeaveRequests()
      }
      total.value = requests.value.length
      return requests.value
    } finally {
      loading.value = false
    }
  }

  async function createRequest(payload) {
    const authStore = useAuthStore()
    const employeeId = authStore.user?.employee_id
    if (!employeeId) throw new Error('No employee linked to your account')
    const data = await createRequestApi({ ...payload, employee_id: employeeId })
    requests.value = [data, ...requests.value]
    return data
  }

  async function approve(id) {
    const data = await approveLeaveRequest(id)
    const idx = requests.value.findIndex((r) => r.id === id)
    if (idx !== -1) requests.value[idx] = data
    return data
  }

  async function reject(id, payload = {}) {
    const comment = payload.comment || ''
    const data = await rejectLeaveRequest(id, comment)
    const idx = requests.value.findIndex((r) => r.id === id)
    if (idx !== -1) requests.value[idx] = data
    return data
  }

  return {
    leaveTypes,
    balances,
    requests,
    loading,
    total,
    fetchTypes,
    fetchBalances,
    fetchRequests,
    createRequest,
    approve,
    reject,
  }
})
