<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getRolePresentation } from '@/utils/rolePresentation'

const props = defineProps({ show: Boolean, user: { type: Object, default: null }, employee: { type: Object, default: null } })
const emit = defineEmits(['close', 'delete'])
const name = computed(() => [props.user?.first_name, props.user?.last_name].filter(Boolean).join(' ') || 'Unlinked account')
const initials = computed(() => name.value.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase())
const rolePresentation = computed(() => getRolePresentation(props.user?.role))
function closeOnEscape(event) { if (event.key === 'Escape' && props.show) emit('close') }
watch(() => props.show, (show) => { document.body.classList.toggle('overflow-hidden', show); if (show) document.addEventListener('keydown', closeOnEscape); else document.removeEventListener('keydown', closeOnEscape) })
onBeforeUnmount(() => { document.body.classList.remove('overflow-hidden'); document.removeEventListener('keydown', closeOnEscape) })
</script>

<template>
  <Teleport to="body"><div v-if="show" class="fixed inset-0 z-50"><button class="absolute inset-0 bg-black/55 backdrop-blur-[1px]" aria-label="Close account details" @click="emit('close')" /><aside class="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-gray-800 bg-gray-950 shadow-2xl shadow-black/60" role="dialog" aria-modal="true">
    <header class="border-b border-gray-800 p-5"><div class="flex items-start gap-4"><span class="flex h-14 w-14 items-center justify-center rounded-full border text-lg font-semibold" :class="rolePresentation.avatarClass">{{ initials }}</span><div class="min-w-0 flex-1"><h2 class="truncate text-xl font-semibold text-gray-100">{{ name }}</h2><p class="mt-1 truncate text-sm text-gray-400">{{ user?.email }}</p><div class="mt-2"><StatusBadge :status="user?.role" :variant="rolePresentation.variant">{{ rolePresentation.label }}</StatusBadge></div></div><button class="rounded-lg p-2 text-xl text-gray-500 hover:bg-gray-900 hover:text-gray-200" @click="emit('close')">×</button></div></header>
    <div class="min-h-0 flex-1 overflow-y-auto"><section class="border-b border-gray-800 p-5"><h3 class="text-sm font-semibold text-gray-200">Account access</h3><dl class="mt-4 space-y-3 text-sm"><div class="flex justify-between gap-4"><dt class="text-gray-500">Email</dt><dd class="max-w-64 truncate text-gray-200">{{ user?.email }}</dd></div><div class="flex justify-between gap-4"><dt class="text-gray-500">Role</dt><dd class="font-medium text-gray-200">{{ rolePresentation.label }}</dd></div><div class="flex justify-between gap-4"><dt class="text-gray-500">Account ID</dt><dd class="text-gray-200">#{{ user?.id }}</dd></div></dl></section><section class="p-5"><h3 class="text-sm font-semibold text-gray-200">Linked employee</h3><div v-if="employee" class="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="font-medium text-gray-200">{{ employee.first_name }} {{ employee.last_name }}</p><p class="mt-1 text-sm text-gray-500">{{ employee.employee_code }} · {{ employee.position || 'Position not set' }}</p><p class="mt-1 text-sm text-gray-500">{{ employee.department || 'Unassigned' }}</p><div class="mt-3"><StatusBadge :status="employee.status" /></div></div><p v-else class="mt-4 rounded-xl border border-dashed border-gray-700 p-4 text-sm text-gray-500">This account is not linked to an employee record.</p></section></div>
    <footer class="border-t border-gray-800 p-4"><AppButton class="w-full" variant="danger" @click="emit('delete')">Delete account</AppButton></footer>
  </aside></div></Teleport>
</template>
