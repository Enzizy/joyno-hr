<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  compact: Boolean,
})
</script>

<template>
  <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 bg-gray-950/40 text-center" :class="compact ? 'px-4 py-6' : 'px-6 py-10'">
    <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 text-primary-300">
      <slot name="icon">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 12h8m-4-4v8m9-4a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
      </slot>
    </div>
    <p class="text-sm font-semibold text-gray-200">{{ title }}</p>
    <p v-if="description" class="mt-1 max-w-md text-xs leading-5 text-gray-400">{{ description }}</p>
    <div v-if="$slots.actions" class="mt-4"><slot name="actions" /></div>
  </div>
</template>
