<script setup>
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { getNavForRole } from '@/router/navConfig'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'

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
      <main class="flex-1 p-4 md:p-6">
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
      </main>
    </div>
  </div>
</template>


