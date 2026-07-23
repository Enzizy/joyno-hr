<script setup>
import LeavePolicySettingsPanel from '@/components/settings/LeavePolicySettingsPanel.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="System Settings" description="Manage company-wide rules that control leave eligibility and approvals." eyebrow="Administration" />
    <LeavePolicySettingsPanel />
  </div>
</template>


