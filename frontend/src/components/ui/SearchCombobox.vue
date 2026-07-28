<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Search and select' },
  emptyText: { type: String, default: 'No matching options' },
})

const emit = defineEmits(['update:modelValue'])
const root = ref(null)
const input = ref(null)
const open = ref(false)
const query = ref('')
const activeIndex = ref(-1)

const selectedOption = computed(() =>
  props.options.find((option) => String(option.value) === String(props.modelValue)) || null
)
const filteredOptions = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  if (!normalized) return props.options
  return props.options.filter((option) =>
    String(option.searchText || `${option.label || ''} ${option.meta || ''}`)
      .toLowerCase()
      .includes(normalized)
  )
})
const displayValue = computed(() =>
  open.value ? query.value : selectedOption.value?.label || ''
)

function openList() {
  open.value = true
  query.value = ''
  activeIndex.value = filteredOptions.value.length ? 0 : -1
}

function closeList() {
  open.value = false
  query.value = ''
  activeIndex.value = -1
}

function onInput(event) {
  query.value = event.target.value
  open.value = true
  activeIndex.value = filteredOptions.value.length ? 0 : -1
}

function selectOption(option) {
  emit('update:modelValue', option.value)
  closeList()
  input.value?.focus()
}

function onKeydown(event) {
  if (!open.value && ['ArrowDown', 'Enter'].includes(event.key)) {
    event.preventDefault()
    openList()
    return
  }
  if (event.key === 'Escape') {
    closeList()
    return
  }
  if (!filteredOptions.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filteredOptions.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (event.key === 'Enter' && activeIndex.value >= 0) {
    event.preventDefault()
    selectOption(filteredOptions.value[activeIndex.value])
  }
}

function onDocumentPointerDown(event) {
  if (open.value && root.value && !root.value.contains(event.target)) closeList()
}

document.addEventListener('pointerdown', onDocumentPointerDown)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="root" class="relative">
    <div class="relative">
      <input
        ref="input"
        :value="displayValue"
        class="form-control pr-10"
        role="combobox"
        autocomplete="off"
        :placeholder="placeholder"
        :aria-expanded="open"
        aria-autocomplete="list"
        @focus="openList"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-500 hover:text-gray-200"
        aria-label="Toggle options"
        @click="open ? closeList() : openList()"
      >
        <svg class="h-4 w-4 transition" :class="open && 'rotate-180'" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>

    <div
      v-if="open"
      class="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-1.5 shadow-2xl shadow-black/70"
      role="listbox"
    >
      <button
        v-for="(option, index) in filteredOptions"
        :key="option.value"
        type="button"
        class="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition"
        :class="[
          index === activeIndex ? 'bg-primary-500/12 text-primary-200' : 'text-gray-200 hover:bg-gray-800',
          String(option.value) === String(modelValue) && 'ring-1 ring-inset ring-primary-500/30',
        ]"
        role="option"
        :aria-selected="String(option.value) === String(modelValue)"
        @pointerenter="activeIndex = index"
        @click="selectOption(option)"
      >
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium">{{ option.label }}</span>
          <span v-if="option.meta" class="mt-0.5 block truncate text-xs text-gray-500">{{ option.meta }}</span>
        </span>
        <span v-if="String(option.value) === String(modelValue)" class="shrink-0 text-primary-400">✓</span>
      </button>
      <p v-if="!filteredOptions.length" class="px-3 py-5 text-center text-sm text-gray-500">{{ emptyText }}</p>
    </div>
  </div>
</template>
