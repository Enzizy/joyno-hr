<script setup>
import AppModal from '@/components/ui/AppModal.vue'
import AppButton from '@/components/ui/AppButton.vue'

defineProps({
  show: Boolean,
  title: { type: String, default: 'Confirm action' },
  message: { type: String, default: 'Are you sure you want to continue?' },
  confirmText: { type: String, default: 'Confirm' },
  cancelText: { type: String, default: 'Cancel' },
  loading: { type: Boolean, default: false },
  confirmVariant: { type: String, default: 'danger' },
})

const emit = defineEmits(['close', 'confirm'])
</script>

<template>
  <AppModal :show="show" :title="title" @close="emit('close')">
    <div class="space-y-3">
      <div class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-900/40 text-red-300">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
        </svg>
      </div>
      <p class="text-sm leading-6 text-gray-300">{{ message }}</p>
    </div>
    <template #footer>
      <AppButton variant="secondary" :disabled="loading" @click="emit('close')">{{ cancelText }}</AppButton>
      <AppButton :variant="confirmVariant" :loading="loading" @click="emit('confirm')">{{ confirmText }}</AppButton>
    </template>
  </AppModal>
</template>

