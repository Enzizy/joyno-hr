<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({
  items: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const route = useRoute()

const filteredItems = computed(() => props.items)

function isActive(path) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-30 bg-black/50 lg:hidden"
    @click="emit('close')"
  />
  <aside
    class="fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-primary-900/40 bg-gray-900 transition-transform"
    :class="[
      open ? 'translate-x-0' : '-translate-x-full',
      'lg:translate-x-0 lg:flex'
    ]"
  >
    <div class="flex h-14 shrink-0 items-center border-b border-gray-800 px-4">
      <span class="text-lg font-semibold text-primary-300">Joyno HR</span>
    </div>
    <nav class="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
      <template v-for="(item, i) in filteredItems" :key="i">
        <div v-if="item.divider" class="my-2 border-t border-primary-900/30" />
        <div v-else-if="item.header" class="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-primary-300/80">
          {{ item.label }}
        </div>
        <RouterLink
          v-else
          :to="item.path"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          :class="
            isActive(item.path)
              ? 'bg-primary-900/40 text-primary-200'
              : 'text-gray-200 hover:bg-gray-800 hover:text-gray-100'
          "
          @click="emit('close')"
        >
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-800 text-gray-300" v-if="item.icon">
            {{ item.icon === 'dashboard' ? 'D' : item.icon === 'user' ? 'U' : item.icon === 'leave' ? 'L' : item.icon === 'users' ? 'E' : item.icon === 'check' ? 'A' : item.icon === 'chart' ? 'R' : item.icon === 'user-cog' ? 'U' : item.icon === 'settings' ? 'S' : item.icon === 'audit' ? 'A' : '*' }}
          </span>
          <span>{{ item.name }}</span>
        </RouterLink>
      </template>
    </nav>
  </aside>
</template>


