<script setup>
import { ref } from 'vue'
import { forgotPassword } from '@/services/api'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import logoBg from '@/assets/Joynomedia logo.png'

const email = ref('')
const loading = ref(false)
const submitted = ref(false)
const error = ref('')
const successMessage = ref('')

async function onSubmit() {
  if (loading.value) return
  error.value = ''
  if (!email.value.trim()) {
    error.value = 'Enter a valid email address.'
    return
  }
  loading.value = true
  try {
    const result = await forgotPassword(email.value.trim())
    successMessage.value = result.message
    submitted.value = true
  } catch (err) {
    error.value = err.message || 'Unable to process your request. Please try again later.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative isolate flex min-h-screen items-center justify-center bg-gray-800 px-4">
    <div
      class="pointer-events-none absolute inset-0 z-0 bg-center bg-no-repeat opacity-[0.07]"
      :style="{ backgroundImage: `url(${logoBg})`, backgroundSize: '520px auto' }"
    />
    <div class="relative z-10 w-full max-w-md">
      <div class="rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-lg">
        <div class="mb-6 text-center">
          <h1 class="text-2xl font-bold text-primary-200">Forgot Password</h1>
          <p class="mt-1 text-sm text-gray-400">Enter your email to receive a reset link.</p>
        </div>

        <div v-if="submitted" role="status" class="rounded-lg border border-emerald-700/30 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-200">
          {{ successMessage }}
        </div>

        <form v-else class="space-y-4" @submit.prevent="onSubmit">
          <div v-if="error" role="alert" class="rounded-lg border border-red-700/30 bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {{ error }}
          </div>
          <AppInput v-model="email" name="reset-email" type="email" label="Email" placeholder="you@company.com" :disabled="loading" required @update:model-value="error = ''" />
          <AppButton type="submit" class="w-full" :loading="loading">Send reset link</AppButton>
        </form>

        <div class="mt-4 text-center">
          <RouterLink to="/login" class="text-sm text-primary-300 hover:text-primary-200">Back to login</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

