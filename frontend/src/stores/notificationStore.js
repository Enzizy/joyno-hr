import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markManyNotificationsRead,
  cleanupNotifications,
} from '@/services/backendService'

function resolveNotificationLink(item) {
  if (!item) return null
  if (item.target_table === 'tasks') return '/tasks'
  if (item.target_table === 'leave_requests') return '/leave-approvals'
  if (item.target_table === 'clients') return '/clients'
  if (item.target_table === 'leads') return '/leads'
  if (item.target_table === 'automation_rules') return '/automation'
  return '/notifications'
}

export const useNotificationStore = defineStore('notification', () => {
  const items = ref([])
  const total = ref(0)
  const unreadCount = ref(0)
  const loading = ref(false)

  const topbarItems = computed(() =>
    items.value.slice(0, 8).map((item) => ({
      ...item,
      link: resolveNotificationLink(item),
    }))
  )

  async function fetchList(options = {}) {
    loading.value = true
    try {
      const data = await getNotifications(options)
      items.value = data.items || []
      total.value = Number(data.total || 0)
      unreadCount.value = Number(data.unread_count || 0)
      return items.value
    } finally {
      loading.value = false
    }
  }

  async function refreshUnreadCount() {
    const data = await getNotifications({ limit: 1, offset: 0 })
    unreadCount.value = Number(data.unread_count || 0)
    return unreadCount.value
  }

  async function markRead(id) {
    const updated = await markNotificationRead(id)
    const idx = items.value.findIndex((item) => item.id === id)
    if (idx !== -1) items.value[idx] = updated
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    return updated
  }

  async function markAllRead() {
    await markAllNotificationsRead()
    items.value = items.value.map((item) => ({ ...item, is_read: true }))
    unreadCount.value = 0
  }

  async function markManyRead(ids = []) {
    if (!ids.length) return
    await markManyNotificationsRead(ids)
    const idSet = new Set(ids.map((id) => Number(id)))
    let reduced = 0
    items.value = items.value.map((item) => {
      if (idSet.has(Number(item.id)) && !item.is_read) {
        reduced += 1
        return { ...item, is_read: true }
      }
      return item
    })
    unreadCount.value = Math.max(0, unreadCount.value - reduced)
  }

  async function runCleanup(days = 90) {
    return cleanupNotifications(days)
  }

  return {
    items,
    total,
    unreadCount,
    loading,
    topbarItems,
    fetchList,
    refreshUnreadCount,
    markRead,
    markAllRead,
    markManyRead,
    runCleanup,
  }
})
