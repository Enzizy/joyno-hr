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

const iconPaths = {
  dashboard: [
    'M3 3h7v7H3z',
    'M14 3h7v11h-7z',
    'M14 16h7v5h-7z',
    'M3 12h7v9H3z',
  ],
  user: ['M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M4 20a8 8 0 0 1 16 0'],
  leave: ['M8 7V3m8 4V3M4 11h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'],
  users: [
    'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    'M4 20a8 8 0 0 1 16 0',
    'M19 8a2 2 0 1 1-4 0',
    'M2 18a6 6 0 0 1 6-6',
  ],
  check: ['M9 12l2 2 4-4', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  chart: ['M4 19h16', 'M7 16V8', 'M12 16V5', 'M17 16v-7'],
  'user-cog': [
    'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    'M4 20a8 8 0 0 1 12.2-6.5',
    'M19.4 15.6a1.6 1.6 0 1 0 2.2 2.2',
    'M18 18v-1.1m0-3.8V12m-1.1 4H15m5 0h-1.1m-.8-2.9-.8-.8',
  ],
  settings: [
    'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
    'M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 2 .4 1.8 1.8 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.8 1.8 0 0 0-1.6 1z',
  ],
  audit: ['M8 4h8l2 2v14H6V4h2z', 'M9 9h6', 'M9 13h6', 'M9 17h4'],
}

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
          <span
            v-if="item.icon"
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-800/70 text-gray-200 ring-1 ring-gray-700"
          >
            <svg
              v-if="iconPaths[item.icon]"
              viewBox="0 0 24 24"
              class="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path v-for="(d, idx) in iconPaths[item.icon]" :key="idx" :d="d" />
            </svg>
            <span v-else class="text-xs">•</span>
          </span>
          <span>{{ item.name }}</span>
        </RouterLink>
      </template>
    </nav>
  </aside>
</template>


