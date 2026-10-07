<script setup>
// The one place a pay-run stage shows its status and the next thing to do.
// It stays pinned to the bottom of the screen while the stage content scrolls.
defineProps({
  title: { type: String, required: true },
  detail: { type: String, default: '' },
  tone: { type: String, default: 'todo' }, // todo | done | waiting
})
</script>

<template>
  <div class="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur"
    :class="tone === 'done' ? 'border-emerald-800/70 bg-emerald-950/80' : tone === 'waiting' ? 'border-gray-700 bg-gray-900/95' : 'border-primary-700/70 bg-gray-900/95'"
    role="region" aria-label="Next step">
    <div class="min-w-0">
      <p class="text-sm font-semibold" :class="tone === 'done' ? 'text-emerald-200' : tone === 'waiting' ? 'text-gray-200' : 'text-primary-200'">{{ title }}</p>
      <p v-if="detail" class="mt-0.5 text-xs text-gray-400">{{ detail }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2"><slot /></div>
  </div>
</template>
