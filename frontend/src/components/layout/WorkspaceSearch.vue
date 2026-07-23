<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getSearchNavForRole } from '@/router/navConfig'
import { searchWorkspace } from '@/services/backendService'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const authStore = useAuthStore()
const rootRef = ref(null)
const inputRef = ref(null)
const open = ref(false)
const query = ref('')
const loading = ref(false)
const results = ref(emptyResults())
let debounceTimer = null

const pageResults = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  const pages = getSearchNavForRole(authStore.role)
  if (!normalized) return pages.slice(0, 6)
  return pages.filter((item) => `${item.name} ${item.group || ''}`.toLowerCase().includes(normalized)).slice(0, 5)
})

const groups = computed(() => [
  { key: 'employees', label: 'People', items: results.value.employees },
  { key: 'leaves', label: 'Leave requests', items: results.value.leaves },
  { key: 'tasks', label: 'Tasks & meetings', items: results.value.tasks },
  { key: 'notifications', label: 'Notifications', items: results.value.notifications },
].filter((group) => group.items.length))

const hasResults = computed(() => pageResults.value.length > 0 || groups.value.length > 0)

function emptyResults() {
  return { employees: [], leaves: [], tasks: [], notifications: [] }
}

watch(query, (value) => {
  clearTimeout(debounceTimer)
  const normalized = value.trim()
  if (normalized.length < 2) {
    results.value = emptyResults()
    loading.value = false
    return
  }
  loading.value = true
  debounceTimer = setTimeout(async () => {
    try {
      results.value = await searchWorkspace(normalized, 5)
    } catch {
      results.value = emptyResults()
    } finally {
      loading.value = false
    }
  }, 250)
})

function resultTitle(group, item) {
  if (group === 'employees') return `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.employee_code
  if (group === 'leaves') return `${item.employee_name || 'Employee'} · ${item.leave_type_name || 'Leave'}`
  if (group === 'tasks') return item.title || 'Task'
  return item.title || 'Notification'
}

function resultMeta(group, item) {
  if (group === 'employees') return [item.department, item.position, item.employee_code].filter(Boolean).join(' · ')
  if (group === 'leaves') return `${formatDate(item.start_date)} – ${formatDate(item.end_date)} · ${item.status}`
  if (group === 'tasks') return `${item.task_type || 'task'} · ${item.status} · Due ${formatDate(item.due_date)}`
  return item.message || formatDate(item.created_at)
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function resultPath(group, item) {
  const management = ['admin', 'hr', 'ceo'].includes(authStore.role)
  if (group === 'employees') return `/employees?employee=${item.id}`
  if (group === 'leaves') return `${management ? '/leave-approvals' : '/leave-request'}?request=${item.id}`
  if (group === 'tasks') return `${management ? '/tasks' : '/my-tasks'}?task=${item.id}`
  if (item.target_table === 'leave_requests') return `${management ? '/leave-approvals' : '/leave-request'}?request=${item.target_id}`
  if (item.target_table === 'tasks') return `${management ? '/tasks' : '/my-tasks'}?task=${item.target_id}`
  return '/notifications'
}

async function navigate(path) {
  open.value = false
  query.value = ''
  results.value = emptyResults()
  await router.push(path)
}

function submit() {
  if (pageResults.value[0]) return navigate(pageResults.value[0].path)
  const firstGroup = groups.value[0]
  if (firstGroup?.items[0]) navigate(resultPath(firstGroup.key, firstGroup.items[0]))
}

function handleShortcut(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    open.value = true
    inputRef.value?.focus()
  }
  if (event.key === 'Escape') open.value = false
}

function handleOutsideClick(event) {
  if (rootRef.value && !rootRef.value.contains(event.target)) open.value = false
}

onMounted(() => {
  document.addEventListener('keydown', handleShortcut)
  document.addEventListener('click', handleOutsideClick)
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  document.removeEventListener('keydown', handleShortcut)
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<template>
  <div ref="rootRef" class="relative hidden w-full xl:block">
    <form @submit.prevent="submit">
      <svg class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m21 21-4.35-4.35m1.35-5.15A6.5 6.5 0 1 1 5 11.5a6.5 6.5 0 0 1 13 0Z" /></svg>
      <input ref="inputRef" v-model="query" type="search" class="h-10 w-full rounded-lg border border-gray-800 bg-gray-900/80 pl-10 pr-16 text-sm text-gray-200 placeholder:text-gray-600 transition focus:border-primary-500/55 focus:outline-none focus:ring-2 focus:ring-primary-500/10" placeholder="Search people, leave, tasks, meetings..." aria-label="Search workspace" @focus="open = true" />
      <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-500">⌘ K</span>
    </form>

    <div v-if="open" class="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 shadow-2xl shadow-black/30">
      <div class="flex items-center justify-between border-b border-gray-800 px-4 py-2.5"><p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Workspace search</p><span v-if="loading" class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" /></div>

      <section v-if="pageResults.length" class="border-b border-gray-800 p-2">
        <p class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Pages</p>
        <button v-for="item in pageResults" :key="item.path" type="button" class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-primary-200" @click="navigate(item.path)"><span>{{ item.name }}</span><span class="text-[10px] text-gray-500">{{ item.group || 'Open' }}</span></button>
      </section>

      <section v-for="group in groups" :key="group.key" class="border-b border-gray-800 p-2 last:border-0">
        <p class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{{ group.label }}</p>
        <button v-for="item in group.items" :key="`${group.key}-${item.id}`" type="button" class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-800" @click="navigate(resultPath(group.key, item))">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-800 bg-gray-950 text-xs font-semibold text-primary-300">{{ resultTitle(group.key, item).charAt(0).toUpperCase() }}</span>
          <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium text-gray-200 group-hover:text-primary-200">{{ resultTitle(group.key, item) }}</span><span class="mt-0.5 block truncate text-xs capitalize text-gray-500">{{ resultMeta(group.key, item) }}</span></span>
          <span class="text-[10px] text-gray-600">Open</span>
        </button>
      </section>

      <p v-if="query.trim().length >= 2 && !loading && !hasResults" class="px-4 py-8 text-center text-sm text-gray-500">No workspace results found.</p>
      <p v-if="query.trim().length < 2 && !pageResults.length" class="px-4 py-6 text-center text-sm text-gray-500">Type at least two characters to search records.</p>
    </div>
  </div>
</template>
