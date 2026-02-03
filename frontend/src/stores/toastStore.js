import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([])

  function add(message, type = 'info', duration = 4000) {
    const id = Date.now()
    toasts.value.push({ id, message, type, duration })
    if (duration > 0) {
      setTimeout(() => remove(id), duration)
    }
    return id
  }

  function remove(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function success(message, duration) {
    return add(message, 'success', duration)
  }
  function error(message, duration) {
    return add(message, 'error', duration)
  }
  function warning(message, duration) {
    return add(message, 'warning', duration)
  }
  function info(message, duration) {
    return add(message, 'info', duration)
  }

  return { toasts, add, remove, success, error, warning, info }
})
