<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { getAuditLogs, getUsers } from '@/services/backendService'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { AUDIT_CATEGORIES, auditAction, auditActor, auditChanges, auditTarget, auditTime } from '@/utils/auditLog'

// Who did what, to whom, and what changed. Filters by person, kind of record and dates.
const pageSize = 25
const items = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')
const users = ref([])
const filters = ref({ user_id: '', category: '', from: '', to: '' })

// People who can make changes: logins of management roles first, then everyone else.
const people = computed(() => [...users.value].sort((a, b) => (a.role === 'employee') - (b.role === 'employee') || String(a.email).localeCompare(String(b.email))))
const personLabel = user => [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email

let requestId = 0
async function load() {
  const id = ++requestId
  loading.value = true; error.value = ''
  try {
    const result = await getAuditLogs({ ...filters.value, limit: pageSize, offset: (page.value - 1) * pageSize })
    if (id !== requestId) return
    items.value = result.items || []
    total.value = Number(result.total || 0)
  } catch (e) { if (id === requestId) { items.value = []; error.value = e.message || 'Unable to load the audit log.' } }
  finally { if (id === requestId) loading.value = false }
}
watch(filters, () => { page.value = 1; load() }, { deep: true })
onMounted(async () => {
  load()
  try { users.value = await getUsers() } catch { users.value = [] }
})

const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const hasFilters = computed(() => Object.values(filters.value).some(Boolean))
function go(next) { if (next < 1 || next > pages.value) return; page.value = next; load() }
function clearFilters() { filters.value = { user_id: '', category: '', from: '', to: '' } }
const rows = computed(() => items.value.map(row => ({ ...row, when: auditTime(row.created_at), actor: auditActor(row), what: auditAction(row), target: auditTarget(row), changes: auditChanges(row) })))
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Audit log" />

    <section class="grid gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
      <label class="text-xs font-medium text-gray-400">Who<select v-model="filters.user_id" class="form-control mt-1.5"><option value="">Everyone</option><option v-for="user in people" :key="user.id" :value="String(user.id)">{{ personLabel(user) }}</option></select></label>
      <label class="text-xs font-medium text-gray-400">What<select v-model="filters.category" class="form-control mt-1.5"><option value="">Everything</option><option v-for="item in AUDIT_CATEGORIES" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label class="text-xs font-medium text-gray-400">From<input v-model="filters.from" type="date" :max="filters.to || undefined" class="form-control mt-1.5"></label>
      <label class="text-xs font-medium text-gray-400">To<input v-model="filters.to" type="date" :min="filters.from || undefined" class="form-control mt-1.5"></label>
      <button v-if="hasFilters" type="button" class="h-10 rounded-lg px-3 text-sm font-semibold text-gray-400 hover:text-gray-100" @click="clearFilters">Clear</button>
    </section>

    <p v-if="error" role="alert" class="rounded-lg border p-3 text-sm" style="color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-border)">{{ error }}</p>

    <section class="rounded-xl border border-gray-800 bg-gray-900" :aria-busy="loading">
      <div v-if="loading && !rows.length" class="space-y-3 p-4"><div v-for="item in 5" :key="item" class="h-14 animate-pulse rounded-lg bg-gray-800" /></div>
      <EmptyState v-else-if="!rows.length" class="m-4" title="Nothing recorded" :description="hasFilters ? 'No changes match these filters.' : 'Changes will appear here as people use the system.'" />
      <ol v-else class="divide-y divide-gray-800" :class="loading ? 'opacity-60' : ''">
        <li v-for="row in rows" :key="row.id" class="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4 sm:px-5">
          <p class="text-xs text-gray-500 sm:pt-0.5">{{ row.when }}</p>
          <div class="min-w-0">
            <p class="text-sm text-gray-300"><span class="font-medium text-gray-100">{{ row.actor }}</span> · {{ row.what }} · <span class="text-gray-100">{{ row.target }}</span></p>
            <ul v-if="row.changes.length" class="mt-1 space-y-0.5 text-xs text-gray-400"><li v-for="change in row.changes" :key="change">{{ change }}</li></ul>
          </div>
        </li>
      </ol>
    </section>

    <div class="flex items-center justify-between gap-3 text-sm text-gray-400">
      <span>{{ total }} {{ total === 1 ? 'entry' : 'entries' }}</span>
      <div class="flex items-center gap-2">
        <button type="button" class="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 disabled:opacity-40" :disabled="page <= 1 || loading" @click="go(page - 1)">Previous</button>
        <span>Page {{ page }} of {{ pages }}</span>
        <button type="button" class="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 disabled:opacity-40" :disabled="page >= pages || loading" @click="go(page + 1)">Next</button>
      </div>
    </div>
  </div>
</template>
