import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  grantEmployeeCredits,
} from '@/services/backendService'

export const useEmployeeStore = defineStore('employee', () => {
  const list = ref([])
  const current = ref(null)
  const loading = ref(false)
  const total = ref(0)

  const employees = computed(() => list.value)

  async function fetchList() {
    loading.value = true
    try {
      list.value = await getEmployees()
      total.value = list.value.length
      return list.value
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id) {
    loading.value = true
    try {
      current.value = await getEmployee(id)
      return current.value
    } finally {
      loading.value = false
    }
  }

  async function create(payload) {
    const data = await createEmployee(payload)
    list.value = [data, ...list.value]
    return data
  }

  async function update(id, payload) {
    const data = await updateEmployee(id, payload)
    const idx = list.value.findIndex((e) => e.id === id)
    if (idx !== -1) list.value[idx] = { ...list.value[idx], ...data }
    if (current.value?.id === id) current.value = { ...current.value, ...data }
    return data
  }

  async function remove(id) {
    await deleteEmployee(id)
    list.value = list.value.filter((e) => e.id !== id)
    if (current.value?.id === id) current.value = null
  }

  async function grantCredits(id, amount) {
    const data = await grantEmployeeCredits(id, amount)
    const idx = list.value.findIndex((e) => e.id === id)
    if (idx !== -1) list.value[idx] = { ...list.value[idx], ...data }
    if (current.value?.id === id) current.value = { ...current.value, ...data }
    return data
  }

  function clearCurrent() {
    current.value = null
  }

  return {
    list,
    current,
    loading,
    total,
    employees,
    fetchList,
    fetchOne,
    create,
    update,
    remove,
    grantCredits,
    clearCurrent,
  }
})
