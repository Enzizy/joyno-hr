<script setup>
import AppButton from '@/components/ui/AppButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getAttachmentReviewPresentation } from '@/utils/leaveAttachmentPresentation'

defineProps({ rows: { type: Array, default: () => [] }, loading: Boolean })
defineEmits(['details', 'approve', 'reject', 'delete'])

function date(value) {
  if (!value) return '-'
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="space-y-3 md:hidden">
    <div v-if="loading" class="space-y-3"><div v-for="item in 3" :key="item" class="h-44 animate-pulse rounded-xl bg-gray-800" /></div>
    <EmptyState v-else-if="!rows.length" compact title="No leave requests found" description="Try adjusting the filters." />
    <article v-for="row in rows" v-else :key="row.id" class="rounded-xl border border-gray-800 bg-gray-900 p-4" @click="$emit('details', row)">
      <div class="flex items-start justify-between gap-3"><div class="min-w-0"><h3 class="truncate font-semibold text-gray-100">{{ row.employee_name }}</h3><p class="mt-1 text-xs text-gray-400">{{ row.leave_type_name }}</p><StatusBadge v-if="row.attachment_review_status && row.attachment_review_status !== 'not_required'" class="mt-2" :status="getAttachmentReviewPresentation(row.attachment_review_status).label" :variant="getAttachmentReviewPresentation(row.attachment_review_status).variant">{{ getAttachmentReviewPresentation(row.attachment_review_status).label }}</StatusBadge></div><span class="relative"><StatusBadge :status="row.status" /><i v-if="row.unread_comment_count" class="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" /></span></div>
      <p class="mt-3 text-sm text-primary-200">{{ date(row.start_date) }} – {{ date(row.end_date) }}</p>
      <p class="mt-2 line-clamp-2 text-sm text-gray-300">{{ row.reason || 'No reason provided.' }}</p>
      <p class="mt-2 text-xs uppercase text-gray-500">{{ row.leave_pay_type || 'unpaid' }} · {{ Number(row.paid_days || 0) }} paid / {{ Number(row.unpaid_days || 0) }} unpaid</p>
      <div class="mt-4 flex flex-wrap gap-2" @click.stop><AppButton variant="secondary" size="sm" @click="$emit('details', row)">View details</AppButton><template v-if="row.status === 'pending'"><AppButton variant="success" size="sm" @click="$emit('approve', row)">Approve</AppButton><AppButton variant="danger" size="sm" @click="$emit('reject', row)">Reject</AppButton></template><AppButton v-else variant="danger" size="sm" @click="$emit('delete', row)">Delete</AppButton></div>
    </article>
  </div>
</template>
