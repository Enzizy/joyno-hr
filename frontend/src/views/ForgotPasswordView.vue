<script setup>
import { ref } from 'vue'
import { useToastStore } from '@/stores/toastStore'
import { forgotPassword } from '@/services/api'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import logoBg from '@/assets/Joynomedia logo.png'

const toast = useToastStore()
const email = ref('')
const loading = ref(false)
const submitted = ref(false)

async function onSubmit() {
  if (!email.value) return
  loading.value = true
  try {
    await forgotPassword(email.value)
    submitted.value = true
    toast.success('If the account exists, a reset link has been sent.')
  } catch (err) {
    toast.error(err.message || 'Unable to process request.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center bg-gray-800 px-4">
    <div
      class="pointer-events-none absolute inset-0 bg-center bg-no-repeat opacity-15"
      :style="{ backgroundImage: `url(${logoBg})`, backgroundSize: '520px auto' }"
    />
    <div class="w-full max-w-md">
      <div class="rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-lg">
        <div class="mb-6 text-center">
          <h1 class="text-2xl font-bold text-primary-200">Forgot Password</h1>
          <p class="mt-1 text-sm text-gray-400">Enter your email to receive a reset link.</p>
        </div>

        <div v-if="submitted" class="rounded-lg border border-emerald-700/30 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-200">
          If the account exists, we sent a password reset link to your email.
        </div>

        <form v-else class="space-y-4" @submit.prevent="onSubmit">
          <AppInput v-model="email" type="email" label="Email" placeholder="you@company.com" required />
          <AppButton type="submit" class="w-full" :loading="loading">Send reset link</AppButton>
        </form>

        <div class="mt-4 text-center">
          <RouterLink to="/login" class="text-sm text-primary-300 hover:text-primary-200">Back to login</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

