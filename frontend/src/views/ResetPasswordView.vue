<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToastStore } from '@/stores/toastStore'
import { resetPassword } from '@/services/api'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import logoBg from '@/assets/Joynomedia logo.png'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const token = computed(() => String(route.query.token || '').trim())
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const done = ref(false)

async function onSubmit() {
  if (!token.value) {
    toast.error('Invalid reset link.')
    return
  }
  if (!newPassword.value || newPassword.value.length < 6) {
    toast.warning('Password must be at least 6 characters.')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.warning('Passwords do not match.')
    return
  }

  loading.value = true
  try {
    await resetPassword(token.value, newPassword.value)
    done.value = true
    toast.success('Password reset successful.')
    setTimeout(() => router.push('/login'), 1200)
  } catch (err) {
    toast.error(err.message || 'Reset failed.')
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
          <h1 class="text-2xl font-bold text-primary-200">Reset Password</h1>
          <p class="mt-1 text-sm text-gray-400">Set your new account password.</p>
        </div>

        <div
          v-if="!token"
          class="rounded-lg border border-red-700/30 bg-red-900/20 px-4 py-3 text-sm text-red-200"
        >
          Invalid reset link. Request a new link from Forgot Password.
        </div>

        <div
          v-else-if="done"
          class="rounded-lg border border-emerald-700/30 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-200"
        >
          Password updated. Redirecting to login...
        </div>

        <form v-else class="space-y-4" @submit.prevent="onSubmit">
          <AppInput
            v-model="newPassword"
            type="password"
            label="New password"
            placeholder="At least 6 characters"
            required
          />
          <AppInput
            v-model="confirmPassword"
            type="password"
            label="Confirm password"
            placeholder="Retype password"
            required
          />
          <AppButton type="submit" class="w-full" :loading="loading">Update password</AppButton>
        </form>

        <div class="mt-4 text-center">
          <RouterLink to="/login" class="text-sm text-primary-300 hover:text-primary-200">Back to login</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

