<script setup>
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { getNavForRole } from '@/router/navConfig'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import AppBreadcrumbs from '@/components/layout/AppBreadcrumbs.vue'

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
  <div class="min-h-screen bg-gray-950">
    <AppSidebar :items="navItems" :open="sidebarOpen" @close="closeSidebar" />
    <div class="flex min-h-screen min-w-0 flex-col lg:pl-64">
      <AppTopbar @toggle-sidebar="toggleSidebar" />
      <main id="main-content" class="flex-1 bg-gray-950 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 xl:px-10">
        <div class="mx-auto w-full max-w-[1600px]">
          <AppBreadcrumbs />
          <RouterView v-slot="{ Component }">
            <Suspense>
              <component :is="Component" />
              <template #fallback>
                <div class="space-y-4" aria-label="Loading page">
                  <div class="h-8 w-48 animate-pulse rounded-lg bg-gray-800" />
                  <div class="h-28 animate-pulse rounded-xl border border-gray-800 bg-gray-900" />
                </div>
              </template>
            </Suspense>
          </RouterView>
        </div>
      </main>
    </div>
  </div>
</template>


