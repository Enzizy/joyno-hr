import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'theme_mode'
const DEFAULT_MODE = 'light'

function applyTheme(mode) {
  const root = document.documentElement
  if (!root) return
  root.classList.toggle('theme-light', mode === 'light')
  root.classList.toggle('theme-dark', mode === 'dark')
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref(DEFAULT_MODE)

  function initTheme() {
    const savedMode = localStorage.getItem(STORAGE_KEY)
    mode.value = savedMode === 'dark' || savedMode === 'light' ? savedMode : DEFAULT_MODE
    applyTheme(mode.value)
  }

  function setMode(nextMode) {
    mode.value = nextMode === 'dark' ? 'dark' : 'light'
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
