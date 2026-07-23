<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
})
</script>

<template>
  <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0">
      <p v-if="eyebrow" class="eyebrow mb-1.5">{{ eyebrow }}</p>
      <h1 class="text-2xl font-semibold tracking-tight text-gray-100 sm:text-[2rem]">{{ title }}</h1>
      <p v-if="description" class="mt-1.5 max-w-3xl text-sm leading-6 text-gray-400">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2"><slot name="actions" /></div>
  </header>
</template>
