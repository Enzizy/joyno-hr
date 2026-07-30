<script setup>
import AppButton from '@/components/ui/AppButton.vue'

defineProps({
  row: { type: Object, required: true },
  selected: Boolean,
  tone: String,
  state: String,
  stateClass: String,
  initials: String,
  dateRange: String,
  duration: String,
  selectable: Boolean,
  checked: Boolean,
})

defineEmits(['review', 'toggle'])
</script>

<template>
  <article
    class="grid cursor-pointer items-center gap-3 rounded-xl border border-l-4 bg-gray-900 px-4 py-3 transition hover:border-gray-700 sm:grid-cols-[auto_minmax(150px,1.2fr)_minmax(180px,1fr)_minmax(145px,0.8fr)_auto]"
    :class="[tone, selected ? 'border-primary-600/60 bg-primary-500/[0.04]' : 'border-gray-800']"
    @click="$emit('review')"
  >
    <div class="flex items-center gap-3">
      <input
        v-if="selectable"
        type="checkbox"
        :checked="checked"
        class="shrink-0"
        @click.stop
        @change="$emit('toggle', $event.target.checked)"
      />
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-950 text-xs font-bold text-gray-200">
        {{ initials }}
      </span>
    </div>
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <p class="truncate text-sm font-semibold text-gray-100">{{ row.employee_name }}</p>
        <i v-if="row.unread_comment_count" class="h-2 w-2 shrink-0 rounded-full bg-red-500" />
      </div>
      <p class="mt-0.5 truncate text-xs text-gray-500">{{ row.leave_type_name }} · {{ row.department }}</p>
    </div>
    <div class="min-w-0">
      <p class="truncate text-sm text-gray-300">{{ dateRange }}</p>
      <p class="mt-0.5 text-xs text-gray-600">{{ duration }}</p>
    </div>
    <div class="min-w-0">
      <p class="text-xs font-semibold" :class="stateClass">{{ state }}</p>
      <p v-if="row.status === 'pending'" class="mt-0.5 text-xs text-gray-600">
        {{ row.low_risk ? 'Low risk' : 'Review required' }}
      </p>
    </div>
    <AppButton variant="secondary" size="sm" @click.stop="$emit('review')">Review</AppButton>
  </article>
</template>
