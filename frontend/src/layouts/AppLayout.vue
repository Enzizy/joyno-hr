<script setup>
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { getNavForRole } from '@/router/navConfig'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import logoBg from '@/assets/Joynomedia logo.png'

const authStore = useAuthStore()
const navItems = computed(() => getNavForRole(authStore.role))
const sidebarOpen = ref(false)

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}
</script>

<template>
  <div class="flex min-h-screen bg-gray-950">
    <AppSidebar :items="navItems" :open="sidebarOpen" @close="closeSidebar" />
    <div class="flex flex-1 flex-col lg:pl-64">
      <AppTopbar @toggle-sidebar="toggleSidebar" />
      <main class="relative flex-1 p-4 md:p-6">
        <div
          class="pointer-events-none absolute inset-0 bg-center bg-no-repeat opacity-10"
          :style="{ backgroundImage: `url(${logoBg})`, backgroundSize: '520px auto' }"
        />
        <div class="relative z-10">
          <RouterView v-slot="{ Component }">
            <Suspense>
              <component :is="Component" />
              <template #fallback>
                <div class="flex items-center justify-center py-12">
                  <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                </div>
              </template>
            </Suspense>
          </RouterView>
        </div>
      </main>
    </div>
  </div>
</template>


