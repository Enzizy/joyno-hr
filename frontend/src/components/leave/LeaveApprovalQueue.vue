<script setup>
import { computed, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import RequestRow from '@/components/leave/LeaveApprovalRequestRow.vue'
import { getAttachmentReviewPresentation } from '@/utils/leaveAttachmentPresentation'

const props = defineProps({
  activeTab: { type: String, default: 'pending' },
  counts: { type: Object, required: true },
  rows: { type: Array, default: () => [] },
  documentRows: { type: Array, default: () => [] },
  readyRows: { type: Array, default: () => [] },
  loading: Boolean,
  bulkLoading: Boolean,
  selectedId: [String, Number],
  searchQuery: { type: String, default: '' },
  typeFilter: { type: String, default: 'all' },
  departmentFilter: { type: String, default: 'all' },
  scheduleFilter: { type: String, default: 'all' },
  typeOptions: { type: Array, default: () => [] },
  departmentOptions: { type: Array, default: () => [] },
  page: { type: Number, default: 1 },
  pageCount: { type: Number, default: 1 },
  total: { type: Number, default: 0 },
})

const emit = defineEmits([
  'update:activeTab',
  'update:searchQuery',
  'update:typeFilter',
  'update:departmentFilter',
  'update:scheduleFilter',
  'update:page',
  'reset',
  'review',
  'bulk-approve',
])

const selectedIds = ref([])
const lowRiskRows = computed(() => props.readyRows.filter((row) => row.low_risk))
const allLowRiskSelected = computed(() =>
  lowRiskRows.value.length > 0
  && lowRiskRows.value.every((row) => selectedIds.value.includes(row.id))
)

watch(lowRiskRows, (rows) => {
  const validIds = new Set(rows.map((row) => row.id))
  selectedIds.value = selectedIds.value.filter((id) => validIds.has(id))
})

function toggleAllLowRisk() {
  selectedIds.value = allLowRiskSelected.value ? [] : lowRiskRows.value.map((row) => row.id)
}

function submitBulkApproval() {
  if (!selectedIds.value.length) return
  emit('bulk-approve', [...selectedIds.value])
  selectedIds.value = []
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRange(row) {
  const start = formatDate(row.start_date)
  const end = formatDate(row.end_date)
  return start === end ? start : `${start} – ${end}`
}

function durationLabel(row) {
  const days = Number(row.leave_days || 0)
  return `${days || 1} working ${days === 1 ? 'day' : 'days'}`
}

function initials(name) {
  return String(name || 'Employee')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function rowTone(row) {
  if (row.status === 'approved') return 'border-l-emerald-600'
  if (row.status === 'rejected') return 'border-l-red-700'
  if (['missing', 'deadline_missed'].includes(row.attachment_review_status)) return 'border-l-red-700'
  if (['pending_review', 'replacement_required'].includes(row.attachment_review_status)) return 'border-l-violet-600'
  return 'border-l-emerald-600'
}

function rowState(row) {
  if (row.status !== 'pending') return row.status
  if (row.attachment_review_status === 'not_required') return 'Ready for decision'
  return getAttachmentReviewPresentation(row.attachment_review_status).label
}

function rowStateClass(row) {
  if (row.status === 'approved') return 'text-emerald-400'
  if (row.status === 'rejected') return 'text-red-400'
  if (['missing', 'deadline_missed'].includes(row.attachment_review_status)) return 'text-red-400'
  if (['pending_review', 'replacement_required'].includes(row.attachment_review_status)) return 'text-violet-300'
  return 'text-emerald-400'
}

const tabs = [
  { id: 'pending', label: 'Needs review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]
</script>

<template>
  <section class="min-w-0">
    <div class="flex overflow-x-auto border-b border-gray-800">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="flex min-w-36 items-center justify-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition"
        :class="activeTab === tab.id
          ? 'border-primary-500 text-primary-300'
          : 'border-transparent text-gray-500 hover:text-gray-300'"
        @click="emit('update:activeTab', tab.id)"
      >
        {{ tab.label }}
        <span
          class="rounded-full px-2 py-0.5 text-[11px]"
          :class="activeTab === tab.id ? 'bg-primary-500/15 text-primary-300' : 'bg-gray-800 text-gray-500'"
        >
          {{ counts[tab.id] || 0 }}
        </span>
      </button>
    </div>

    <div class="mt-4 grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(130px,0.8fr))_auto]">
      <label class="text-xs text-gray-500">
        Search
        <input
          :value="searchQuery"
          class="form-control mt-1.5"
          placeholder="Search employee"
          @input="emit('update:searchQuery', $event.target.value)"
        />
      </label>
      <label class="text-xs text-gray-500">
        Leave type
        <select :value="typeFilter" class="form-control mt-1.5" @change="emit('update:typeFilter', $event.target.value)">
          <option value="all">All types</option>
          <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
        </select>
      </label>
      <label class="text-xs text-gray-500">
        Department
        <select :value="departmentFilter" class="form-control mt-1.5" @change="emit('update:departmentFilter', $event.target.value)">
          <option value="all">All departments</option>
          <option v-for="department in departmentOptions" :key="department" :value="department">{{ department }}</option>
        </select>
      </label>
      <label class="text-xs text-gray-500">
        Schedule
        <select :value="scheduleFilter" class="form-control mt-1.5" @change="emit('update:scheduleFilter', $event.target.value)">
          <option value="all">All dates</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
          <option value="this_month">This month</option>
        </select>
      </label>
      <AppButton class="self-end" variant="ghost" size="sm" @click="emit('reset')">Reset</AppButton>
    </div>

    <div v-if="loading" class="mt-5 space-y-3">
      <div v-for="item in 5" :key="item" class="h-24 animate-pulse rounded-xl bg-gray-900" />
    </div>
    <EmptyState
      v-else-if="!rows.length"
      class="mt-5 surface-card"
      :title="activeTab === 'pending' ? 'Approval queue is clear' : `No ${activeTab} leave requests`"
      description="Try adjusting the filters or check back later."
    />

    <template v-else-if="activeTab === 'pending'">
      <div v-if="documentRows.length" class="mt-6">
        <div class="mb-3 flex items-center gap-2">
          <h2 class="font-semibold text-gray-100">Needs document review</h2>
          <span class="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-semibold text-violet-300">{{ documentRows.length }}</span>
        </div>
        <div class="space-y-2">
          <RequestRow
            v-for="row in documentRows"
            :key="row.id"
            :row="row"
            :selected="Number(selectedId) === Number(row.id)"
            :tone="rowTone(row)"
            :state="rowState(row)"
            :state-class="rowStateClass(row)"
            :initials="initials(row.employee_name)"
            :date-range="formatRange(row)"
            :duration="durationLabel(row)"
            @review="emit('review', row)"
          />
        </div>
      </div>

      <div v-if="readyRows.length" class="mt-6">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-gray-100">Ready for decision</h2>
            <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">{{ readyRows.length }}</span>
          </div>
          <div v-if="lowRiskRows.length" class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" :checked="allLowRiskSelected" @change="toggleAllLowRisk" />
              Select low-risk
            </label>
            <AppButton size="sm" :disabled="!selectedIds.length" :loading="bulkLoading" @click="submitBulkApproval">
              Approve selected
            </AppButton>
          </div>
        </div>
        <div class="space-y-2">
          <RequestRow
            v-for="row in readyRows"
            :key="row.id"
            :row="row"
            :selected="Number(selectedId) === Number(row.id)"
            :tone="rowTone(row)"
            :state="rowState(row)"
            :state-class="rowStateClass(row)"
            :initials="initials(row.employee_name)"
            :date-range="formatRange(row)"
            :duration="durationLabel(row)"
            :selectable="row.low_risk"
            :checked="selectedIds.includes(row.id)"
            @toggle="selectedIds = $event ? [...selectedIds, row.id] : selectedIds.filter((id) => id !== row.id)"
            @review="emit('review', row)"
          />
        </div>
      </div>
    </template>

    <div v-else class="mt-6 space-y-2">
      <RequestRow
        v-for="row in rows"
        :key="row.id"
        :row="row"
        :selected="Number(selectedId) === Number(row.id)"
        :tone="rowTone(row)"
        :state="rowState(row)"
        :state-class="rowStateClass(row)"
        :initials="initials(row.employee_name)"
        :date-range="formatRange(row)"
        :duration="durationLabel(row)"
        @review="emit('review', row)"
      />
    </div>

    <footer v-if="rows.length" class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 pt-4">
      <p class="text-xs text-gray-600">Showing {{ rows.length }} of {{ total }} requests</p>
      <div class="flex items-center gap-2">
        <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="emit('update:page', page - 1)">Previous</AppButton>
        <span class="text-xs text-gray-500">Page {{ page }} / {{ pageCount }}</span>
        <AppButton variant="secondary" size="sm" :disabled="page >= pageCount" @click="emit('update:page', page + 1)">Next</AppButton>
      </div>
    </footer>
  </section>
</template>
