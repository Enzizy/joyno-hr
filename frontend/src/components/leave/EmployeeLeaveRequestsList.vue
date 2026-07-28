<script setup>
import { ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppTable from '@/components/ui/AppTable.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LeaveChangeRequestModal from '@/components/leave/LeaveChangeRequestModal.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useEmployeeLeaveChanges } from '@/composables/useEmployeeLeaveChanges'
import { useToastStore } from '@/stores/toastStore'
import { getLeaveTypePresentation } from '@/utils/leavePresentation'
import { getAttachmentReviewPresentation } from '@/utils/leaveAttachmentPresentation'

defineProps({ rows: { type: Array, default: () => [] }, loading: Boolean })
defineEmits(['details', 'attachment', 'edit', 'cancel'])

const toast = useToastStore()
const { pendingByLeaveId, submit } = useEmployeeLeaveChanges()
const changeModal = ref(false)
const selectedRow = ref(null)
const submittingChange = ref(false)

function todayISO() {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function canRequestChange(row) {
  return row.status === 'approved' && String(row.start_date).slice(0, 10) > todayISO()
}

function openChangeRequest(row) {
  selectedRow.value = row
  changeModal.value = true
}

async function submitChangeRequest(payload) {
  submittingChange.value = true
  try {
    await submit(payload)
    changeModal.value = false
    toast.success('Your leave change request was sent for review.')
  } catch (error) {
    toast.error(error.message || 'Failed to submit leave change request.')
  } finally {
    submittingChange.value = false
  }
}

function formatDate(value, withTime = false) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(undefined, withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRange(row) {
  return `${formatDate(row.start_date)} – ${formatDate(row.end_date)}`
}

function payLabel(row) {
  const pay = String(row.leave_pay_type || 'unpaid').replace('_', ' ').toUpperCase()
  const paid = Number(row.paid_days || 0)
  const unpaid = Number(row.unpaid_days || 0)
  return paid || unpaid ? `${pay} · ${paid} paid / ${unpaid} unpaid` : pay
}
</script>

<template>
  <section class="space-y-3">
    <div><h2 class="text-lg font-semibold text-primary-200">My leave requests</h2><p class="mt-1 text-sm text-gray-400">Open any request to view its full history or reply to management.</p></div>

    <div class="space-y-3 md:hidden">
      <div v-if="loading" class="space-y-3"><div v-for="item in 3" :key="item" class="h-36 animate-pulse rounded-xl bg-gray-800" /></div>
      <EmptyState v-else-if="!rows.length" compact title="No leave requests yet" description="Your submitted requests will appear here." />
      <article v-for="row in rows" v-else :key="row.id" class="rounded-xl border border-gray-800 bg-gray-900 p-4" @click="$emit('details', row)">
        <div class="flex items-start justify-between gap-3"><div class="min-w-0"><StatusBadge :status="row.leave_type_name" :variant="getLeaveTypePresentation(row.leave_type_name).variant">{{ getLeaveTypePresentation(row.leave_type_name).label }}</StatusBadge><p class="mt-2 text-xs text-gray-400">{{ formatRange(row) }}</p></div><div class="flex flex-col items-end gap-2"><StatusBadge :status="row.status" /><StatusBadge v-if="row.attachment_review_status && row.attachment_review_status !== 'not_required'" :status="getAttachmentReviewPresentation(row.attachment_review_status).label" :variant="getAttachmentReviewPresentation(row.attachment_review_status).variant">{{ getAttachmentReviewPresentation(row.attachment_review_status).label }}</StatusBadge></div></div>
        <p class="mt-3 line-clamp-2 text-sm text-gray-300">{{ row.reason || 'No reason provided.' }}</p>
        <p class="mt-2 text-xs text-gray-500">{{ payLabel(row) }}</p>
        <div class="mt-4 flex flex-wrap gap-2" @click.stop><AppButton variant="secondary" size="sm" @click="$emit('details', row)">View details<span v-if="row.unread_comment_count" class="h-2 w-2 rounded-full bg-red-500" /></AppButton><AppButton v-if="row.status === 'pending'" variant="secondary" size="sm" @click="$emit('edit', row)">Edit</AppButton><AppButton v-if="row.status === 'pending'" variant="danger" size="sm" @click="$emit('cancel', row)">Cancel</AppButton><StatusBadge v-if="pendingByLeaveId.has(Number(row.id))" status="pending">{{ pendingByLeaveId.get(Number(row.id)).request_type === 'move' ? 'Move pending' : 'Cancellation pending' }}</StatusBadge><AppButton v-else-if="canRequestChange(row)" variant="secondary" size="sm" @click="openChangeRequest(row)">Request change</AppButton></div>
      </article>
    </div>

    <AppTable :loading="loading" class="hidden md:block">
      <thead class="bg-gray-950"><tr><th class="table-heading">Dates</th><th class="table-heading">Filed</th><th class="table-heading">Type</th><th class="table-heading">Pay</th><th class="table-heading">Status</th><th class="table-heading text-right">Actions</th></tr></thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in rows" :key="row.id" class="cursor-pointer hover:bg-gray-950" @click="$emit('details', row)"><td class="table-cell text-primary-200">{{ formatRange(row) }}</td><td class="table-cell whitespace-nowrap">{{ formatDate(row.created_at, true) }}</td><td class="table-cell"><StatusBadge :status="row.leave_type_name" :variant="getLeaveTypePresentation(row.leave_type_name).variant">{{ getLeaveTypePresentation(row.leave_type_name).label }}</StatusBadge></td><td class="table-cell text-xs">{{ payLabel(row) }}</td><td class="table-cell"><div class="flex flex-col items-start gap-2"><StatusBadge :status="row.status" /><StatusBadge v-if="row.attachment_review_status && row.attachment_review_status !== 'not_required'" :status="getAttachmentReviewPresentation(row.attachment_review_status).label" :variant="getAttachmentReviewPresentation(row.attachment_review_status).variant">{{ getAttachmentReviewPresentation(row.attachment_review_status).label }}</StatusBadge></div></td><td class="table-cell text-right" @click.stop><div class="flex flex-wrap justify-end gap-2"><AppButton variant="secondary" size="sm" @click="$emit('details', row)">Details<span v-if="row.unread_comment_count" class="h-2 w-2 rounded-full bg-red-500" /></AppButton><AppButton v-if="row.status === 'pending'" variant="secondary" size="sm" @click="$emit('edit', row)">Edit</AppButton><AppButton v-if="row.status === 'pending'" variant="danger" size="sm" @click="$emit('cancel', row)">Cancel</AppButton><StatusBadge v-if="pendingByLeaveId.has(Number(row.id))" status="pending">{{ pendingByLeaveId.get(Number(row.id)).request_type === 'move' ? 'Move pending' : 'Cancellation pending' }}</StatusBadge><AppButton v-else-if="canRequestChange(row)" variant="secondary" size="sm" @click="openChangeRequest(row)">Request change</AppButton></div></td></tr>
        <tr v-if="!rows.length && !loading"><td colspan="6" class="p-4"><EmptyState compact title="No leave requests yet" description="Your submitted requests will appear here." /></td></tr>
      </tbody>
    </AppTable>
    <LeaveChangeRequestModal
      :show="changeModal"
      :row="selectedRow"
      :submitting="submittingChange"
      @close="changeModal = false"
      @submit="submitChangeRequest"
    />
  </section>
</template>
