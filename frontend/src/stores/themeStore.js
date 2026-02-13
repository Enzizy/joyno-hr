import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'theme_mode'

function applyTheme(mode) {
  const root = document.documentElement
  if (!root) return
  root.classList.toggle('theme-light', mode === 'light')
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref('dark')

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY)
    mode.value = saved === 'light' ? 'light' : 'dark'
    applyTheme(mode.value)
  }

  function setMode(nextMode) {
    mode.value = nextMode === 'light' ? 'light' : 'dark'
    localStorage.setItem(STORAGE_KEY, mode.value)
    applyTheme(mode.value)
  }

  function toggleMode() {
    setMode(mode.value === 'dark' ? 'light' : 'dark')
  }

  return {
    mode,
    initTheme,
    setMode,
    toggleMode,
  }
})

