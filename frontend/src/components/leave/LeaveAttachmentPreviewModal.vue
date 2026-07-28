<script setup>
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'

defineProps({
  show: Boolean,
  loading: Boolean,
  url: { type: String, default: '' },
  isPdf: Boolean,
})
defineEmits(['close'])
</script>

<template>
  <AppModal :show="show" title="Attachment" @close="$emit('close')">
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
    </div>
    <div v-else>
      <iframe v-if="url && isPdf" :src="url" title="Attachment" class="h-[70vh] w-full rounded-lg border border-gray-800" />
      <img v-else-if="url" :src="url" alt="Attachment" class="max-h-[70vh] w-full rounded-lg object-contain" />
      <p v-else class="text-sm text-gray-400">Unable to load attachment.</p>
    </div>
    <template #footer>
      <AppButton variant="secondary" @click="$emit('close')">Close</AppButton>
    </template>
  </AppModal>
</template>
