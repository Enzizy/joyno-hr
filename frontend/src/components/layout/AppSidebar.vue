<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({
  items: { type: Array, default: () => [] },
})

const route = useRoute()
const open = ref(true)

const filteredItems = computed(() => props.items)

function isActive(path) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex"
    :class="{ 'lg:flex': open }"
  >
    <div class="flex h-14 shrink-0 items-center border-b border-gray-200 px-4">
      <span class="text-lg font-semibold text-primary-600">HR System</span>
    </div>
    <nav class="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
      <template v-for="(item, i) in filteredItems" :key="i">
        <div v-if="item.divider" class="my-2 border-t border-gray-100" />
        <div v-else-if="item.header" class="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">
          {{ item.label }}
        </div>
        <RouterLink
          v-else
          :to="item.path"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          :class="
            isActive(item.path)
              ? 'bg-primary-50 text-primary-700'
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          "
        >
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600" v-if="item.icon">
            {{ item.icon === 'dashboard' ? '📊' : item.icon === 'user' ? '👤' : item.icon === 'leave' ? '🏖' : item.icon === 'users' ? '👥' : item.icon === 'check' ? '✓' : item.icon === 'chart' ? '📈' : item.icon === 'user-cog' ? '⚙' : item.icon === 'settings' ? '🔧' : item.icon === 'audit' ? '📋' : '•' }}
          </span>
          <span>{{ item.name }}</span>
        </RouterLink>
      </template>
    </nav>
  </aside>
</template>
