<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import { getPayrollPayslipPdf } from '@/services/api'

// Shows the payslip exactly as it is printed and emailed: the real PDF.
const props = defineProps({
  line: { type: Object, required: true },
  run: { type: Object, required: true },
  managed: { type: Boolean, default: false }, // HR viewing any run; otherwise the employee's own payslip
  canEmail: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
defineEmits(['close', 'print', 'download', 'send', 'edit'])

const pdfUrl = ref('')
const error = ref('')
onMounted(async () => {
  try {
    // HR sees the signing sheet (two copies per page); employees see their own single copy.
    pdfUrl.value = URL.createObjectURL(await getPayrollPayslipPdf(props.managed ? props.run.id : null, props.line.id, { copies: props.managed ? 2 : 1 }))
  } catch (loadError) { error.value = loadError.message || 'Unable to load the payslip.' }
})
onBeforeUnmount(() => { if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value) })
const isTest = props.run.rule_snapshot?.isTest || props.line.is_test
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Payslip" @click.self="$emit('close')">
    <div class="flex h-[calc(100vh-4rem)] w-full flex-col" :class="managed ? 'max-w-4xl' : 'max-w-[560px]'">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
        <div><p class="text-sm font-semibold">{{ line.employee_name || 'Payslip' }}</p><p class="text-xs text-gray-300">{{ isTest ? 'Test payslip — not an actual payment' : run.status === 'draft' ? 'Draft — not for distribution' : `Payday ${String(run.payday || line.payday || '').slice(0, 10)}` }}</p></div>
        <button type="button" class="rounded-md px-3 py-2 text-sm hover:bg-white/10" aria-label="Close payslip" @click="$emit('close')">Close</button>
      </div>
      <div class="flex-1 overflow-hidden rounded-lg border border-gray-700 bg-gray-950">
        <p v-if="error" class="p-6 text-sm text-red-300">{{ error }}</p>
        <iframe v-else-if="pdfUrl" :src="pdfUrl" title="Payslip PDF" class="h-full w-full" />
        <p v-else class="p-6 text-sm text-gray-400" role="status">Loading payslip…</p>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <AppButton size="sm" variant="secondary" :disabled="busy" @click="$emit('print')">{{ managed ? 'Print' : 'Open / print' }}</AppButton>
        <AppButton size="sm" variant="secondary" :disabled="busy" @click="$emit('download')">Save PDF</AppButton>
        <AppButton v-if="canEdit" size="sm" variant="secondary" :disabled="busy" @click="$emit('edit')">Adjust pay</AppButton>
        <AppButton v-if="canEmail" size="sm" :disabled="busy" @click="$emit('send')">Email to employee</AppButton>
      </div>
    </div>
  </div>
</template>
