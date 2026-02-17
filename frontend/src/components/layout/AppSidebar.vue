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
import leadIcon from '@/assets/icons/lead.svg?raw'
import clientsIcon from '@/assets/icons/clients.svg?raw'
import servicesIcon from '@/assets/icons/services.svg?raw'
import tasksIcon from '@/assets/icons/tasks.svg?raw'
import automationIcon from '@/assets/icons/automation.svg?raw'

const props = defineProps({
  items: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const route = useRoute()

const filteredItems = computed(() => props.items)

const iconPaths = {
  notification: ['M12 3a5 5 0 0 0-5 5v3.3L5.3 14a1 1 0 0 0 .7 1.7h12a1 1 0 0 0 .7-1.7L17 11.3V8a5 5 0 0 0-5-5z', 'M10 18a2 2 0 0 0 4 0'],
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
  lead: leadIcon,
  client: clientsIcon,
  service: servicesIcon,
  task: tasksIcon,
  automation: automationIcon,
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
