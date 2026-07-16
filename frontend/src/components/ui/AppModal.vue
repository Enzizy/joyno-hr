<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: Boolean,
  title: { type: String, default: '' },
  size: { type: String, default: 'md' },
})

const emit = defineEmits(['close'])

const widthClass = computed(() => ({
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
}[props.size] || 'max-w-lg'))
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/50" @click="emit('close')" />
      <div
        class="relative z-10 flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl"
        :class="widthClass"
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
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex shrink-0 justify-end gap-2 border-t border-gray-800 bg-gray-900 px-5 py-4 sm:px-6">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>


