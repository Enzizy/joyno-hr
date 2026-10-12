<script setup>
import PageHeader from '@/components/ui/PageHeader.vue'
import NavIcon from '@/components/layout/NavIcon.vue'
import ReportWorkspaceNav from '@/components/reports/ReportWorkspaceNav.vue'
import { payrollEnabled } from '@/config/features'

const reports = [
  { title: 'Leave', path: '/reports/leave', icon: 'leave', tone: 'info', description: 'Balances, approved leave and department summaries.', outputs: ['Leave records', 'Department impact', 'AWOL'] },
  ...(payrollEnabled ? [
    { title: 'Payroll', path: '/reports/payroll', icon: 'pay', tone: 'success', description: 'Registers and contributions for each saved pay run.', outputs: ['Pay register · includes 13th-month accrual', 'Contribution report', 'Payment register'] },
    { title: 'Attendance', path: '/reports/attendance', icon: 'check', tone: 'violet', description: 'Confirmed DTR by work dates and shift.', outputs: ['Confirmed DTR', 'Review status', 'Source file'] },
  ] : []),
]
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Reports" />
    <ReportWorkspaceNav />
    <div class="grid gap-5 lg:grid-cols-3">
      <RouterLink v-for="report in reports" :key="report.path" :to="report.path" class="workspace-card group" :style="{ '--workspace-tone': `var(--${report.tone}-text)`, '--workspace-tint': `var(--${report.tone}-bg)` }">
        <span class="workspace-card__icon"><NavIcon :name="report.icon" class="h-6 w-6" /></span>
        <h2 class="mt-5 text-xl font-semibold text-gray-100">{{ report.title }}</h2>
        <p class="mt-2 text-sm leading-6 text-gray-400">{{ report.description }}</p>
        <ul class="my-6 space-y-2 border-t border-gray-800 pt-5 text-sm text-gray-300"><li v-for="output in report.outputs" :key="output" class="flex items-start gap-2"><span class="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-500" />{{ output }}</li></ul>
        <span class="mt-auto flex items-center justify-between text-sm font-semibold text-primary-300">Open {{ report.title.toLowerCase() }} reports <span aria-hidden="true">→</span></span>
      </RouterLink>
    </div>
  </div>
</template>
