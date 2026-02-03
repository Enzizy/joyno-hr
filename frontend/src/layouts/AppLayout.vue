<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { getNavForRole } from '@/router/navConfig'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'

const authStore = useAuthStore()
const navItems = computed(() => getNavForRole(authStore.role))
</script>

<template>
  <div class="flex min-h-screen bg-gray-50">
    <AppSidebar :items="navItems" />
    <div class="flex flex-1 flex-col lg:pl-64">
      <AppTopbar />
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
