<script setup>
import SectionNav from '@/components/ui/SectionNav.vue'
import { payrollEnabled } from '@/config/features'
const items = [
  { label: 'Overview', to: '/reports', icon: 'chart' },
  { label: 'Leave', to: '/reports/leave', icon: 'leave' },
  ...(payrollEnabled ? [
    { label: 'Payroll', to: '/reports/payroll', icon: 'pay' },
    { label: 'Attendance', to: '/reports/attendance', icon: 'check' },
  ] : []),
]
</script>
<template><SectionNav :items="items" label="Report categories" /></template>
