<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

// A small "More ▾" menu for actions that are needed rarely. Each item is { label, onSelect, danger?, disabled? }.
defineProps({
  label: { type: String, default: 'More' },
  items: { type: Array, default: () => [] },
})
const open = ref(false)
const root = ref(null)
const close = (event) => { if (!root.value?.contains(event.target)) open.value = false }
const onKey = (event) => { if (event.key === 'Escape') open.value = false }
onMounted(() => { document.addEventListener('click', close); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey) })
function choose(item) {
  open.value = false
  item.onSelect()
}
</script>

<template>
  <div ref="root" class="relative">
    <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:border-gray-600 hover:bg-gray-800" :aria-expanded="open" aria-haspopup="menu" @click="open = !open">
      {{ label }}<span aria-hidden="true" class="text-xs text-gray-500">▾</span>
    </button>
    <div v-if="open" class="absolute right-0 z-30 mt-1 min-w-[14rem] overflow-hidden rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl" role="menu">
      <button v-for="item in items" :key="item.label" type="button" role="menuitem" :disabled="item.disabled"
        class="block w-full px-4 py-2 text-left text-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        :class="item.danger ? 'text-amber-300' : 'text-gray-200'" @click="choose(item)">{{ item.label }}</button>
    </div>
  </div>
</template>
