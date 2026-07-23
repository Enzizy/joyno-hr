<script setup>
import { computed } from 'vue'

const props = defineProps({
  entitlements: { type: Array, default: () => [] },
  leaveCredits: { type: Number, default: 0 },
})

const paidEntitlements = computed(() => props.entitlements.filter((item) => Number(item.total) > 0))
const policyYear = computed(() => props.entitlements[0]?.year || new Date().getFullYear())

const tones = [
  { icon: '☂', color: 'text-emerald-300', bar: 'bg-emerald-500', tint: 'bg-emerald-500/10' },
  { icon: '✚', color: 'text-blue-300', bar: 'bg-blue-500', tint: 'bg-blue-500/10' },
  { icon: '♡', color: 'text-purple-300', bar: 'bg-purple-500', tint: 'bg-purple-500/10' },
  { icon: '☆', color: 'text-amber-300', bar: 'bg-amber-500', tint: 'bg-amber-500/10' },
]

function toneFor(index) {
  return tones[index % tones.length]
}
</script>

<template>
  <section aria-labelledby="leave-balance-heading">
    <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id="leave-balance-heading" class="text-sm font-semibold text-gray-100">Your leave balances</h2>
        <p class="mt-0.5 text-xs text-gray-500">Paid leave remaining for {{ policyYear }}.</p>
      </div>
      <p class="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-400">
        Available credit pool: <strong class="text-primary-200">{{ leaveCredits.toFixed(2) }}</strong>
      </p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="(item, index) in paidEntitlements" :key="item.id" class="surface-card p-4">
        <div class="flex items-start gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg" :class="[toneFor(index).tint, toneFor(index).color]">{{ toneFor(index).icon }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p class="truncate text-xs font-medium text-gray-400" :title="item.name">{{ item.name }}</p>
              <span v-if="!item.eligible" class="shrink-0 rounded-full bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-300">Not eligible</span>
            </div>
            <p class="mt-1 text-xl font-semibold" :class="item.eligible ? 'text-gray-100' : 'text-gray-300'">
              {{ item.eligible ? item.remaining : item.total }}
              <span class="text-xs font-normal text-gray-500">{{ item.eligible ? 'days remaining' : 'day allowance' }}</span>
            </p>
            <p class="mt-1 text-xs text-gray-500">{{ item.eligible ? `${Math.max(0, Number(item.total) - Number(item.remaining))} used of ${item.total}` : `Available after ${item.minMonths} months` }}</p>
          </div>
        </div>
        <div class="mt-3 h-1 overflow-hidden rounded-full bg-gray-800">
          <div class="h-full rounded-full" :class="item.eligible ? toneFor(index).bar : 'bg-gray-700'" :style="{ width: `${item.eligible && item.total ? Math.min(100, (item.remaining / item.total) * 100) : 100}%` }" />
        </div>
      </article>
    </div>
  </section>
</template>
