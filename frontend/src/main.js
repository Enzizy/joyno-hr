import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

function setBootMessage(message) {
  const el = document.getElementById('boot-message')
  if (el) el.textContent = message
}

async function checkBackendHealth(timeoutMs = 9000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal })
    if (!res.ok) return false
    const data = await res.json().catch(() => ({}))
    return data?.status === 'ok'
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForBackendReady() {
  const startedAt = Date.now()
  while (true) {
    const isReady = await checkBackendHealth()
    if (isReady) return
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000)
    if (elapsedSec >= 30) {
      setBootMessage('Still waking up server... this is normal on free hosting.')
    } else if (elapsedSec >= 10) {
      setBootMessage('Server is waking up... please wait.')
    } else {
      setBootMessage('Connecting to server...')
    }
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }
}

const app = createApp(App)
app.use(createPinia())
app.use(router)

const authStore = useAuthStore()
const themeStore = useThemeStore()
themeStore.initTheme()

waitForBackendReady()
  .catch(() => {})
  .finally(async () => {
    setBootMessage('Finalizing session...')
    await authStore.initAuth()
    app.mount('#app')
  })
