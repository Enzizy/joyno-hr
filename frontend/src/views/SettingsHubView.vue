<script setup>
import PageHeader from '@/components/ui/PageHeader.vue'
import NavIcon from '@/components/layout/NavIcon.vue'
import SettingsWorkspaceNav from '@/components/settings/SettingsWorkspaceNav.vue'

const settings = [
  { title: 'Leave policy', path: '/settings/leave', icon: 'leave', tone: 'info', description: 'Entitlements, eligibility and filing rules.' },
  { title: 'Accounts', path: '/users', icon: 'user-cog', tone: 'violet', description: 'Employee logins, management access and account details.' },
  { title: 'Audit log', path: '/audit-logs', icon: 'audit', tone: 'success', description: 'Recorded changes and who made them.' },
]
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Settings" />
    <SettingsWorkspaceNav />
    <div class="grid gap-5 lg:grid-cols-3">
      <RouterLink v-for="item in settings" :key="item.path" :to="item.path" class="workspace-card" :style="{ '--workspace-tone': `var(--${item.tone}-text)`, '--workspace-tint': `var(--${item.tone}-bg)` }">
        <span class="workspace-card__icon"><NavIcon :name="item.icon" class="h-6 w-6" /></span><h2 class="mt-5 text-xl font-semibold text-gray-100">{{ item.title }}</h2><p class="mb-6 mt-2 text-sm leading-6 text-gray-400">{{ item.description }}</p><span class="mt-auto flex items-center justify-between text-sm font-semibold text-primary-300">Open {{ item.title.toLowerCase() }} <span aria-hidden="true">→</span></span>
      </RouterLink>
    </div>
  </div>
</template>
