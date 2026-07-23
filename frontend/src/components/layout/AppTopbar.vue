<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import WorkspaceSearch from '@/components/layout/WorkspaceSearch.vue'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useThemeStore } from '@/stores/themeStore'

const emit = defineEmits(['toggle-sidebar'])
const router = useRouter()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const themeStore = useThemeStore()
const menuOpen = ref(false)
const notificationsOpen = ref(false)
const menuRef = ref(null)
const notificationsRef = ref(null)
let pollTimer = null

function refreshNotifications() {
  return notificationStore.fetchList({ limit: 8, offset: 0 }).catch(() => [])
}

const notifications = computed(() => notificationStore.topbarItems)
const unreadCount = computed(() => notificationStore.unreadCount)
const isDarkMode = computed(() => themeStore.mode === 'dark')
const userLabel = computed(() => {
  const user = authStore.user
  return user?.email || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'User'
})
const roleLabel = computed(() => authStore.role === 'ceo' ? 'CEO' : authStore.role
  ? authStore.role.charAt(0).toUpperCase() + authStore.role.slice(1)
  : '')

async function logout() {
  try {
    await authStore.logout()
  } finally {
    menuOpen.value = false
    notificationsOpen.value = false
    router.replace({ name: 'Login' })
  }
}

function toggleNotifications() {
  notificationsOpen.value = !notificationsOpen.value
  menuOpen.value = false
  if (notificationsOpen.value) refreshNotifications()
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  notificationsOpen.value = false
}

async function openNotification(item) {
  if (!item.is_read) await notificationStore.markRead(item.id)
  notificationsOpen.value = false
  const management = ['admin', 'hr', 'ceo'].includes(authStore.role)
  const link = item.target_table === 'leave_requests'
    ? (management ? '/leave-approvals' : '/leave-request')
    : item.target_table === 'tasks' ? (management ? '/tasks' : '/my-tasks') : item.link
  if (link) await router.push(link)
}

function handleOutsideClick(event) {
  if (menuRef.value && !menuRef.value.contains(event.target)) menuOpen.value = false
  if (notificationsRef.value && !notificationsRef.value.contains(event.target)) notificationsOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  refreshNotifications()
  pollTimer = setInterval(() => notificationStore.refreshUnreadCount(), 30000)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <header class="sticky top-0 z-30 grid h-[72px] shrink-0 grid-cols-[1fr_auto] items-center gap-4 border-b border-gray-800 bg-gray-950/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8 xl:grid-cols-[8rem_minmax(18rem,36rem)_minmax(15rem,1fr)]">
    <div class="flex min-w-0 items-center gap-3">
      <button type="button" class="rounded-lg p-2 text-gray-400 hover:bg-gray-900 lg:hidden" aria-label="Open menu" @click="emit('toggle-sidebar')">
        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <span class="flex min-w-0 items-center gap-2 lg:hidden"><img src="/joynomedia-logo.png" alt="" class="h-7 w-7 object-contain" /><span class="truncate text-sm font-semibold text-gray-100">Joyno <span class="text-primary-400">Workspace</span></span></span>
      <span class="hidden text-xs font-medium uppercase tracking-[0.18em] text-gray-600 lg:inline">Operations workspace</span>
    </div>

    <WorkspaceSearch />

    <div class="flex items-center justify-end gap-2">
      <button type="button" class="icon-button h-9 w-9" :aria-label="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'" :title="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'" @click="themeStore.toggleMode">
        <svg v-if="isDarkMode" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" stroke-width="1.8" /><path stroke-linecap="round" stroke-width="1.8" d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
        <svg v-else class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" /></svg>
      </button>

      <div ref="notificationsRef" class="relative">
        <button type="button" class="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-300 hover:bg-gray-800" aria-label="Notifications" @click="toggleNotifications">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9" /></svg>
          <span v-if="unreadCount" class="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold text-white">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
        </button>
        <div v-if="notificationsOpen" class="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-xl">
          <div class="flex items-center justify-between border-b border-gray-800 px-4 py-3"><p class="text-sm font-semibold text-gray-100">Notifications</p><button type="button" class="text-xs text-primary-300 hover:text-primary-200" @click="notificationStore.markAllRead">Mark all read</button></div>
          <div v-if="notifications.length" class="max-h-80 overflow-y-auto">
            <button v-for="item in notifications" :key="item.id" type="button" class="block w-full border-b border-gray-800 px-4 py-3 text-left last:border-0 hover:bg-gray-800/60" @click="openNotification(item)"><span class="flex items-start gap-2"><i v-if="!item.is_read" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" /><span class="min-w-0"><span class="block truncate text-sm font-medium text-gray-100">{{ item.title }}</span><span class="mt-1 block line-clamp-2 text-xs text-gray-500">{{ item.message }}</span></span></span></button>
          </div>
          <p v-else class="px-4 py-6 text-center text-sm text-gray-500">No notifications.</p>
          <RouterLink to="/notifications" class="block border-t border-gray-800 px-4 py-3 text-center text-xs font-medium text-primary-300 hover:bg-gray-800" @click="notificationsOpen = false">View notification center</RouterLink>
        </div>
      </div>

      <div ref="menuRef" class="relative">
        <button type="button" class="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-gray-800 sm:px-2" @click="toggleMenu">
          <span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">{{ userLabel.charAt(0).toUpperCase() }}</span>
          <span class="hidden text-left sm:block lg:hidden 2xl:block"><span class="block max-w-48 truncate text-sm font-medium text-gray-100">{{ userLabel }}</span><span class="block text-xs text-gray-400">{{ roleLabel }}</span></span>
          <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m6 9 6 6 6-6" /></svg>
        </button>
        <div v-if="menuOpen" class="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-gray-800 bg-gray-900 py-1 shadow-xl">
          <RouterLink to="/profile" class="block px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800" @click="menuOpen = false">Profile</RouterLink>
          <button type="button" class="block w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-800" @click="logout">Sign out</button>
        </div>
      </div>
    </div>
  </header>
</template>
