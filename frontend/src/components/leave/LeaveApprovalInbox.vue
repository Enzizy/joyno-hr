<script setup>
import { computed, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getAttachmentReviewPresentation } from '@/utils/leaveAttachmentPresentation'

const props = defineProps({ rows: { type: Array, default: () => [] }, loading: Boolean, bulkLoading: Boolean })
const emit = defineEmits(['approve', 'reject', 'details', 'bulk-approve'])
const selectedIds = ref([])

const lowRiskRows = computed(() => props.rows.filter((row) => row.low_risk))
const allLowRiskSelected = computed(() => lowRiskRows.value.length > 0 && lowRiskRows.value.every((row) => selectedIds.value.includes(row.id)))
const urgentCount = computed(() => props.rows.filter((row) => row.urgency !== 'normal').length)

watch(() => props.rows, (rows) => {
  const valid = new Set(rows.filter((row) => row.low_risk).map((row) => row.id))
  selectedIds.value = selectedIds.value.filter((id) => valid.has(id))
})

function toggleLowRisk() {
  selectedIds.value = allLowRiskSelected.value ? [] : lowRiskRows.value.map((row) => row.id)
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function waitingLabel(hours) {
  const amount = Number(hours || 0)
  if (amount < 24) return `${Math.max(1, amount)}h waiting`
  return `${Math.floor(amount / 24)}d waiting`
}

function startLabel(days) {
  const amount = Number(days)
  if (amount < 0) return `${Math.abs(amount)}d overdue`
  if (amount === 0) return 'Starts today'
  return `Starts in ${amount}d`
}

function urgencyClass(urgency) {
  if (urgency === 'critical') return 'border-red-500/30 bg-red-950/20 text-red-300'
  if (urgency === 'high') return 'border-amber-500/30 bg-amber-950/20 text-amber-300'
  return 'border-gray-700 bg-gray-800 text-gray-400'
}
</script>

<template>
  <section class="surface-card overflow-hidden">
    <div class="flex flex-col gap-4 border-b border-gray-800 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div><div class="flex items-center gap-2"><h2 class="text-base font-semibold text-gray-100">Approval inbox</h2><span v-if="rows.length" class="rounded-full bg-primary-500/15 px-2 py-0.5 text-xs font-semibold text-primary-300">{{ rows.length }}</span></div><p class="mt-1 text-sm text-gray-500">Prioritized by filing age and leave start date. {{ urgentCount }} need attention.</p></div>
      <div v-if="lowRiskRows.length" class="flex flex-wrap items-center gap-2">
        <label class="inline-flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" :checked="allLowRiskSelected" @change="toggleLowRisk" /> Select all low-risk ({{ lowRiskRows.length }})</label>
        <AppButton size="sm" :disabled="!selectedIds.length" :loading="bulkLoading" @click="emit('bulk-approve', [...selectedIds])">Approve selected</AppButton>
      </div>
    </div>

    <div v-if="loading" class="grid gap-3 p-5 lg:grid-cols-2"><div v-for="item in 4" :key="item" class="h-48 animate-pulse rounded-xl bg-gray-800" /></div>
    <EmptyState v-else-if="!rows.length" title="Approval inbox is clear" description="New leave requests will appear here in priority order." />
    <div v-else class="grid gap-3 p-4 lg:grid-cols-2">
      <article v-for="row in rows" :key="row.id" class="rounded-xl border border-gray-800 bg-gray-950/40 p-4 transition hover:border-gray-700">
        <div class="flex items-start gap-3">
          <input v-if="row.low_risk" v-model="selectedIds" type="checkbox" :value="row.id" class="mt-1 rounded border-gray-700" :aria-label="`Select ${row.employee_name}`" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2"><h3 class="font-semibold text-gray-100">{{ row.employee_name }}</h3><span class="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" :class="urgencyClass(row.urgency)">{{ row.urgency }}</span><span v-if="row.low_risk" class="rounded-full bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Low risk</span><StatusBadge v-if="row.attachment_review_status && row.attachment_review_status !== 'not_required'" :status="getAttachmentReviewPresentation(row.attachment_review_status).label" :variant="getAttachmentReviewPresentation(row.attachment_review_status).variant">{{ getAttachmentReviewPresentation(row.attachment_review_status).label }}</StatusBadge></div>
            <p class="mt-1 text-sm text-gray-400">{{ row.leave_type_name }} · {{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }}</p>
          </div>
        </div>

        <dl class="mt-4 grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-gray-900 p-2.5"><dt class="text-[10px] uppercase tracking-wide text-gray-600">Filed</dt><dd class="mt-1 text-xs font-medium text-gray-300">{{ waitingLabel(row.filing_age_hours) }}</dd></div>
          <div class="rounded-lg bg-gray-900 p-2.5"><dt class="text-[10px] uppercase tracking-wide text-gray-600">Schedule</dt><dd class="mt-1 text-xs font-medium" :class="Number(row.days_until_start) <= 0 ? 'text-red-300' : 'text-gray-300'">{{ startLabel(row.days_until_start) }}</dd></div>
        </dl>

        <p class="mt-3 line-clamp-2 text-sm leading-6 text-gray-400">{{ row.reason || 'No reason provided.' }}</p>
        <div class="mt-4 flex flex-wrap justify-end gap-2"><AppButton size="sm" variant="ghost" @click="emit('details', row)">Review details</AppButton><AppButton size="sm" variant="danger" @click="emit('reject', row)">Reject</AppButton><AppButton size="sm" variant="success" @click="emit('approve', row)">Approve</AppButton></div>
      </article>
    </div>
  </section>
</template>
