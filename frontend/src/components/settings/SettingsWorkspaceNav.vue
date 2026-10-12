<script setup>
import SectionNav from '@/components/ui/SectionNav.vue'
const items = [
  { label: 'Overview', to: '/settings', icon: 'settings' },
  { label: 'Leave policy', to: '/settings/leave', icon: 'leave' },
  { label: 'Accounts', to: '/users', icon: 'user-cog' },
  { label: 'Audit log', to: '/audit-logs', icon: 'audit' },
]
</script>
<template><SectionNav :items="items" label="Settings sections" /></template>
