<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const authStore = useAuthStore()
const menuOpen = ref(false)
const emit = defineEmits(['toggle-sidebar'])

const userLabel = computed(() => {
  const u = authStore.user
  if (!u) return 'User'
  return u.email || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User'
})

const roleLabel = computed(() => {
  const r = authStore.role
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : ''
})

async function logout() {
  try {
    await authStore.logout()
  } finally {
    menuOpen.value = false
    router.replace({ name: 'Login' })
  }
}
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
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-gray-800"
        @click="menuOpen = !menuOpen"
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
  </header>
</template>


