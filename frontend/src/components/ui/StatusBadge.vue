<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: '' },
  variant: { type: String, default: 'auto' }, // auto | success | warning | danger | info | violet | orange | neutral
})

const badgeClass = computed(() => {
  if (props.variant !== 'auto') {
    const v = {
      success: 'border-emerald-800/70 bg-emerald-950/35 text-emerald-300',
      warning: 'border-amber-800/70 bg-amber-950/35 text-amber-300',
      danger: 'border-red-800/70 bg-red-950/35 text-red-300',
      info: 'border-sky-800/70 bg-sky-950/30 text-sky-300',
      violet: 'border-violet-800/70 bg-violet-950/30 text-violet-300',
      orange: 'border-orange-800/70 bg-orange-950/30 text-orange-300',
      neutral: 'border-gray-700 bg-gray-800/70 text-gray-300',
    }
    return v[props.variant] || v.info
  }
  const s = (props.status || '').toLowerCase()
  if (['active', 'approved', 'present', 'completed'].includes(s)) return 'border-emerald-800/70 bg-emerald-950/35 text-emerald-300'
  if (['pending', 'inactive', 'on_leave', 'in_progress'].includes(s)) return 'border-amber-800/70 bg-amber-950/35 text-amber-300'
  if (['rejected', 'resigned', 'absent', 'overdue'].includes(s)) return 'border-red-800/70 bg-red-950/35 text-red-300'
  return 'border-gray-700 bg-gray-800/70 text-gray-300'
})

const badgeTone = computed(() => {
  if (props.variant !== 'auto') return props.variant
  const status = String(props.status || '').toLowerCase()
  if (['active', 'approved', 'present', 'completed'].includes(status)) return 'success'
  if (['pending', 'inactive', 'on_leave', 'in_progress'].includes(status)) return 'warning'
  if (['rejected', 'resigned', 'absent', 'overdue'].includes(status)) return 'danger'
  return 'info'
})

const displayLabel = computed(() => {
  const raw = String(props.status || '').trim()
  if (!raw) return ''
  const acronyms = { ceo: 'CEO', hr: 'HR', it: 'IT' }
  if (acronyms[raw.toLowerCase()]) return acronyms[raw.toLowerCase()]
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
    class="status-badge inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
    :class="[badgeClass, `status-badge--${badgeTone}`]"
  >
    <slot>{{ displayLabel }}</slot>
  </span>
</template>


