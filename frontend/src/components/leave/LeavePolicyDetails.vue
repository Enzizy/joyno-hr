<script setup>
defineProps({
  entitlements: { type: Array, default: () => [] },
})
</script>

<template>
  <details class="group surface-card overflow-hidden">
    <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-gray-200">
      <span>
        <span class="block">View all leave policies and conditions</span>
        <span class="mt-1 block text-xs font-normal text-gray-500">Eligibility, notice periods, documents, and special rules</span>
      </span>
      <svg class="h-4 w-4 text-gray-500 transition group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m6 9 6 6 6-6" /></svg>
    </summary>
    <div class="border-t border-gray-800 p-4">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article v-for="item in entitlements" :key="item.id" class="rounded-lg border border-gray-800 bg-gray-950/55 p-3">
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-sm font-semibold text-gray-100">{{ item.name }}</h3>
            <span class="text-xs font-medium" :class="item.total > 0 ? 'text-emerald-300' : 'text-gray-400'">{{ item.total > 0 ? `${item.total} paid days` : 'Unpaid' }}</span>
          </div>
          <dl class="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><dt class="text-gray-500">Eligibility</dt><dd class="mt-0.5 text-gray-300">After {{ item.minMonths }} months</dd></div>
            <div><dt class="text-gray-500">Filing notice</dt><dd class="mt-0.5 text-gray-300">{{ item.noticeDays > 0 ? `${item.noticeDays} days` : 'None' }}</dd></div>
            <div class="col-span-2"><dt class="text-gray-500">Documents</dt><dd class="mt-0.5 text-gray-300">{{ item.requiresAttachment ? 'Required for paid treatment' : 'Not required by policy' }}</dd></div>
          </dl>
          <p v-if="item.remarks" class="mt-3 text-xs leading-5 text-gray-500">{{ item.remarks }}</p>
        </article>
      </div>
      <ul class="mt-4 grid gap-2 rounded-lg border border-gray-800 bg-gray-950/55 p-4 text-xs leading-5 text-gray-500 md:grid-cols-2">
        <li>• Paid credits reset annually based on service tenure.</li>
        <li>• Leave of Absence and Emergency Leave are unpaid by default.</li>
        <li>• Probationary employees are exempt from advance-notice restrictions.</li>
        <li>• AWOL is assigned by Admin or HR and cannot be requested.</li>
      </ul>
    </div>
  </details>
</template>
