<script setup>
defineProps({
  type: { type: String, default: 'button' },
  variant: { type: String, default: 'primary' }, // primary, secondary, success, danger, ghost
  size: { type: String, default: 'md' }, // sm, md, lg
  disabled: Boolean,
  loading: Boolean,
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
    :class="[
      size === 'sm' && 'px-3 py-1.5 text-sm',
      size === 'md' && 'px-4 py-2 text-sm',
      size === 'lg' && 'px-6 py-3 text-base',
      variant === 'primary' && 'bg-primary-500 text-gray-900 hover:bg-primary-600 focus:ring-primary-400',
      variant === 'secondary' && 'bg-gray-800 text-gray-100 hover:bg-gray-700 focus:ring-gray-500',
      variant === 'success' && 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
      variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      variant === 'ghost' && 'bg-transparent text-gray-200 hover:bg-gray-800 focus:ring-gray-500',
    ]"
  >
    <span v-if="loading" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    <slot v-else />
  </button>
</template>


