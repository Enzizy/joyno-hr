<script setup>
import { computed, onMounted, ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import {
  approveLeaveChangeRequest,
  getLeaveChangeRequests,
  rejectLeaveChangeRequest,
} from '@/services/backendService'
import { useLeaveStore } from '@/stores/leaveStore'
import { useToastStore } from '@/stores/toastStore'

const leaveStore = useLeaveStore()
const toast = useToastStore()
const rows = ref([])
const loading = ref(false)
const actionModal = ref(false)
const selected = ref(null)
const action = ref('approve')
const comment = ref('')
const saving = ref(false)

const pendingRows = computed(() => rows.value.filter((row) => row.status === 'pending'))

async function refresh() {
  loading.value = true
  try {
    rows.value = await getLeaveChangeRequests({ status: 'pending' })
  } catch (error) {
    toast.error(error.message || 'Failed to load leave change requests.')
  } finally {
    loading.value = false
  }
}

function openAction(row, nextAction) {
  selected.value = row
  action.value = nextAction
  comment.value = ''
  actionModal.value = true
}

async function confirmAction() {
  if (!selected.value || (action.value === 'reject' && !comment.value.trim())) return
  saving.value = true
  try {
    if (action.value === 'approve') {
      await approveLeaveChangeRequest(selected.value.id, comment.value.trim())
    } else {
      await rejectLeaveChangeRequest(selected.value.id, comment.value.trim())
    }
    toast.success(`Leave change request ${action.value === 'approve' ? 'approved' : 'rejected'}.`)
    actionModal.value = false
    await Promise.all([refresh(), leaveStore.fetchRequests()])
  } catch (error) {
    toast.error(error.message || `Failed to ${action.value} change request.`)
  } finally {
    saving.value = false
  }
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRange(start, end) {
  return `${formatDate(start)} – ${formatDate(end)}`
}

onMounted(refresh)
</script>

<template>
  <section class="surface-card overflow-hidden">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="font-semibold text-gray-100">Approved leave changes</h2>
          <span v-if="pendingRows.length" class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">{{ pendingRows.length }}</span>
        </div>
        <p class="mt-1 text-xs text-gray-500">Review employee requests to move or cancel future approved leave.</p>
      </div>
      <AppButton variant="secondary" size="sm" :loading="loading" @click="refresh">Refresh</AppButton>
    </header>

    <div v-if="loading" class="grid gap-3 p-4 lg:grid-cols-2">
      <div v-for="item in 2" :key="item" class="h-44 animate-pulse rounded-xl bg-gray-800" />
    </div>
    <EmptyState v-else-if="!pendingRows.length" compact title="No leave changes awaiting review" description="Move and cancellation requests will appear here." />
    <div v-else class="grid gap-3 p-4 xl:grid-cols-2">
      <article v-for="row in pendingRows" :key="row.id" class="rounded-xl border border-gray-800 bg-gray-950/35 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="font-semibold text-gray-100">{{ row.employee_name }}</p>
            <p class="mt-1 text-xs text-gray-500">{{ row.leave_type_name }} · requested {{ formatDate(row.created_at) }}</p>
          </div>
          <StatusBadge status="pending">{{ row.request_type === 'move' ? 'Move request' : 'Cancellation request' }}</StatusBadge>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-gray-800 bg-black/20 p-3">
            <p class="text-[11px] uppercase tracking-wider text-gray-500">Current approved dates</p>
            <p class="mt-1 text-sm font-medium text-gray-200">{{ formatRange(row.original_start_date, row.original_end_date) }}</p>
          </div>
          <div class="rounded-lg border p-3" :class="row.request_type === 'move' ? 'border-blue-800/40 bg-blue-950/15' : 'border-red-900/40 bg-red-950/15'">
            <p class="text-[11px] uppercase tracking-wider" :class="row.request_type === 'move' ? 'text-blue-400' : 'text-red-400'">Requested change</p>
            <p class="mt-1 text-sm font-medium text-gray-200">{{ row.request_type === 'move' ? formatRange(row.requested_start_date, row.requested_end_date) : 'Cancel this leave' }}</p>
          </div>
        </div>

        <div class="mt-3 rounded-lg border border-gray-800 p-3">
          <p class="text-[11px] uppercase tracking-wider text-gray-500">Employee reason</p>
          <p class="mt-1 whitespace-pre-wrap text-sm text-gray-300">{{ row.reason }}</p>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <AppButton variant="danger" size="sm" @click="openAction(row, 'reject')">Reject</AppButton>
          <AppButton variant="success" size="sm" @click="openAction(row, 'approve')">Approve</AppButton>
        </div>
      </article>
    </div>
  </section>

  <AppModal :show="actionModal" :title="`${action === 'approve' ? 'Approve' : 'Reject'} leave change`" @close="actionModal = false">
    <div v-if="selected" class="space-y-4">
      <p class="text-sm text-gray-300">
        {{ action === 'approve' ? 'Approve' : 'Reject' }}
        <strong class="text-gray-100">{{ selected.employee_name }}</strong>'s
        {{ selected.request_type === 'move' ? 'date move' : 'leave cancellation' }} request?
      </p>
      <p v-if="action === 'approve' && selected.request_type === 'cancel'" class="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-300">
        Approving will cancel the leave and return {{ Number(selected.credits_deducted || 0).toFixed(2) }} deducted credit(s).
      </p>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-200">
          Management note <span v-if="action === 'reject'" class="text-red-500">*</span>
        </label>
        <textarea v-model="comment" rows="3" maxlength="2000" class="form-control resize-y" :placeholder="action === 'reject' ? 'Explain why this request cannot be approved…' : 'Optional note for the employee…'" />
      </div>
    </div>
    <template #footer>
      <AppButton variant="secondary" @click="actionModal = false">Close</AppButton>
      <AppButton :variant="action === 'approve' ? 'success' : 'danger'" :loading="saving" :disabled="action === 'reject' && !comment.trim()" @click="confirmAction">
        {{ action === 'approve' ? 'Approve change' : 'Reject request' }}
      </AppButton>
    </template>
  </AppModal>
</template>
