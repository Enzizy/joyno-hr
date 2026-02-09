<script setup>
defineProps({
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  label: { type: String, default: '' },
  name: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  error: { type: String, default: '' },
  disabled: Boolean,
  required: Boolean,
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
      :type="type"
      :name="name"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="block w-full rounded-lg border bg-gray-900 px-4 py-3 text-base text-gray-100 placeholder:text-gray-500 shadow-sm focus:border-primary-500 focus:ring-primary-500"
      :class="error ? 'border-red-500' : 'border-gray-700'"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <p v-if="error" class="mt-1 text-sm text-red-600">{{ error }}</p>
  </div>
</template>


