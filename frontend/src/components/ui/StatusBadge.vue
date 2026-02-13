<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: '' },
  variant: { type: String, default: 'auto' }, // auto | success | warning | danger | info
})

const badgeClass = computed(() => {
  if (props.variant !== 'auto') {
    const v = {
      success: 'bg-green-900 text-green-200',
      warning: 'bg-amber-900 text-amber-200',
      danger: 'bg-red-900 text-red-200',
      info: 'bg-blue-900 text-blue-200',
    }
    return v[props.variant] || v.info
  }
  const s = (props.status || '').toLowerCase()
  if (['active', 'approved', 'present'].includes(s)) return 'bg-green-900 text-green-200'
  if (['pending', 'inactive', 'on_leave'].includes(s)) return 'bg-amber-900 text-amber-200'
  if (['rejected', 'resigned', 'absent'].includes(s)) return 'bg-red-900 text-red-200'
  return 'bg-gray-800 text-gray-200'
})

const displayLabel = computed(() => {
  const raw = String(props.status || '').trim()
  if (!raw) return ''
  return raw
    .split('_')
    .join(' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="badgeClass"
  >
    <slot>{{ displayLabel }}</slot>
  </span>
</template>


