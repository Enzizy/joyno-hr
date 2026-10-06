<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: '' },
  variant: { type: String, default: 'auto' }, // auto | success | warning | danger | info | violet | orange | neutral
})

const badgeTone = computed(() => {
  const tones = ['success', 'warning', 'danger', 'info', 'violet', 'orange', 'neutral']
  if (props.variant !== 'auto') return tones.includes(props.variant) ? props.variant : 'neutral'
  const status = String(props.status || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (['active', 'approved', 'present', 'completed', 'published', 'paid', 'read'].includes(status)) return 'success'
  if (['pending', 'in_progress', 'important', 'medium', 'needs_review'].includes(status)) return 'warning'
  if (['rejected', 'absent', 'overdue', 'urgent', 'failed'].includes(status)) return 'danger'
  if (['on_leave', 'unread', 'scheduled'].includes(status)) return 'info'
  if (status === 'high') return 'orange'
  return 'neutral'
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
    class="status-badge inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
    :class="`status-badge--${badgeTone}`"
  >
    <slot>{{ displayLabel }}</slot>
  </span>
</template>


