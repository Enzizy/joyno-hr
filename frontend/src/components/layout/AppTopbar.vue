<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useThemeStore } from '@/stores/themeStore'

const router = useRouter()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const themeStore = useThemeStore()
const menuOpen = ref(false)
const notificationsOpen = ref(false)
const menuRef = ref(null)
const notificationsRef = ref(null)
const emit = defineEmits(['toggle-sidebar'])
let pollTimer = null
const notifications = computed(() => notificationStore.topbarItems)
const unreadCount = computed(() => notificationStore.unreadCount)

const userLabel = computed(() => {
  const u = authStore.user
  if (!u) return 'User'
  return u.email || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User'
})

const roleLabel = computed(() => {
  const r = authStore.role
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : ''
})
const isLightMode = computed(() => themeStore.mode === 'light')
const themeToggleClass = computed(() =>
  isLightMode.value
    ? 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200'
    : 'border-gray-600 bg-gray-800 text-primary-200 hover:bg-gray-700'
)

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
  if (notificationsOpen.value) menuOpen.value = false
  if (notificationsOpen.value) notificationStore.fetchList({ limit: 8, offset: 0 })
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) notificationsOpen.value = false
}

function toggleTheme() {
  themeStore.toggleMode()
}

async function openNotification(item) {
  if (!item.is_read) await notificationStore.markRead(item.id)
  notificationsOpen.value = false
  if (item.link) await router.push(item.link)
}

function markAllRead() {
  notificationStore.markAllRead()
}

function handleOutsideClick(event) {
  const target = event.target
  if (menuRef.value && !menuRef.value.contains(target)) menuOpen.value = false
  if (notificationsRef.value && !notificationsRef.value.contains(target)) notificationsOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  notificationStore.fetchList({ limit: 8, offset: 0 })
  pollTimer = setInterval(() => {
    notificationStore.refreshUnreadCount()
  }, 30000)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <header class="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-primary-900/40 bg-gray-900/95 px-4 shadow-sm backdrop-blur md:px-6">
    <div class="flex items-center gap-4">
      <button
        type="button"
        class="rounded-lg p-2 text-gray-400 hover:bg-gray-800 lg:hidden"
        aria-label="Menu"
        @click="emit('toggle-sidebar')"
      >
        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span class="text-sm font-semibold text-primary-200">Joyno HR</span>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
        :class="themeToggleClass"
        :aria-label="isLightMode ? 'Switch to dark mode' : 'Switch to light mode'"
        @click="toggleTheme"
      >
        <svg
          v-if="isLightMode"
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8z" />
        </svg>
        <svg
          v-else
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66 5.66 1.42 1.42M4.92 4.92l1.42 1.42m11.32-1.42-1.42 1.42M6.34 17.66l-1.42 1.42M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
        </svg>
        {{ isLightMode ? 'Dark' : 'Light' }}
      </button>
      <div ref="notificationsRef" class="relative">
        <button
          type="button"
          class="relative rounded-lg p-2 text-gray-300 hover:bg-gray-800"
          aria-label="Notifications"
          @click="toggleNotifications"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9" />
          </svg>
          <span
            v-if="unreadCount > 0"
            class="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold text-white"
          >
            {{ unreadCount > 9 ? '9+' : unreadCount }}
          </span>
        </button>
        <div
          v-if="notificationsOpen"
          class="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-gray-800 bg-gray-900 py-2 shadow-lg"
        >
          <div class="flex items-center justify-between px-3 pb-2">
            <p class="text-sm font-semibold text-primary-200">Notifications</p>
            <button
              type="button"
              class="text-xs text-primary-300 hover:text-primary-200"
              @click="markAllRead"
            >
              Mark all read
            </button>
          </div>
          <div v-if="notifications.length" class="max-h-80 overflow-y-auto">
            <button
              v-for="item in notifications"
              :key="item.id"
              type="button"
              class="block w-full border-t border-gray-800 px-3 py-2 text-left hover:bg-gray-800/60"
              @click="openNotification(item)"
            >
              <p class="text-sm font-medium text-gray-100">{{ item.title }}</p>
              <p class="text-xs text-gray-400">{{ item.message }}</p>
              <p v-if="!item.is_read" class="mt-1 text-[11px] font-semibold text-primary-300">Unread</p>
            </button>
          </div>
          <p v-else class="px-3 py-4 text-sm text-gray-400">No notifications.</p>
          <div class="border-t border-gray-800 px-3 pt-2">
            <RouterLink
              :to="{ name: 'Notifications' }"
              class="text-xs font-medium text-primary-300 hover:text-primary-200"
              @click="notificationsOpen = false"
            >
              View all
            </RouterLink>
          </div>
        </div>
      </div>
      <div ref="menuRef" class="relative">
      <button
        type="button"
        class="flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-gray-800"
        @click="toggleMenu"
      >
        <span class="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-sm font-medium">
          {{ userLabel.charAt(0).toUpperCase() }}
        </span>
        <div class="hidden text-left sm:block">
          <p class="text-sm font-medium text-gray-100">{{ userLabel }}</p>
          <p class="text-xs text-gray-400">{{ roleLabel }}</p>
        </div>
        <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        v-if="menuOpen"
        class="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-800 bg-gray-900 py-1 shadow-lg"
      >
        <RouterLink
          :to="{ name: 'Profile' }"
          class="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
          @click="menuOpen = false"
        >
          Profile
        </RouterLink>
        <button
          type="button"
          class="block w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
          @click="logout"
        >
          Sign out
        </button>
      </div>
    </div>
    </div>
  </header>
</template>


