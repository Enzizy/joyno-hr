<script setup>
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'

defineProps({
  approveModal: Boolean,
  approving: Boolean,
  row: { type: Object, default: null },
  documentStatus: { type: String, default: 'not_required' },
  blockedForReview: Boolean,
  requiresUnpaidConfirmation: Boolean,
  unpaidConfirmed: Boolean,
  replacementModal: Boolean,
  replacementReason: { type: String, default: '' },
  replacementDays: { type: Number, default: 2 },
  reviewingDocument: Boolean,
})

defineEmits([
  'close-approve',
  'approve',
  'view-document',
  'mark-document-valid',
  'update:unpaidConfirmed',
  'close-replacement',
  'update:replacementReason',
  'update:replacementDays',
  'request-replacement',
])

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}
</script>

<template>
  <AppModal :show="approveModal" title="Approve leave request" @close="$emit('close-approve')">
    <div v-if="row" class="space-y-3 text-sm text-gray-300">
      <p>Approve <strong class="text-gray-100">{{ row.employee_name }}</strong>'s leave for <strong class="text-gray-100">{{ formatDate(row.start_date) }} – {{ formatDate(row.end_date) }}</strong>?</p>
      <p v-if="documentStatus === 'valid'" class="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 text-xs text-emerald-300">
        The supporting document is valid. Paid leave rules and credit deductions will be applied.
      </p>
      <div v-else-if="documentStatus === 'pending_review'" class="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-200">
        Review the supporting document before approving this leave.
      </div>
      <div v-else-if="documentStatus === 'replacement_required'" class="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-200">
        The employee still has an active document replacement request. Approval is unavailable until they respond or the deadline expires.
      </div>
      <label v-else-if="requiresUnpaidConfirmation" class="flex items-start gap-3 rounded-lg border border-red-900/50 bg-red-950/20 p-3">
        <input :checked="unpaidConfirmed" type="checkbox" class="mt-0.5 h-4 w-4 accent-red-500" @change="$emit('update:unpaidConfirmed', $event.target.checked)" />
        <span class="text-sm text-red-200">I understand this absence will be approved as unpaid leave and no credits will be deducted.</span>
      </label>
    </div>
    <template #footer>
      <AppButton variant="secondary" @click="$emit('close-approve')">Cancel</AppButton>
      <AppButton v-if="documentStatus === 'pending_review' && row?.attachment_data" variant="secondary" @click="$emit('view-document', row)">View document</AppButton>
      <AppButton
        v-if="documentStatus === 'pending_review' && row?.attachment_data"
        variant="success"
        :loading="reviewingDocument"
        @click="$emit('mark-document-valid', row)"
      >
        Confirm document valid
      </AppButton>
      <AppButton v-if="!blockedForReview" variant="success" :loading="approving" :disabled="requiresUnpaidConfirmation && !unpaidConfirmed" @click="$emit('approve')">
        {{ requiresUnpaidConfirmation ? 'Approve as unpaid' : 'Approve leave' }}
      </AppButton>
    </template>
  </AppModal>

  <AppModal :show="replacementModal" title="Request replacement document" @close="$emit('close-replacement')">
    <div class="space-y-4">
      <label class="block text-sm font-medium text-gray-200">
        Reason <span class="text-red-500">*</span>
        <textarea :value="replacementReason" rows="3" maxlength="1000" class="form-control mt-1.5 resize-y" placeholder="Explain what is invalid or missing" @input="$emit('update:replacementReason', $event.target.value)" />
      </label>
      <label class="block text-sm font-medium text-gray-200">
        Response time
        <select :value="replacementDays" class="form-control mt-1.5" @change="$emit('update:replacementDays', Number($event.target.value))">
          <option :value="1">1 business day</option>
          <option :value="2">2 business days</option>
        </select>
      </label>
    </div>
    <template #footer>
      <AppButton variant="secondary" @click="$emit('close-replacement')">Cancel</AppButton>
      <AppButton :loading="reviewingDocument" :disabled="!replacementReason.trim()" @click="$emit('request-replacement')">Send request</AppButton>
    </template>
  </AppModal>
</template>
