<script setup>
import { ref } from 'vue'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'

const toast = useToastStore()
const saving = ref(false)
const settings = ref({
  company_name: 'Acme Corp',
  timezone: 'Asia/Manila',
})

async function save() {
  saving.value = true
  try {
    // Placeholder: call API when backend is ready
    await new Promise((r) => setTimeout(r, 500))
    toast.success('Settings saved.')
  } catch {
    toast.error('Failed to save settings.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">System Settings</h1>
      <p class="mt-1 text-sm text-gray-500">Configure system-wide settings.</p>
    </div>
    <div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <form class="max-w-md space-y-4" @submit.prevent="save">
        <AppInput v-model="settings.company_name" label="Company name" />
        <AppInput v-model="settings.timezone" label="Timezone" />
        <AppButton type="submit" :loading="saving">Save settings</AppButton>
      </form>
    </div>
  </div>
</template>
