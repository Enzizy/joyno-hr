<script setup>
defineProps({
  show: Boolean,
  title: { type: String, default: '' },
})

const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/50" @click="emit('close')" />
      <div
        class="relative z-10 w-full max-w-lg rounded-xl bg-gray-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        @click.stop
      >
        <div class="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h3 class="text-lg font-semibold text-gray-100">{{ title }}</h3>
          <button
            type="button"
            class="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-300"
            aria-label="Close"
            @click="emit('close')"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="max-h-[70vh] overflow-y-auto px-6 py-4">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex justify-end gap-2 border-t border-gray-800 px-6 py-4">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>


