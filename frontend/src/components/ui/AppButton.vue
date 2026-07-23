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
    class="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
    :class="[
      size === 'sm' && 'px-3 py-1.5 text-sm',
      size === 'md' && 'min-h-10 px-4 py-2 text-sm',
      size === 'lg' && 'px-6 py-3 text-base',
      variant === 'primary' && 'border-primary-500 bg-primary-500 text-black shadow-[0_8px_24px_rgba(216,170,36,0.12)] hover:border-primary-400 hover:bg-primary-400 focus:ring-primary-400',
      variant === 'secondary' && 'border-gray-700 bg-gray-900 text-gray-200 hover:border-gray-600 hover:bg-gray-800 focus:ring-gray-500',
      variant === 'success' && 'border-emerald-700 bg-emerald-700/90 text-white hover:bg-emerald-600 focus:ring-emerald-500',
      variant === 'danger' && 'border-red-800 bg-red-950/50 text-red-300 hover:bg-red-900/60 focus:ring-red-500',
      variant === 'ghost' && 'bg-transparent text-gray-300 hover:bg-gray-900 hover:text-gray-100 focus:ring-gray-500',
    ]"
  >
    <span v-if="loading" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    <slot v-else />
  </button>
</template>


