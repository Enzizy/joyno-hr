<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const props = defineProps({ show: Boolean, employee: { type: Object, default: null }, user: { type: Object, default: null }, activities: { type: Array, default: () => [] }, loading: Boolean })
const emit = defineEmits(['close', 'edit', 'awol', 'manage-account'])

const fullName = computed(() => `${props.employee?.first_name || ''} ${props.employee?.last_name || ''}`.trim())
const initials = computed(() => `${props.employee?.first_name?.[0] || ''}${props.employee?.last_name?.[0] || ''}`.toUpperCase() || '?')
const leaveBalance = computed(() => props.employee?.leave_balance_breakdown || null)
const paidLeaveBalances = computed(() => leaveBalance.value?.balances || [])

const leaveToneById = {
  vacation_leave: { badge: 'border-emerald-800/70 bg-emerald-950/40 text-emerald-300', bar: 'bg-emerald-500' },
  sick_leave: { badge: 'border-sky-800/70 bg-sky-950/40 text-sky-300', bar: 'bg-sky-500' },
  bereavement_leave: { badge: 'border-violet-800/70 bg-violet-950/40 text-violet-300', bar: 'bg-violet-500' },
  service_incentive_leave: { badge: 'border-amber-800/70 bg-amber-950/40 text-amber-300', bar: 'bg-amber-500' },
}

function leaveTone(id) {
  return leaveToneById[id] || { badge: 'border-gray-700 bg-gray-900 text-gray-300', bar: 'bg-gray-500' }
}

function leaveAbbreviation(item) {
  const known = { vacation_leave: 'VL', sick_leave: 'SL', bereavement_leave: 'BL', service_incentive_leave: 'SIL' }
  return known[item.id] || String(item.name || 'Leave').split(/\s+/).map((word) => word[0]).join('').slice(0, 3).toUpperCase()
}

function formatBalance(value) {
  return Number(value || 0).toFixed(2)
}

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

          <section class="border-b border-gray-800 p-5">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold text-gray-200">Leave balances</h3>
              <span v-if="leaveBalance?.year" class="text-xs text-gray-500">{{ leaveBalance.year }}</span>
            </div>

            <div v-if="paidLeaveBalances.length" class="mt-4 space-y-3">
              <article v-for="item in paidLeaveBalances" :key="item.id" class="rounded-xl border border-gray-800 bg-gray-900 p-3.5">
                <div class="flex items-center gap-3">
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold" :class="leaveTone(item.id).badge">{{ leaveAbbreviation(item) }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-gray-200">{{ item.name }}</p>
                        <p class="mt-0.5 text-xs text-gray-500">{{ item.eligible ? `${formatBalance(item.used)} used` : `Available after ${item.min_months_employed} months` }}</p>
                      </div>
                      <div class="shrink-0 text-right">
                        <p class="text-sm font-semibold text-gray-100">{{ item.eligible ? `${formatBalance(item.remaining)} days left` : 'Not eligible' }}</p>
                        <p v-if="item.eligible" class="text-[11px] text-gray-500">of {{ formatBalance(item.annual_allowance) }} days</p>
                      </div>
                    </div>
                    <div class="mt-3 h-1 overflow-hidden rounded-full bg-gray-800">
                      <div class="h-full rounded-full" :class="item.eligible ? leaveTone(item.id).bar : 'bg-gray-700'" :style="{ width: `${item.eligible && item.annual_allowance ? Math.min(100, (item.remaining / item.annual_allowance) * 100) : 0}%` }" />
                    </div>
                  </div>
                </div>
              </article>

              <div class="flex items-center justify-between gap-4 rounded-xl border border-primary-900/60 bg-primary-950/20 px-4 py-3">
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-gray-500">Shared paid credit pool</p>
                  <p class="mt-1 text-xs text-gray-500">Maximum credits available across all paid leave types</p>
                </div>
                <p class="shrink-0 text-xl font-semibold text-primary-300">{{ formatBalance(leaveBalance.available_credit_pool) }}</p>
              </div>
            </div>

            <div v-else class="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs uppercase tracking-wider text-gray-500">Available leave credits</p>
              <p class="mt-2 text-2xl font-semibold text-primary-300">{{ formatBalance(employee?.leave_credits) }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ loading ? 'Loading individual leave balances…' : 'Current shared paid credit pool' }}</p>
            </div>
          </section>

          <section class="border-b border-gray-800 p-5"><h3 class="text-sm font-semibold text-gray-200">Account access</h3><div v-if="user" class="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4"><p class="truncate text-sm font-medium text-gray-200">{{ user.email }}</p><div class="mt-3 flex items-center justify-between"><span class="text-xs capitalize text-gray-500">{{ user.role }} role</span><span class="rounded-full border border-emerald-800/70 bg-emerald-950/35 px-2 py-0.5 text-xs text-emerald-300">Linked</span></div></div><div v-else class="mt-4 rounded-xl border border-dashed border-gray-700 p-4"><p class="text-sm font-medium text-gray-300">No linked user account</p><p class="mt-1 text-xs leading-5 text-gray-500">Create an account when this employee needs workspace access.</p></div><AppButton class="mt-3 w-full" variant="secondary" @click="emit('manage-account')">{{ user ? 'Manage account' : 'Create account' }}</AppButton></section>

          <section class="p-5"><h3 class="text-sm font-semibold text-gray-200">Recent activity</h3><div v-if="loading" class="mt-4 space-y-2"><div v-for="item in 3" :key="item" class="h-10 animate-pulse rounded-lg bg-gray-900" /></div><ol v-else-if="activities.length" class="mt-4 space-y-4"><li v-for="item in activities.slice(0, 5)" :key="item.id" class="flex gap-3"><span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" /><span class="min-w-0"><span class="block text-sm text-gray-300">{{ activityLabel(item.action) }}</span><time class="mt-0.5 block text-xs text-gray-600">{{ new Date(item.created_at).toLocaleString() }}</time></span></li></ol><p v-else class="mt-4 text-sm text-gray-500">No recent employee changes recorded.</p></section>
        </div>

        <footer class="flex shrink-0 gap-2 border-t border-gray-800 bg-gray-950 p-4"><AppButton class="flex-1" variant="secondary" @click="emit('awol')">Record AWOL</AppButton><AppButton class="flex-1" @click="emit('edit')">Edit employee</AppButton></footer>
      </aside>
    </div>
  </Teleport>
</template>
