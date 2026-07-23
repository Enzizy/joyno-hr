<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { navGroups } from '@/router/navConfig'

const route = useRoute()
const currentEntry = computed(() => {
  for (const group of navGroups) {
    if (group.path === route.path) return { label: group.name, group: '' }
    const child = group.children?.find((entry) => entry.path === route.path)
    if (child) return { label: child.name, group: group.name }
  }
  return { label: String(route.name || '').replace(/([a-z])([A-Z])/g, '$1 $2'), group: '' }
})
</script>

<template>
  <nav v-if="route.path !== '/'" class="mb-4 flex items-center gap-2 text-xs text-gray-500" aria-label="Breadcrumb">
    <RouterLink to="/" class="rounded text-gray-500 hover:text-primary-300">Dashboard</RouterLink>
    <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18 6-6-6-6" /></svg>
    <template v-if="currentEntry.group">
      <span class="text-gray-500">{{ currentEntry.group }}</span>
      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18 6-6-6-6" /></svg>
    </template>
    <span class="font-medium text-gray-300" aria-current="page">{{ currentEntry.label }}</span>
  </nav>
</template>
