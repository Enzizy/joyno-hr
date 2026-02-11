<script setup>
const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: 'This module is queued for implementation.' },
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-primary-200">{{ props.title }}</h1>
      <p class="mt-1 text-sm text-gray-400">{{ props.description }}</p>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-sm">
      <p class="text-sm text-gray-300">
        Placeholder page is active. Navigation and access control are ready.
      </p>
    </div>
  </div>
</template>

