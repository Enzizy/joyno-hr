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
    <label v-if="label" :for="name || undefined" class="mb-1.5 block text-sm font-medium text-gray-200">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <input
      type="date"
      :name="name"
      :id="name || undefined"
      :value="modelValue"
      :disabled="disabled"
      :min="min"
      :max="max"
      class="date-input form-control"
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
  background-color: rgba(115, 115, 115, 0.22);
  border-radius: 6px;
  padding: 6px;
}

.date-input::-webkit-calendar-picker-indicator:hover {
  background-color: rgba(163, 163, 163, 0.3);
}

.date-input:focus::-webkit-calendar-picker-indicator {
  background-color: rgba(234, 179, 8, 0.35);
}
</style>


