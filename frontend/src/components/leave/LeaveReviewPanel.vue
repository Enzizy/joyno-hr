<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getAttachmentReviewPresentation } from '@/utils/leaveAttachmentPresentation'

const props = defineProps({
  row: { type: Object, default: null },
  comments: { type: Array, default: () => [] },
  timeline: { type: Array, default: () => [] },
  availability: { type: Object, default: null },
  detailLoading: Boolean,
  actionLoading: { type: String, default: '' },
})

const emit = defineEmits([
  'close',
  'view-document',
  'mark-document-valid',
  'request-replacement',
  'approve',
  'reject',
  'add-note',
  'delete',
])

const activeComposer = ref('')
const noteMessage = ref('')
const rejectionReason = ref('')
const replacementReason = ref('')
const replacementDays = ref(2)
const approveAsUnpaid = ref(false)

const documentStatus = computed(() => props.row?.attachment_review_status || 'not_required')
const documentPresentation = computed(() => getAttachmentReviewPresentation(documentStatus.value))
const approvalBlocked = computed(() =>
  ['pending_review', 'replacement_required'].includes(documentStatus.value)
)
const requiresUnpaidConfirmation = computed(() =>
  ['missing', 'deadline_missed'].includes(documentStatus.value)
)
const approveDisabled = computed(() =>
  approvalBlocked.value
  || (requiresUnpaidConfirmation.value && !approveAsUnpaid.value)
)
const documentRequired = computed(() => documentStatus.value !== 'not_required')
const attachmentIsImage = computed(() =>
  String(props.row?.attachment_type || '').startsWith('image/')
)
const attachmentIsPdf = computed(() => {
  const type = String(props.row?.attachment_type || '').toLowerCase()
  const name = String(props.row?.attachment_name || '').toLowerCase()
  return type === 'application/pdf' || name.endsWith('.pdf')
})
const attachmentPreviewUrl = computed(() => {
  if (!props.row?.attachment_data) return ''
  if (attachmentIsPdf.value) {
    return `${props.row.attachment_data}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`
  }
  return props.row.attachment_data
})

watch(() => props.row?.id, () => {
  activeComposer.value = ''
  noteMessage.value = ''
  rejectionReason.value = ''
  replacementReason.value = ''
  replacementDays.value = 2
  approveAsUnpaid.value = false
})

function closeOnEscape(event) {
  if (event.key === 'Escape' && props.row) emit('close')
}

watch(() => Boolean(props.row), (show) => {
  document.body.classList.toggle('overflow-hidden', show)
  if (show) document.addEventListener('keydown', closeOnEscape)
  else document.removeEventListener('keydown', closeOnEscape)
})

onBeforeUnmount(() => {
  document.body.classList.remove('overflow-hidden')
  document.removeEventListener('keydown', closeOnEscape)
})

