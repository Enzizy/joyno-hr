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
  dashboard: ['M4 4h7v7H4z', 'M13 4h7v5h-7z', 'M13 11h7v9h-7z', 'M4 13h7v7H4z'],
  user: ['M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z', 'M4 20a8 8 0 0 1 16 0'],
  leave: ['M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M8 2v4', 'M16 2v4', 'M5 9h14'],
  users: ['M8 7a3 3 0 1 1 6 0 3 3 0 0 1-6 0z', 'M2 20a8 8 0 0 1 16 0', 'M17 8a2.5 2.5 0 1 1 5 0', 'M19.5 20a6 6 0 0 0-3.5-5.2'],
  check: ['M9 12l2 2 4-4', 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z'],
  chart: ['M4 19h16', 'M7 16V8', 'M12 16V5', 'M17 16v-7'],
  'user-cog': ['M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M3.5 20a7.5 7.5 0 0 1 12-5', 'M18 17.5a2.5 2.5 0 1 0 0 .01', 'M18 13.5v1.2m0 5.6V21m-2.2-3.5H15m6 0h-1.2m-1.1-2.4-.9-.9'],
  settings: ['M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', 'M3 12h2.2m13.6 0H21', 'M6.2 6.2l1.6 1.6m8.4 8.4 1.6 1.6', 'M6.2 17.8l1.6-1.6m8.4-8.4 1.6-1.6'],
  audit: ['M7 4h7l4 4v12H7z', 'M10 12h6', 'M10 16h6', 'M10 8h2'],
  payroll: ['M4 7h16v10H4z', 'M7 10h3', 'M14 10h3', 'M7 14h3', 'M14 14h3'],
  payslip: ['M6 4h9l3 3v13H6z', 'M9 11h6', 'M9 15h6', 'M9 19h3'],
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
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-800/40 text-gray-200 ring-1 ring-gray-700/70"
          >
            <svg
              v-if="iconPaths[item.icon]"
              viewBox="0 0 24 24"
              class="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
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


