import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/firebase'

export const useAuthStore = defineStore('auth', () => {
  const firebaseUser = ref(null)
  const userProfile = ref(null) // { role, employeeId, first_name, last_name } from Firestore
  const authReady = ref(false)
  let authReadyResolve
  const authReadyPromise = new Promise((resolve) => {
    authReadyResolve = resolve
  })

  const user = computed(() => {
    if (!firebaseUser.value) return null
    return {
      id: firebaseUser.value.uid,
      email: firebaseUser.value.email,
      role: userProfile.value?.role ?? null,
      employee_id: userProfile.value?.employeeId ?? null,
      first_name: userProfile.value?.first_name ?? null,
      last_name: userProfile.value?.last_name ?? null,
    }
  })

  const isAuthenticated = computed(() => !!firebaseUser.value)
  const role = computed(() => userProfile.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')
  const isHR = computed(() => role.value === 'hr')
  const isEmployee = computed(() => role.value === 'employee')
  const canAccessAdmin = computed(() => isAdmin.value)
  const canAccessHR = computed(() => isAdmin.value || isHR.value)

  async function fetchUserProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid))
    if (snap.exists()) {
      const data = snap.data()
      userProfile.value = { ...data }
      if (data.employeeId) {
        const empSnap = await getDoc(doc(db, 'employees', data.employeeId))
        if (empSnap.exists()) {
          const emp = empSnap.data()
          userProfile.value.first_name = emp.first_name
          userProfile.value.last_name = emp.last_name
        }
      }
    } else {
      userProfile.value = null
    }
  }

  function initAuthListener() {
    onAuthStateChanged(auth, async (fbUser) => {
      firebaseUser.value = fbUser
      if (fbUser) {
        await fetchUserProfile(fbUser.uid)
      } else {
        userProfile.value = null
      }
      authReady.value = true
      if (authReadyResolve) {
        authReadyResolve()
        authReadyResolve = null
      }
    })
  }

  async function waitForAuth() {
    if (authReady.value) return
    await authReadyPromise
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    await fetchUserProfile(cred.user.uid)
    return { user: user.value }
  }

  async function fetchMe() {
    if (!firebaseUser.value) return null
    await fetchUserProfile(firebaseUser.value.uid)
    return user.value
  }

  function logout() {
    return signOut(auth)
  }

  return {
    firebaseUser,
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
    initAuthListener,
    login,
    fetchMe,
    logout,
    fetchUserProfile,
  }
})
