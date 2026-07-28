<script setup>
import { computed, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LeaveAttachmentReviewCard from '@/components/leave/LeaveAttachmentReviewCard.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getLeaveTypePresentation } from '@/utils/leavePresentation'
import { requiresAttachmentReview } from '@/utils/leaveAttachmentPresentation'

const props = defineProps({
  show: Boolean,
  row: { type: Object, default: null },
  comments: { type: Array, default: () => [] },
  commentsLoading: Boolean,
  timeline: { type: Array, default: () => [] },
  timelineLoading: Boolean,
  availability: { type: Object, default: null },
  availabilityLoading: Boolean,
  management: Boolean,
  attachmentUploading: Boolean,
  documentReviewing: Boolean,
})

defineEmits([
  'close',
  'add-note',
  'approve',
  'reject',
  'view-attachment',
  'mark-document-valid',
  'request-document-replacement',
  'upload-document-replacement',
])

const activeTab = ref('overview')
watch(() => props.row?.id, () => { activeTab.value = 'overview' })

const statusClass = computed(() => {
  if (props.row?.status === 'approved') return 'text-emerald-400'
  if (props.row?.status === 'rejected') return 'text-red-400'
  return 'text-amber-300'
})

const fallbackTimeline = computed(() => {
  if (props.timeline.length) return props.timeline
  if (!props.row) return []
  const events = [{ id: `submitted-${props.row.id}`, type: 'submitted', title: 'Leave request submitted', actor: props.row.employee_name || 'Employee', message: props.row.leave_type_name, created_at: props.row.created_at }]
  for (const comment of props.comments) {
    events.push({ id: `comment-${comment.id}`, type: 'comment', title: 'Comment added', actor: comment.author_name || comment.author_role, actor_role: comment.author_role, message: comment.message, created_at: comment.created_at })
  }
  if (['approved', 'rejected'].includes(props.row.status)) {
    events.push({ id: `decision-${props.row.id}`, type: props.row.status, title: `Leave request ${props.row.status}`, actor: props.row.approved_by_name || 'Management', actor_role: props.row.approved_by_role, message: props.row.status === 'rejected' ? props.row.rejection_comment : '', created_at: props.row.decided_at || props.row.created_at })
  }
  return events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
})

function formatDate(value, includeTime = false) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(undefined, includeTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

function eventTone(type) {
  if (type === 'approved') return 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
  if (type === 'rejected') return 'border-red-500 bg-red-500/15 text-red-300'
  if (type === 'comment') return 'border-blue-500 bg-blue-500/15 text-blue-300'
  if (type === 'document') return 'border-violet-500 bg-violet-500/15 text-violet-300'
  return 'border-primary-500 bg-primary-500/15 text-primary-300'
}
</script>

<template>
  <AppModal :show="show" title="Leave request details" size="lg" @close="$emit('close')">
    <div v-if="row" class="space-y-5 text-sm text-gray-300">
      <div class="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950/50 p-4">
        <div><p class="text-xs uppercase tracking-wider text-gray-500">Employee</p><p class="mt-1 text-base font-semibold text-gray-100">{{ row.employee_name }}</p><p v-if="availability?.department" class="mt-1 text-xs text-gray-400">{{ availability.department }}</p></div>
        <StatusBadge :status="row.status" />
      </div>

      <div class="flex gap-1 rounded-lg bg-gray-950 p-1" role="tablist" aria-label="Leave details sections">
        <button v-for="tab in [{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'History' }]" :key="tab.id" type="button" class="flex-1 rounded-md px-3 py-2 text-sm font-semibold transition" :class="activeTab === tab.id ? 'bg-gray-800 text-primary-200' : 'text-gray-400 hover:text-gray-200'" @click="activeTab = tab.id">{{ tab.label }}</button>
      </div>

      <div v-if="activeTab === 'overview'" class="space-y-5">
        <dl class="grid gap-4 sm:grid-cols-2">
          <div><dt class="text-xs text-gray-500">Leave type</dt><dd class="mt-1"><StatusBadge :status="row.leave_type_name" :variant="getLeaveTypePresentation(row.leave_type_name).variant">{{ getLeaveTypePresentation(row.leave_type_name).label }}</StatusBadge></dd></div>
          <div><dt class="text-xs text-gray-500">Dates</dt><dd class="mt-1 text-gray-100">{{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }}</dd></div>
          <div><dt class="text-xs text-gray-500">Pay treatment</dt><dd class="mt-1 uppercase text-gray-100">{{ row.leave_pay_type || 'unpaid' }}</dd></div>
          <div><dt class="text-xs text-gray-500">Status</dt><dd class="mt-1 font-semibold capitalize" :class="statusClass">{{ row.status }}</dd></div>
        </dl>

        <div class="rounded-xl border border-gray-800 p-4"><p class="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">Employee reason</p><p class="whitespace-pre-wrap text-gray-200">{{ row.reason || '-' }}</p></div>
        <div v-if="row.status === 'rejected'" class="rounded-xl border border-red-900/50 bg-red-950/20 p-4"><p class="mb-1 text-xs font-semibold uppercase tracking-wider text-red-400">Rejection reason</p><p class="whitespace-pre-wrap text-red-300">{{ row.rejection_comment || '-' }}</p></div>

        <div v-if="management" class="rounded-xl border p-4" :class="availability?.has_warning ? 'border-amber-600/50 bg-amber-950/20' : 'border-gray-800 bg-gray-950/30'">
          <div class="flex items-start gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" :class="availability?.has_warning ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'">{{ availability?.has_warning ? '!' : '✓' }}</span>
            <div class="min-w-0 flex-1">
              <p class="font-semibold" :class="availability?.has_warning ? 'text-amber-200' : 'text-gray-200'">Department availability</p>
              <p v-if="availabilityLoading" class="mt-1 text-xs text-gray-400">Checking overlapping leave…</p>
              <template v-else-if="availability">
                <p class="mt-1 text-xs leading-5 text-gray-400">{{ availability.unavailable_count }} other employee(s) overlap this request. {{ availability.remaining_available }} of {{ availability.department_headcount }} department members would remain available.</p>
                <div v-if="availability.conflicts?.length" class="mt-3 space-y-2"><div v-for="conflict in availability.conflicts" :key="conflict.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-950/60 px-3 py-2 text-xs"><span class="font-medium text-gray-200">{{ conflict.employee_name }}</span><span class="text-gray-500">{{ formatDate(conflict.start_date) }} – {{ formatDate(conflict.end_date) }}</span></div></div>
              </template>
              <p v-else class="mt-1 text-xs text-gray-500">Availability information is unavailable.</p>
            </div>
          </div>
        </div>

        <LeaveAttachmentReviewCard
          v-if="requiresAttachmentReview(row)"
          :row="row"
          :management="management"
          :uploading="attachmentUploading"
          :review-loading="documentReviewing"
          @view="$emit('view-attachment', $event)"
          @mark-valid="$emit('mark-document-valid', $event)"
          @request-replacement="$emit('request-document-replacement', $event)"
          @upload="$emit('upload-document-replacement', $event)"
        />
        <AppButton v-else-if="row.attachment_data" size="sm" variant="secondary" @click="$emit('view-attachment', row)">View attachment</AppButton>
      </div>

      <div v-else class="space-y-4">
        <div v-if="timelineLoading || commentsLoading" class="space-y-3" role="status" aria-label="Loading history"><div v-for="item in 3" :key="item" class="h-16 animate-pulse rounded-xl bg-gray-800" /></div>
        <EmptyState v-else-if="!fallbackTimeline.length" compact title="No history yet" description="Request updates will appear here." />
        <ol v-else class="relative ml-3 border-l border-gray-700 pl-6">
          <li v-for="event in fallbackTimeline" :key="event.id" class="relative pb-6 last:pb-0">
            <span class="absolute -left-[1.92rem] top-0.5 h-3.5 w-3.5 rounded-full border-2" :class="eventTone(event.type)" />
            <div class="flex flex-wrap items-start justify-between gap-2"><p class="font-semibold text-gray-100">{{ event.title }}</p><time class="text-xs text-gray-500">{{ formatDate(event.created_at, true) }}</time></div>
            <p class="mt-0.5 text-xs text-gray-400">{{ event.actor }}<span v-if="event.actor_role"> · {{ event.actor_role }}</span></p>
            <p v-if="event.message" class="mt-2 whitespace-pre-wrap rounded-lg bg-gray-950/60 p-3 text-sm text-gray-300">{{ event.message }}</p>
          </li>
        </ol>
      </div>
    </div>

    <template #footer>
      <AppButton variant="secondary" @click="$emit('close')">Close</AppButton>
      <AppButton variant="secondary" @click="$emit('add-note')">Add note</AppButton>
      <template v-if="management && row?.status === 'pending'">
        <AppButton variant="success" @click="$emit('approve', row)">Approve</AppButton>
        <AppButton variant="danger" @click="$emit('reject', row)">Reject</AppButton>
      </template>
    </template>
  </AppModal>
</template>
