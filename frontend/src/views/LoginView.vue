<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const toast = useToastStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (!email.value || !password.value) {
    error.value = 'Email and password are required.'
    return
  }
  loading.value = true
  try {
    await authStore.login(email.value, password.value)
    toast.success('Welcome back!')
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  } catch (err) {
    const msg = err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : (err.message || 'Login failed.')
    error.value = msg
    toast.error(msg)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-100 px-4">
    <div class="w-full max-w-md">
      <div class="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
        <div class="mb-8 text-center">
          <h1 class="text-2xl font-bold text-gray-900">HR System</h1>
          <p class="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>
        <form class="space-y-4" @submit.prevent="onSubmit">
          <AppInput
            v-model="email"
            type="email"
            label="Email"
            placeholder="you@company.com"
            required
            :error="error && !password ? error : ''"
          />
          <AppInput
            v-model="password"
            type="password"
            label="Password"
            placeholder="••••••••"
            required
            :error="error && password ? error : ''"
          />
          <AppButton type="submit" class="w-full" :loading="loading">
            Sign in
          </AppButton>
        </form>
      </div>
      <p class="mt-6 text-center text-xs text-gray-500">
        Internal use only. Contact IT for access.
      </p>
    </div>
  </div>
</template>
