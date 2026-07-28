import { ref } from 'vue'

export function useAttachmentPreview(apiBase) {
  const show = ref(false)
  const url = ref('')
  const loading = ref(false)
  const isPdf = ref(false)

  async function open(row) {
    if (!row?.id) return
    loading.value = true
    show.value = true
    const token = localStorage.getItem('token')
    try {
      const response = await fetch(`${apiBase}/api/leave-requests/${row.id}/attachment`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new Error('Unable to load attachment')
      const blob = await response.blob()
      isPdf.value = blob.type === 'application/pdf'
      url.value = URL.createObjectURL(blob)
    } catch {
      url.value = ''
      isPdf.value = false
    } finally {
      loading.value = false
    }
  }

  function close() {
    show.value = false
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = ''
    isPdf.value = false
  }

  return { close, isPdf, loading, open, show, url }
}
