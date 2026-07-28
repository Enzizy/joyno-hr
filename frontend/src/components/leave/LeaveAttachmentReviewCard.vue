<script setup>
import { computed, ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getAttachmentReviewPresentation } from '@/utils/leaveAttachmentPresentation'

const props = defineProps({
  row: { type: Object, required: true },
  management: Boolean,
  uploading: Boolean,
  reviewLoading: Boolean,
})
const emit = defineEmits(['view', 'mark-valid', 'request-replacement', 'upload'])
const replacementFile = ref(null)

const presentation = computed(() =>
  getAttachmentReviewPresentation(props.row.attachment_review_status)
)
const canReview = computed(() =>
  props.management && props.row.status === 'pending'
)
const canUpload = computed(() =>
  !props.management
  && props.row.status === 'pending'
  && ['missing', 'replacement_required', 'deadline_missed'].includes(props.row.attachment_review_status)
)

function onFileChange(event) {
  replacementFile.value = event.target.files?.[0] || null
}

function upload() {
  if (!replacementFile.value) return
  emit('upload', replacementFile.value)
}

function formatDeadline(value) {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>

<template>
  <section class="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-wider text-gray-500">Supporting document</p>
        <p v-if="row.attachment_name" class="mt-1 max-w-sm truncate text-sm font-medium text-gray-200">
          {{ row.attachment_name }}
        </p>
      </div>
      <StatusBadge :status="presentation.label" :variant="presentation.variant">
        {{ presentation.label }}
      </StatusBadge>
    </div>

    <p v-if="row.attachment_review_note" class="mt-3 whitespace-pre-wrap text-sm leading-5 text-gray-300">
      {{ row.attachment_review_note }}
    </p>
    <p v-if="row.attachment_resubmit_due_at" class="mt-2 text-xs font-medium text-amber-300">
      Due {{ formatDeadline(row.attachment_resubmit_due_at) }}
    </p>

    <div v-if="canUpload" class="mt-4 flex flex-col gap-2 sm:flex-row">
      <input
        type="file"
        accept="image/*,application/pdf"
        class="form-control min-w-0 flex-1 text-sm"
        @change="onFileChange"
      />
      <AppButton
        size="sm"
        :loading="uploading"
        :disabled="!replacementFile"
        @click="upload"
      >
        Upload replacement
      </AppButton>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <AppButton v-if="row.attachment_data" size="sm" variant="secondary" @click="emit('view', row)">
        View document
      </AppButton>
      <template v-if="canReview && row.attachment_review_status === 'pending_review'">
        <AppButton size="sm" variant="success" :loading="reviewLoading" @click="emit('mark-valid', row)">Mark valid</AppButton>
        <AppButton size="sm" variant="danger" :disabled="reviewLoading" @click="emit('request-replacement', row)">Request replacement</AppButton>
      </template>
      <AppButton
        v-else-if="canReview && ['missing', 'deadline_missed'].includes(row.attachment_review_status)"
        size="sm"
        variant="secondary"
        :disabled="reviewLoading"
        @click="emit('request-replacement', row)"
      >
        Request document
      </AppButton>
    </div>
  </section>
</template>
