import { watch } from 'vue'

export function usePersistentFilters(key, filters) {
  const storageKey = `joyno_filters_${key}`
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}')
    for (const [name, state] of Object.entries(filters)) {
      if (Object.prototype.hasOwnProperty.call(saved, name)) state.value = saved[name]
    }
  } catch {
    sessionStorage.removeItem(storageKey)
  }

  watch(
    Object.values(filters),
    () => {
      const values = Object.fromEntries(Object.entries(filters).map(([name, state]) => [name, state.value]))
      sessionStorage.setItem(storageKey, JSON.stringify(values))
    },
    { deep: true }
  )
}
