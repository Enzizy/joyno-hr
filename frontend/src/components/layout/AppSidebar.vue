<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import NavIcon from '@/components/layout/NavIcon.vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])
const route = useRoute()
const expandedGroup = ref('')

function isActive(path) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function groupIsActive(group) {
  return Boolean(group.children?.some((child) => isActive(child.path)))
}

function directItem(group) {
  if (group.path) return group
  return group.children?.length === 1 ? group.children[0] : null
}

function toggleGroup(group) {
  expandedGroup.value = expandedGroup.value === group.name ? '' : group.name
}

watch(
  () => route.path,
  () => {
    const active = props.items.find((group) => groupIsActive(group))
    if (active) expandedGroup.value = active.name
  },
  { immediate: true }
)
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm lg:hidden" @click="emit('close')" />
  <aside class="app-sidebar fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-64 flex-col overflow-hidden border-r border-gray-800 bg-gray-950 transition-transform duration-200" :class="[open ? 'translate-x-0' : '-translate-x-full', 'lg:translate-x-0 lg:flex']">
    <div class="flex h-[72px] shrink-0 items-center border-b border-gray-800 px-5">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary-500/25 bg-gray-900 p-0.5 shadow-sm">
        <img src="/joynomedia-logo.png" alt="Joynomedia" class="h-full w-full object-contain" />
      </div>
      <div class="ml-3">
        <p class="text-sm font-bold text-gray-100">Joyno <span class="text-primary-400">Workspace</span></p>
        <p class="text-[10px] uppercase tracking-[0.18em] text-gray-600">HR &amp; Operations</p>
      </div>
    </div>

    <nav aria-label="Primary navigation" class="sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-5">
      <template v-for="group in items" :key="group.name">
        <RouterLink v-if="directItem(group)" :to="directItem(group).path" class="group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all" :class="isActive(directItem(group).path) ? 'bg-primary-500/12 text-primary-300 ring-1 ring-inset ring-primary-500/25' : 'text-gray-300 hover:bg-gray-900 hover:text-gray-100'" @click="emit('close')">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" :class="isActive(directItem(group).path) ? 'bg-primary-500/10 text-primary-300' : 'text-gray-400 group-hover:text-primary-300'"><NavIcon :name="directItem(group).icon || group.icon" /></span>
          <span>{{ directItem(group).name }}</span>
        </RouterLink>

        <div v-else>
          <button type="button" class="group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition-all" :class="groupIsActive(group) ? 'text-primary-300' : 'text-gray-300 hover:bg-gray-900 hover:text-gray-100'" :aria-expanded="expandedGroup === group.name" @click="toggleGroup(group)">
            <span class="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" :class="groupIsActive(group) ? 'bg-primary-500/10 text-primary-300' : 'text-gray-400 group-hover:text-primary-300'"><NavIcon :name="group.icon" /></span>
            <span class="flex-1">{{ group.name }}</span>
            <svg class="h-4 w-4 text-gray-600 transition-transform" :class="expandedGroup === group.name ? 'rotate-180 text-primary-400' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m6 9 6 6 6-6" /></svg>
          </button>

          <div v-if="expandedGroup === group.name" class="ml-5 mt-1 space-y-0.5 border-l border-gray-800 pl-3">
            <RouterLink v-for="child in group.children" :key="child.path" :to="child.path" class="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition" :class="isActive(child.path) ? 'bg-gray-900 text-primary-300' : 'text-gray-500 hover:bg-gray-900/70 hover:text-gray-200'" @click="emit('close')">
              <NavIcon :name="child.icon" class="h-4 w-4" />
              <span>{{ child.name }}</span>
            </RouterLink>
          </div>
        </div>
      </template>
    </nav>

    <div class="shrink-0 border-t border-gray-800 p-3">
      <div class="flex items-center gap-3 rounded-lg px-3 py-2.5">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary-500/20 bg-gray-900 p-0.5"><img src="/joynomedia-logo.png" alt="" class="h-full w-full object-contain" /></span>
        <div class="min-w-0"><p class="truncate text-xs font-medium text-gray-300">Joyno Solutions Ltd.</p><p class="mt-0.5 text-[10px] text-gray-600">Internal workspace</p></div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-scroll {
  -webkit-overflow-scrolling: touch;
}
</style>
