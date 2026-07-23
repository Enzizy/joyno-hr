<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const props = defineProps({ show: Boolean, employee: { type: Object, default: null }, user: { type: Object, default: null }, activities: { type: Array, default: () => [] }, loading: Boolean })
const emit = defineEmits(['close', 'edit', 'awol', 'manage-account'])

const fullName = computed(() => `${props.employee?.first_name || ''} ${props.employee?.last_name || ''}`.trim())
const initials = computed(() => `${props.employee?.first_name?.[0] || ''}${props.employee?.last_name?.[0] || ''}`.toUpperCase() || '?')

function formatDate(value) {
  if (!value) return 'Not recorded'
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function activityLabel(action) {
  return String(action || 'Updated').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function onKeydown(event) {
  if (event.key === 'Escape' && props.show) emit('close')
}

watch(() => props.show, (show) => {
  document.body.classList.toggle('overflow-hidden', show)
  if (show) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.body.classList.remove('overflow-hidden')
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50">
      <button type="button" class="absolute inset-0 bg-black/55 backdrop-blur-[1px]" aria-label="Close employee details" @click="emit('close')" />
      <aside class="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-gray-800 bg-gray-950 shadow-2xl shadow-black/60" role="dialog" aria-modal="true" :aria-label="`${fullName} details`">
        <header class="shrink-0 border-b border-gray-800 p-5">
          <div class="flex items-start gap-4">
            <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary-500 text-lg font-semibold text-gray-100">{{ initials }}</span>
            <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h2 class="truncate text-xl font-semibold text-gray-100">{{ fullName }}</h2><StatusBadge :status="employee?.status" /></div><p class="mt-1 text-sm text-gray-400">{{ employee?.employee_code }} · {{ employee?.position || 'Position not set' }}</p><p class="mt-1 text-sm capitalize text-gray-500">{{ employee?.department || 'Unassigned' }} · {{ employee?.shift || 'day' }} shift</p></div>
            <button type="button" class="rounded-lg p-2 text-xl text-gray-500 hover:bg-gray-900 hover:text-gray-200" aria-label="Close" @click="emit('close')">×</button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <section class="border-b border-gray-800 p-5"><h3 class="text-sm font-semibold text-gray-200">Employment</h3><dl class="mt-4 space-y-3 text-sm"><div class="flex justify-between gap-4"><dt class="text-gray-500">Department</dt><dd class="text-right text-gray-200">{{ employee?.department || 'Unassigned' }}</dd></div><div class="flex justify-between gap-4"><dt class="text-gray-500">Position</dt><dd class="text-right text-gray-200">{{ employee?.position || 'Not recorded' }}</dd></div><div class="flex justify-between gap-4"><dt class="text-gray-500">Shift</dt><dd class="capitalize text-gray-200">{{ employee?.shift || 'day' }}</dd></div><div class="flex justify-between gap-4"><dt class="text-gray-500">Date hired</dt><dd class="text-gray-200">{{ formatDate(employee?.date_hired) }}</dd></div></dl></section>

          <section class="border-b border-gray-800 p-5"><h3 class="text-sm font-semibold text-gray-200">Leave overview</h3><div class="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="text-xs uppercase tracking-wider text-gray-500">Available leave credits</p><p class="mt-2 text-2xl font-semibold text-primary-300">{{ Number(employee?.leave_credits || 0).toFixed(2) }}</p><p class="mt-1 text-xs text-gray-500">Current general leave-credit balance</p></div></section>

          <section class="border-b border-gray-800 p-5"><h3 class="text-sm font-semibold text-gray-200">Account access</h3><div v-if="user" class="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="truncate text-sm font-medium text-gray-200">{{ user.email }}</p><div class="mt-3 flex items-center justify-between"><span class="text-xs capitalize text-gray-500">{{ user.role }} role</span><span class="rounded-full border border-emerald-800/70 bg-emerald-950/35 px-2 py-0.5 text-xs text-emerald-300">Linked</span></div></div><div v-else class="mt-4 rounded-xl border border-dashed border-gray-700 p-4"><p class="text-sm font-medium text-gray-300">No linked user account</p><p class="mt-1 text-xs leading-5 text-gray-500">Create an account when this employee needs workspace access.</p></div><AppButton class="mt-3 w-full" variant="secondary" @click="emit('manage-account')">{{ user ? 'Manage account' : 'Create account' }}</AppButton></section>

          <section class="p-5"><h3 class="text-sm font-semibold text-gray-200">Recent activity</h3><div v-if="loading" class="mt-4 space-y-2"><div v-for="item in 3" :key="item" class="h-10 animate-pulse rounded-lg bg-gray-900" /></div><ol v-else-if="activities.length" class="mt-4 space-y-4"><li v-for="item in activities.slice(0, 5)" :key="item.id" class="flex gap-3"><span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" /><span class="min-w-0"><span class="block text-sm text-gray-300">{{ activityLabel(item.action) }}</span><time class="mt-0.5 block text-xs text-gray-600">{{ new Date(item.created_at).toLocaleString() }}</time></span></li></ol><p v-else class="mt-4 text-sm text-gray-500">No recent employee changes recorded.</p></section>
        </div>

        <footer class="flex shrink-0 gap-2 border-t border-gray-800 bg-gray-950 p-4"><AppButton class="flex-1" variant="secondary" @click="emit('awol')">Record AWOL</AppButton><AppButton class="flex-1" @click="emit('edit')">Edit employee</AppButton></footer>
      </aside>
    </div>
  </Teleport>
</template>
