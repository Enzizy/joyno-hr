<script setup>
defineProps({ modelValue: { type: String, default: 'day' }, disabled: Boolean })
defineEmits(['update:modelValue'])
</script>

<template>
  <div class="inline-flex gap-1 rounded-xl border border-gray-800 bg-gray-900 p-1" role="group" aria-label="Payroll shift">
    <button v-for="shift in ['day','night']" :key="shift" type="button" :disabled="disabled" :aria-pressed="modelValue===shift"
      class="rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
      :class="modelValue===shift ? 'bg-primary-500 text-gray-950 shadow-sm' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'"
      @click="$emit('update:modelValue',shift)">{{shift==='day'?'Day shift':'Night shift'}}</button>
  </div>
</template>
