<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SectionNav from '@/components/ui/SectionNav.vue'
import { payrollEnabled } from '@/config/features'

const route = useRoute()
const items = computed(() => [
  { label: 'Directory', to: '/employees', icon: 'users' },
  ...(payrollEnabled ? [{ label: 'Pay & schedules', to: { path: '/compensation', query: route.query }, icon: 'pay' }] : []),
])
</script>

<template><SectionNav :items="items" label="Employee workspace" /></template>
