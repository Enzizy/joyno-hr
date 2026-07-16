<script setup>
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'

defineProps({ show: Boolean, notes: { type: String, default: '' }, loading: Boolean })
const emit = defineEmits(['close', 'submit', 'update:notes', 'proof-selected'])
</script>

<template>
  <AppModal :show="show" title="Complete Task" @close="emit('close')">
    <div class="space-y-4">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Completion Notes</label>
        <textarea :value="notes" rows="3" class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100" @input="emit('update:notes', $event.target.value)" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">Proof of Work</label>
        <input type="file" class="block w-full text-sm text-gray-300" @change="emit('proof-selected', $event)" />
      </div>
    </div>
    <template #footer>
      <AppButton variant="secondary" @click="emit('close')">Cancel</AppButton>
      <AppButton :loading="loading" @click="emit('submit')">Mark Complete</AppButton>
    </template>
  </AppModal>
</template>
