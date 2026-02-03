<script setup>
import { useToastStore } from '@/stores/toastStore'

const toastStore = useToastStore()
</script>

<template>
  <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
    <TransitionGroup name="toast">
      <div
        v-for="t in toastStore.toasts"
        :key="t.id"
        class="flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg"
        :class="{
          'border-green-200 bg-green-50 text-green-900': t.type === 'success',
          'border-red-200 bg-red-50 text-red-900': t.type === 'error',
          'border-amber-200 bg-amber-50 text-amber-900': t.type === 'warning',
          'border-blue-200 bg-blue-50 text-blue-900': t.type === 'info',
        }"
      >
        <span>{{ t.message }}</span>
        <button
          type="button"
          class="ml-2 rounded p-1 opacity-70 hover:opacity-100"
          @click="toastStore.remove(t.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
