import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, fetchMe as apiFetchMe } from '@/services/api'

export const useAuthStore = defineStore('auth', () => {
  const userProfile = ref(null)
  const authReady = ref(false)

  const user = computed(() => userProfile.value)
  const isAuthenticated = computed(() => !!userProfile.value)
  const role = computed(() => userProfile.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')
  const isHR = computed(() => role.value === 'hr')
  const isEmployee = computed(() => role.value === 'employee')
  const canAccessAdmin = computed(() => isAdmin.value)
  const canAccessHR = computed(() => isAdmin.value || isHR.value)

  async function initAuth() {
    try {
      const data = await apiFetchMe()
      userProfile.value = data.user || null
    } catch {
      userProfile.value = null
    } finally {
      authReady.value = true
    }
  }

  async function waitForAuth() {
    if (authReady.value) return
    await initAuth()
  }

  async function login(email, password) {
    const data = await apiLogin(email, password)
    if (data.token) {
      localStorage.setItem('token', data.token)
    }
    userProfile.value = data.user
    return { user: userProfile.value }
  }

  async function fetchMe() {
    const data = await apiFetchMe()
    userProfile.value = data.user || null
    return userProfile.value
  }

  function logout() {
    localStorage.removeItem('token')
    userProfile.value = null
  }

  return {
    userProfile,
    user,
    authReady,
    waitForAuth,
    isAuthenticated,
    role,
    isAdmin,
    isHR,
    isEmployee,
    canAccessAdmin,
    canAccessHR,
    initAuth,
    login,
    fetchMe,
    logout,
  }
})
