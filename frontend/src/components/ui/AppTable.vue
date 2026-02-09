<script setup>
defineProps({
  loading: { type: Boolean, default: false },
})
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-primary-900/30 bg-gray-900">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
    </div>
    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-800">
        <slot />
      </table>
    </div>
  </div>
</template>


