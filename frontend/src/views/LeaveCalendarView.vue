<script setup>
import PageHeader from '@/components/ui/PageHeader.vue'
import LeaveCalendarPanel from '@/components/leave/LeaveCalendarPanel.vue'
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Leave Calendar" description="See approved and pending absences across the team before making staffing decisions." eyebrow="Leave management" />
    <LeaveCalendarPanel />
  </div>
</template>
