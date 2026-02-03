<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { auth } from '@/firebase'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'

const authStore = useAuthStore()
const toast = useToastStore()
const user = computed(() => authStore.user)

const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const changingPassword = ref(false)

async function changePassword() {
  const { currentPassword, newPassword, confirmPassword } = passwordForm.value
  if (!currentPassword || !newPassword || !confirmPassword) {
    toast.warning('Please fill all password fields.')
    return
  }
  if (newPassword.length < 6) {
    toast.warning('New password must be at least 6 characters.')
    return
  }
  if (newPassword !== confirmPassword) {
    toast.warning('New password and confirmation do not match.')
    return
  }
  changingPassword.value = true
  try {
    const fbUser = auth.currentUser
    if (!fbUser?.email) throw new Error('Not signed in')
    const cred = EmailAuthProvider.credential(fbUser.email, currentPassword)
    await reauthenticateWithCredential(fbUser, cred)
    await updatePassword(fbUser, newPassword)
    toast.success('Password updated successfully.')
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
  } catch (err) {
    const msg = err.code === 'auth/wrong-password' ? 'Current password is incorrect.' : (err.message || 'Failed to change password.')
    toast.error(msg)
  } finally {
    changingPassword.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Profile</h1>
      <p class="mt-1 text-sm text-gray-500">Your account information.</p>
    </div>
    <div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <dl class="grid gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-sm font-medium text-gray-500">Email</dt>
          <dd class="mt-1 text-sm text-gray-900">{{ user?.email ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-sm font-medium text-gray-500">Role</dt>
          <dd class="mt-1">
            <StatusBadge :status="user?.role ?? ''" />
          </dd>
        </div>
        <div v-if="user?.first_name">
          <dt class="text-sm font-medium text-gray-500">First name</dt>
          <dd class="mt-1 text-sm text-gray-900">{{ user.first_name }}</dd>
        </div>
        <div v-if="user?.last_name">
          <dt class="text-sm font-medium text-gray-500">Last name</dt>
          <dd class="mt-1 text-sm text-gray-900">{{ user.last_name }}</dd>
        </div>
      </dl>
    </div>

    <div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Change password</h2>
      <p class="mt-1 text-sm text-gray-500">Update your account password.</p>
      <form class="mt-4 max-w-md space-y-4" @submit.prevent="changePassword">
        <AppInput
          v-model="passwordForm.currentPassword"
          type="password"
          label="Current password"
          placeholder="••••••"
          required
        />
        <AppInput
          v-model="passwordForm.newPassword"
          type="password"
          label="New password"
          placeholder="••••••"
          required
        />
        <AppInput
          v-model="passwordForm.confirmPassword"
          type="password"
          label="Confirm new password"
          placeholder="••••••"
          required
        />
        <AppButton type="submit" :loading="changingPassword">Change password</AppButton>
      </form>
    </div>
  </div>
</template>
