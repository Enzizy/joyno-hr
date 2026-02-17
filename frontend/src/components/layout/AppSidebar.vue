<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import dashboardIcon from '@/assets/icons/dashboard-panel.svg?raw'
import profileIcon from '@/assets/icons/profile.svg?raw'
import leaveRequestIcon from '@/assets/icons/leave-request.svg?raw'
import employeeManageIcon from '@/assets/icons/employee-manage.svg?raw'
import leaveApprovalIcon from '@/assets/icons/leave-approval.svg?raw'
import analyticsIcon from '@/assets/icons/analytics.svg?raw'
import userManagementIcon from '@/assets/icons/user-management.svg?raw'
import settingsIcon from '@/assets/icons/settings.svg?raw'
import auditLogsIcon from '@/assets/icons/audit-logs.svg?raw'

const props = defineProps({
  items: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const route = useRoute()

const filteredItems = computed(() => props.items)

const iconPaths = {
  dashboard: ['M4 4h6v6H4z', 'M14 4h6v4h-6z', 'M14 10h6v10h-6z', 'M4 12h6v8H4z'],
  user: ['M16 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M4 20a8 8 0 0 1 16 0'],
  lead: ['M4 5h16v14H4z', 'M7 9h10', 'M7 13h7'],
  client: ['M4 7h16v10H4z', 'M8 7V5h8v2'],
  service: ['M6 6h12v12H6z', 'M9 9h6v6H9z'],
  task: ['M6 12l3 3 9-9', 'M4 4h16v16H4z'],
  automation: ['M12 2v4', 'M12 18v4', 'M4.9 4.9l2.8 2.8', 'M16.3 16.3l2.8 2.8', 'M2 12h4', 'M18 12h4', 'M4.9 19.1l2.8-2.8', 'M16.3 7.7l2.8-2.8'],
  notification: ['M12 3a5 5 0 0 0-5 5v3.3L5.3 14a1 1 0 0 0 .7 1.7h12a1 1 0 0 0 .7-1.7L17 11.3V8a5 5 0 0 0-5-5z', 'M10 18a2 2 0 0 0 4 0'],
  leave: ['M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M8 2v4', 'M16 2v4', 'M4 9h16'],
  users: ['M9 10a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z', 'M2 20a8 8 0 0 1 16 0', 'M18.5 8a2.5 2.5 0 1 1 5 0', 'M19.5 20a6 6 0 0 0-3.5-5.2'],
  check: ['M9 12l2.5 2.5L16 10', 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z'],
  chart: ['M4 19h16', 'M7 16V9', 'M12 16V6', 'M17 16v-5'],
  'user-cog': ['M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z', 'M3 20a8 8 0 0 1 12-5.5', 'M18.5 17.5a2.5 2.5 0 1 0 0 .01', 'M18.5 14.5v1.6m0 4.8V21m-2.4-3.5H15m6 0h-1.1m-1.2-2.4-.9-.9'],
  settings: ['M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', 'M3 12h2.5m13 0H21', 'M6.8 6.8l1.8 1.8m6.8 6.8 1.8 1.8', 'M6.8 17.2l1.8-1.8m6.8-6.8 1.8-1.8'],
  audit: ['M7 4h7l4 4v12H7z', 'M10 12h6', 'M10 16h6', 'M10 8h2'],
}

const customIcons = {
  dashboard: dashboardIcon,
  user: profileIcon,
  leave: leaveRequestIcon,
  users: employeeManageIcon,
  check: leaveApprovalIcon,
  chart: analyticsIcon,
  'user-cog': userManagementIcon,
  settings: settingsIcon,
  audit: auditLogsIcon,
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
    class="fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-64 flex-col overflow-hidden border-r border-primary-900/40 bg-gray-900 transition-transform"
    :class="[
      open ? 'translate-x-0' : '-translate-x-full',
      'lg:translate-x-0 lg:flex'
    ]"
  >
    <div class="flex h-14 shrink-0 items-center border-b border-gray-800 px-4">
      <span class="text-lg font-semibold text-primary-300">Joyno HR</span>
    </div>
    <nav class="sidebar-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-4 pb-8">
      <template v-for="(item, i) in filteredItems" :key="i">
        <div v-if="item.divider" class="my-2 border-t border-primary-900/30" />
        <div v-else-if="item.header" class="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-primary-300/80">
          {{ item.label }}
        </div>
        <a
          v-else-if="item.external"
          :href="item.path"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-800 hover:text-gray-100"
          @click="emit('close')"
        >
          <span
            v-if="item.icon"
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-transparent text-gray-200"
          >
            <span
              v-if="customIcons[item.icon]"
              class="sidebar-icon text-primary-300"
              aria-hidden="true"
              v-html="customIcons[item.icon]"
            />
            <svg
              v-else-if="iconPaths[item.icon]"
              viewBox="0 0 24 24"
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.25"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path v-for="(d, idx) in iconPaths[item.icon]" :key="idx" :d="d" />
            </svg>
            <span v-else class="text-xs">•</span>
          </span>
          <span>{{ item.name }}</span>
        </a>
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
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-transparent text-gray-200"
          >
            <span
              v-if="customIcons[item.icon]"
              class="sidebar-icon text-primary-300"
              aria-hidden="true"
              v-html="customIcons[item.icon]"
            />
            <svg
              v-else-if="iconPaths[item.icon]"
              viewBox="0 0 24 24"
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.25"
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

<style scoped>
.sidebar-icon :deep(svg) {
  height: 20px;
  width: 20px;
  display: block;
  fill: currentColor;
  stroke: currentColor;
}

.sidebar-scroll {
  -webkit-overflow-scrolling: touch;
}
</style>

