<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: '' },
  variant: { type: String, default: 'auto' }, // auto | success | warning | danger | info
})

const badgeClass = computed(() => {
  if (props.variant !== 'auto') {
    const v = {
      success: 'bg-green-100 text-green-800',
      warning: 'bg-amber-100 text-amber-800',
      danger: 'bg-red-100 text-red-800',
      info: 'bg-blue-100 text-blue-800',
    }
    return v[props.variant] || v.info
  }
  const s = (props.status || '').toLowerCase()
  if (['active', 'approved', 'present'].includes(s)) return 'bg-green-100 text-green-800'
  if (['pending', 'inactive'].includes(s)) return 'bg-amber-100 text-amber-800'
  if (['rejected', 'resigned', 'absent'].includes(s)) return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="badgeClass"
  >
    <slot>{{ status }}</slot>
  </span>
</template>
