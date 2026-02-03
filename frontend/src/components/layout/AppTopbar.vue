<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const authStore = useAuthStore()
const menuOpen = ref(false)

const userLabel = computed(() => {
  const u = authStore.user
  if (!u) return 'User'
  return u.email || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User'
})

const roleLabel = computed(() => {
  const r = authStore.role
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : ''
})

function logout() {
  authStore.logout()
  router.push({ name: 'Login' })
  menuOpen.value = false
}
</script>

<template>
  <header class="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm md:px-6">
    <div class="flex items-center gap-4">
      <button
        type="button"
        class="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
        aria-label="Menu"
      >
        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span class="text-sm font-medium text-gray-600">HR System</span>
    </div>
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-gray-100"
        @click="menuOpen = !menuOpen"
      >
        <span class="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-sm font-medium">
          {{ userLabel.charAt(0).toUpperCase() }}
        </span>
        <div class="hidden text-left sm:block">
          <p class="text-sm font-medium text-gray-900">{{ userLabel }}</p>
          <p class="text-xs text-gray-500">{{ roleLabel }}</p>
        </div>
        <svg class="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        v-if="menuOpen"
        class="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      >
        <RouterLink
          :to="{ name: 'Profile' }"
          class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          @click="menuOpen = false"
        >
          Profile
        </RouterLink>
        <button
          type="button"
          class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
          @click="logout"
        >
          Sign out
        </button>
      </div>
    </div>
  </header>
</template>
