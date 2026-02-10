<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  name: { type: String, default: '' },
  error: { type: String, default: '' },
  disabled: Boolean,
  required: Boolean,
  min: { type: String, default: '' },
  max: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="w-full">
    <label v-if="label" class="mb-1 block text-sm font-medium text-gray-200">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <input
      type="date"
      :name="name"
      :value="modelValue"
      :disabled="disabled"
      :min="min"
      :max="max"
      class="date-input block w-full rounded-lg border bg-gray-900 px-4 py-3 text-base text-gray-100 placeholder:text-gray-500 shadow-sm focus:border-primary-500 focus:ring-primary-500"
      :class="error ? 'border-red-500' : 'border-gray-700'"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <p v-if="error" class="mt-1 text-sm text-red-600">{{ error }}</p>
  </div>
</template>

<style scoped>
.date-input::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 0.9;
  filter: invert(1);
  background-color: rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  padding: 6px;
}

.date-input::-webkit-calendar-picker-indicator:hover {
  background-color: rgba(148, 163, 184, 0.35);
}

.date-input:focus::-webkit-calendar-picker-indicator {
  background-color: rgba(234, 179, 8, 0.35);
}
</style>


