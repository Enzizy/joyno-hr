<script setup>
import PageHeader from '@/components/ui/PageHeader.vue'
import LeaveCalendarPanel from '@/components/leave/LeaveCalendarPanel.vue'
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Leave Calendar" description="Track approved and pending leave, calendar notes, and Philippine holidays." eyebrow="Leave management" />
    <LeaveCalendarPanel />
  </div>
</template>
