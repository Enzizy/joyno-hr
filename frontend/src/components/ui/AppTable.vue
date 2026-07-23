<script setup>
defineProps({
  loading: { type: Boolean, default: false },
})
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-[0_14px_40px_rgba(0,0,0,0.2)]">
    <div v-if="loading" class="space-y-3 p-4" role="status" aria-label="Loading table">
      <div v-for="row in 5" :key="row" class="h-11 animate-pulse rounded-lg bg-gray-800/80" />
    </div>
    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-800/90">
        <slot />
      </table>
    </div>
  </div>
</template>