function initials(name) {
  return String(name || 'Employee')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatDate(value, includeTime = false) {
  if (!value) return '-'
  const raw = includeTime ? value : `${String(value).slice(0, 10)}T00:00:00`
  return new Date(raw).toLocaleString(undefined, includeTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRange(row) {
  const start = formatDate(row.start_date)
  const end = formatDate(row.end_date)
  return start === end ? start : `${start} – ${end}`
}

function estimatedPay(row) {
  const value = String(row?.leave_pay_type || 'unpaid').replaceAll('_', ' ')
  return `${row?.status === 'pending' ? 'Estimated ' : ''}${value}`
}

function durationLabel(row) {
  const days = Number(row?.leave_days || 1)
  return `${days} working ${days === 1 ? 'day' : 'days'}`
}

function reviewLabel(row) {
  if (row.status === 'approved') return 'Approved leave'
  if (row.status === 'rejected') return 'Rejected leave'
  if (documentStatus.value === 'not_required' || documentStatus.value === 'valid') return 'Ready for decision'
  return 'Document review'
}

function availabilityText() {
  if (!props.availability) return 'Department availability is unavailable.'
  if (!props.availability.unavailable_count) return 'No overlapping leave in this department.'
  return `${props.availability.unavailable_count} overlapping leave request(s); ${props.availability.remaining_available} team member(s) remain available.`
}

function submitNote() {
  if (!noteMessage.value.trim()) return
  emit('add-note', noteMessage.value.trim())
  noteMessage.value = ''
  activeComposer.value = ''
}

function submitReject() {
  if (!rejectionReason.value.trim()) return
  emit('reject', rejectionReason.value.trim())
  rejectionReason.value = ''
  activeComposer.value = ''
}

function submitReplacement() {
  if (!replacementReason.value.trim()) return
  emit('request-replacement', {
    note: replacementReason.value.trim(),
    responseDays: replacementDays.value,
  })
  replacementReason.value = ''
  activeComposer.value = ''
}
</script>

<template>
  <Teleport to="body">
    <div v-if="row" class="fixed inset-0 z-50">
      <button
        type="button"
        class="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        aria-label="Close leave review"
        @click="emit('close')"
      />
      <aside
        class="absolute inset-y-0 right-0 flex h-full w-full max-w-md flex-col border-l border-gray-800 bg-gray-950 shadow-2xl shadow-black/80"
        role="dialog"
        aria-modal="true"
        :aria-label="`Review ${row.employee_name}'s leave request`"
      >
      <header class="flex shrink-0 items-center justify-between gap-4 border-b border-gray-800 px-5 py-4">
        <h2 class="text-base font-semibold text-gray-100">Review leave request</h2>
        <button class="icon-button h-8 w-8 text-lg" aria-label="Close review panel" @click="emit('close')">×</button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <div v-if="detailLoading" class="space-y-4 p-5">
          <div v-for="item in 5" :key="item" class="h-24 animate-pulse rounded-xl bg-gray-900" />
        </div>
        <div v-else class="space-y-3 p-5">
          <section class="flex items-center gap-3">
            <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary-700/40 bg-primary-500/10 text-sm font-bold text-primary-200">
              {{ initials(row.employee_name) }}
            </span>
            <div class="min-w-0">
              <p class="truncate font-semibold text-gray-100">{{ row.employee_name }}</p>
              <p class="mt-0.5 text-xs font-medium text-violet-300">{{ reviewLabel(row) }}</p>
            </div>
          </section>

          <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-800 bg-gray-800 sm:grid-cols-4">
            <div class="bg-gray-900 p-3">
              <dt class="text-[10px] uppercase tracking-wider text-gray-600">Leave type</dt>
              <dd class="mt-1.5 text-xs font-semibold text-gray-200">{{ row.leave_type_name }}</dd>
            </div>
            <div class="bg-gray-900 p-3">
              <dt class="text-[10px] uppercase tracking-wider text-gray-600">Date</dt>
              <dd class="mt-1.5 text-xs font-semibold text-gray-200">{{ formatRange(row) }}</dd>
            </div>
            <div class="bg-gray-900 p-3">
              <dt class="text-[10px] uppercase tracking-wider text-gray-600">Duration</dt>
              <dd class="mt-1.5 text-xs font-semibold text-gray-200">{{ durationLabel(row) }}</dd>
            </div>
            <div class="bg-gray-900 p-3">
              <dt class="text-[10px] uppercase tracking-wider text-gray-600">Pay treatment</dt>
              <dd class="mt-1.5 text-xs font-semibold capitalize text-gray-200">{{ estimatedPay(row) }}</dd>
            </div>
          </dl>

          <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Employee reason</p>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">{{ row.reason || 'No reason provided.' }}</p>
          </section>

          <section v-if="row.status === 'rejected'" class="rounded-xl border border-red-900/40 bg-red-950/15 p-4">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-red-400">Rejection reason</p>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-200">{{ row.rejection_comment || '-' }}</p>
          </section>

          <section v-if="documentRequired" class="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Supporting document</p>
                <p class="mt-2 truncate text-sm font-semibold text-gray-200">{{ row.attachment_name || 'No document attached' }}</p>
              </div>
              <StatusBadge :status="documentPresentation.label" :variant="documentPresentation.variant">
                {{ documentPresentation.label }}
              </StatusBadge>
            </div>

            <p v-if="row.attachment_review_note" class="mt-3 rounded-lg bg-black/25 p-3 text-xs leading-5 text-gray-400">
              {{ row.attachment_review_note }}
            </p>
            <p v-if="row.attachment_resubmit_due_at" class="mt-2 text-xs font-medium text-amber-300">
              Replacement due {{ formatDate(row.attachment_resubmit_due_at, true) }}
            </p>

            <div class="mt-4 grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
              <button
                v-if="row.attachment_data"
                type="button"
                class="group flex h-28 items-center justify-center overflow-hidden rounded-lg border border-gray-700 bg-gray-950"
                aria-label="Open supporting document"
                @click="emit('view-document', row)"
              >
                <img
                  v-if="attachmentIsImage"
                  :src="attachmentPreviewUrl"
                  :alt="row.attachment_name"
                  class="h-full w-full bg-white object-contain transition group-hover:scale-[1.02]"
                />
                <embed
                  v-else-if="attachmentIsPdf"
                  :src="attachmentPreviewUrl"
                  type="application/pdf"
                  class="pointer-events-none h-full w-full bg-white"
                />
                <span v-else class="flex flex-col items-center gap-2 text-gray-500">
                  <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />
                  </svg>
                  <span class="text-[10px] uppercase tracking-wider">Document</span>
                </span>
              </button>
              <div v-else class="flex h-28 items-center justify-center rounded-lg border border-dashed border-red-900/60 bg-red-950/10 text-xs font-medium text-red-300">
                No document
              </div>

              <div class="divide-y divide-gray-800">
                <button
                  v-if="row.attachment_data"
                  type="button"
                  class="flex w-full items-center gap-3 py-3 text-left text-sm font-medium text-primary-300 transition hover:text-primary-200"
                  @click="emit('view-document', row)"
                >
                  <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
                    <circle cx="12" cy="12" r="2.5" stroke-width="1.7" />
                  </svg>
                  Open document
                </button>
                <button
                  v-if="row.status === 'pending' && documentStatus === 'pending_review'"
                  type="button"
                  class="flex w-full items-center gap-3 py-3 text-left text-sm font-medium text-emerald-400 transition hover:text-emerald-300 disabled:opacity-50"
                  :disabled="actionLoading === 'document'"
                  @click="emit('mark-document-valid')"
                >
                  <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" stroke-width="1.7" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="m8 12 2.5 2.5L16 9" />
                  </svg>
                  {{ actionLoading === 'document' ? 'Confirming…' : 'Confirm valid' }}
                </button>
                <button
                  v-if="row.status === 'pending' && ['pending_review', 'missing', 'deadline_missed'].includes(documentStatus)"
                  type="button"
                  class="flex w-full items-center gap-3 py-3 text-left text-sm font-medium text-red-400 transition hover:text-red-300"
                  @click="activeComposer = activeComposer === 'replacement' ? '' : 'replacement'"
                >
                  <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M20 7v5h-5M4 17v-5h5M6.3 8A7 7 0 0 1 18 6l2 1M18 16a7 7 0 0 1-11.7 2L4 17" />
                  </svg>
                  Request replacement
                </button>
              </div>
            </div>

            <div v-if="activeComposer === 'replacement'" class="mt-4 space-y-3 border-t border-gray-800 pt-4">
              <textarea v-model="replacementReason" rows="3" maxlength="1000" class="form-control resize-y" placeholder="Explain what needs to be replaced" />
              <div class="flex flex-wrap items-center justify-between gap-2">
                <select v-model.number="replacementDays" class="form-control w-auto">
                  <option :value="1">1 business day</option>
                  <option :value="2">2 business days</option>
                </select>
                <div class="flex gap-2">
                  <AppButton variant="ghost" size="sm" @click="activeComposer = ''">Cancel</AppButton>
                  <AppButton size="sm" :loading="actionLoading === 'replacement'" :disabled="!replacementReason.trim()" @click="submitReplacement">Send request</AppButton>
                </div>
              </div>
            </div>
          </section>

          <section class="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
            <svg class="mt-0.5 h-5 w-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" />
            </svg>
            <div>
              <p class="text-sm font-semibold text-gray-200">Department availability</p>
              <p class="mt-1 text-xs leading-5" :class="availability?.has_warning ? 'text-amber-300' : 'text-gray-500'">{{ availabilityText() }}</p>
            </div>
          </section>

          <details class="rounded-xl border border-gray-800 bg-gray-900">
            <summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300">
              <span class="flex items-center gap-3">
                <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" stroke-width="1.6" />
                  <path stroke-linecap="round" stroke-width="1.6" d="M12 7v5l3 2" />
                </svg>
                <span>Activity <span class="ml-1 text-xs font-normal text-gray-600">{{ timeline.length }} updates</span></span>
              </span>
              <span class="text-gray-600">›</span>
            </summary>
            <ol class="space-y-3 border-t border-gray-800 p-4">
              <li v-for="event in timeline" :key="event.id" class="border-l border-gray-700 pl-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <p class="text-xs font-semibold text-gray-300">{{ event.title }}</p>
                  <time class="text-[10px] text-gray-600">{{ formatDate(event.created_at, true) }}</time>
                </div>
                <p v-if="event.message" class="mt-1 line-clamp-2 text-xs text-gray-500">{{ event.message }}</p>
              </li>
              <li v-if="!timeline.length" class="text-xs text-gray-600">No activity recorded yet.</li>
            </ol>
          </details>

          <div v-if="activeComposer === 'note'" class="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <textarea v-model="noteMessage" rows="3" maxlength="2000" class="form-control resize-y" placeholder="Write a note for the employee" />
            <div class="mt-3 flex justify-end gap-2">
              <AppButton variant="ghost" size="sm" @click="activeComposer = ''">Cancel</AppButton>
              <AppButton size="sm" :loading="actionLoading === 'note'" :disabled="!noteMessage.trim()" @click="submitNote">Send note</AppButton>
            </div>
          </div>

          <div v-if="activeComposer === 'reject'" class="rounded-xl border border-red-900/40 bg-red-950/10 p-4">
            <textarea v-model="rejectionReason" rows="3" maxlength="2000" class="form-control resize-y" placeholder="Reason for rejection" />
            <div class="mt-3 flex justify-end gap-2">
              <AppButton variant="ghost" size="sm" @click="activeComposer = ''">Cancel</AppButton>
              <AppButton variant="danger" size="sm" :loading="actionLoading === 'reject'" :disabled="!rejectionReason.trim()" @click="submitReject">Reject request</AppButton>
            </div>
          </div>

          <label v-if="row.status === 'pending' && requiresUnpaidConfirmation" class="flex items-start gap-3 rounded-xl border border-red-900/40 bg-red-950/10 p-4">
            <input v-model="approveAsUnpaid" type="checkbox" class="mt-0.5 h-4 w-4 accent-red-500" />
            <span class="text-xs leading-5 text-red-200">Approve this request as unpaid leave without deducting credits.</span>
          </label>

          <p v-if="row.status === 'pending' && approvalBlocked" class="flex items-center gap-2 rounded-xl border border-amber-800/40 bg-amber-950/15 p-3 text-xs text-amber-300">
            <span class="flex h-4 w-4 items-center justify-center rounded-full border border-amber-500 text-[10px]">!</span>
            {{ documentStatus === 'replacement_required' ? 'Waiting for the employee’s replacement document.' : 'Confirm the supporting document before approval.' }}
          </p>
        </div>
      </div>

      <footer class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-800 bg-gray-950 px-5 py-4">
        <template v-if="row.status === 'pending'">
          <AppButton class="sm:min-w-24" variant="danger" @click="activeComposer = activeComposer === 'reject' ? '' : 'reject'">Reject</AppButton>
          <AppButton class="sm:min-w-24" variant="secondary" @click="activeComposer = activeComposer === 'note' ? '' : 'note'">Add note</AppButton>
          <AppButton
            class="min-w-36 flex-1"
            :variant="approveDisabled ? 'secondary' : 'success'"
            :loading="actionLoading === 'approve'"
            :disabled="approveDisabled"
            @click="$emit('approve', { approveAsUnpaid })"
          >
            {{ requiresUnpaidConfirmation ? 'Approve as unpaid' : 'Approve leave' }}
            <svg v-if="approveDisabled" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="5" y="10" width="14" height="11" rx="2" stroke-width="1.7" />
              <path stroke-linecap="round" stroke-width="1.7" d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </AppButton>
        </template>
        <template v-else>
          <AppButton variant="danger" :loading="actionLoading === 'delete'" @click="$emit('delete')">Delete record</AppButton>
          <AppButton variant="secondary" @click="activeComposer = activeComposer === 'note' ? '' : 'note'">Add note</AppButton>
        </template>
      </footer>
      </aside>
    </div>
  </Teleport>
</template>
