<script setup>
import LeavePolicySettingsPanel from '@/components/settings/LeavePolicySettingsPanel.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SettingsWorkspaceNav from '@/components/settings/SettingsWorkspaceNav.vue'
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Leave policy" />
    <SettingsWorkspaceNav />
    <LeavePolicySettingsPanel />
  </div>
</template>


