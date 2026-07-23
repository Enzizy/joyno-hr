<script setup>
import { computed } from 'vue'
import { getTaskAttachmentUrl, getTaskProofUrl } from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import {
  formatPriority, formatStatus, priorityTone, resolveTaskType, statusTone,
  taskTypeBadgeClass, taskTypeLabel, workAccentClass, workIconClass,
} from './taskPresentation'

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  users: { type: Array, default: () => [] },
  tab: { type: String, default: 'active' },
  loading: Boolean,
  openActionsTaskId: { type: [Number, String], default: null },
  canManage: Boolean,
  actionLoadingId: { type: [Number, String], default: null },
})

defineEmits(['details', 'edit', 'cancel', 'toggle-actions'])

const sections = computed(() => {
  const groups = new Map()
  for (const task of props.tasks) {
    const label = groupLabel(task)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(task)
  }
  const order = ['Overdue', 'Today', 'This week', 'Later', 'Completed']
  return order.filter((label) => groups.has(label)).map((label) => ({ label, tasks: groups.get(label) }))
})

function dateOnly(value) { return String(value || '').slice(0, 10) }
function todayISO() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function groupLabel(task) {
  if (props.tab === 'completed' || task.status === 'completed') return 'Completed'
  const due = dateOnly(task.due_date)
  const today = todayISO()
  if (props.tab === 'overdue' || (due && due < today)) return 'Overdue'
  if (due === today) return 'Today'
  const weekEnd = new Date(`${today}T00:00:00`)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndISO = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`
  return due && due <= weekEndISO ? 'This week' : 'Later'
}
function formatDate(value) {
  const iso = dateOnly(value)
  if (!iso) return 'No due date'
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function userName(id) {
  const user = props.users.find((item) => Number(item.id) === Number(id))
  return user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : `User ${id}`
}
function initials(name) { return String(name || '?').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase() }
function assignees(task) {
  const ids = Array.isArray(task.assigned_to_ids) && task.assigned_to_ids.length ? task.assigned_to_ids : [task.assigned_to]
  return ids.filter(Boolean).map((id) => ({ id, name: userName(id) }))
}
</script>

<template>
  <section class="surface-card overflow-visible p-4 sm:p-5">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div><h2 class="text-lg font-semibold text-gray-100">{{ tab === 'completed' ? 'Completed work' : tab === 'overdue' ? 'Overdue work' : 'Active work' }}</h2><p class="mt-1 text-xs text-gray-500">Open an item to view its complete details and actions.</p></div>
      <span class="rounded-full bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300">{{ tasks.length }}</span>
    </div>

    <div v-if="loading" class="space-y-3"><div v-for="item in 4" :key="item" class="h-24 animate-pulse rounded-xl bg-gray-800" /></div>
    <div v-else class="space-y-6">
      <section v-for="section in sections" :key="section.label">
        <div class="mb-2 flex items-center gap-2"><h3 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{{ section.label }}</h3><span class="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">{{ section.tasks.length }}</span></div>
        <div class="space-y-2">
          <article v-for="row in section.tasks" :key="row.id" class="group relative cursor-pointer rounded-xl border border-l-[3px] border-gray-800 bg-gray-950/35 p-3.5 transition hover:border-gray-700 hover:bg-gray-950/70" :class="workAccentClass(row)" @click="$emit('details', row)">
            <div class="flex items-start gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border" :class="workIconClass(row)">
                <svg v-if="resolveTaskType(row) === 'meeting'" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" stroke-width="1.8"/><path d="M8 3v4M16 3v4M3 10h18" stroke-width="1.8"/></svg>
                <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 11l2 2 4-4M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" stroke-width="1.8"/></svg>
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2"><h4 class="truncate text-sm font-semibold text-gray-100">{{ row.title }}</h4><span class="rounded-full border px-2 py-0.5 text-[10px] font-semibold" :class="taskTypeBadgeClass(resolveTaskType(row))">{{ taskTypeLabel(resolveTaskType(row)) }}</span><span class="rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="statusTone(row.status)">{{ formatStatus(row.status) }}</span></div>
                <p class="mt-1.5 line-clamp-1 text-xs leading-5 text-gray-400">{{ row.description || 'No description provided.' }}</p>
                <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500"><span>{{ formatDate(row.due_date) }}</span><span v-if="row.company_name">{{ row.company_name }}</span><a v-if="row.attachment_data" :href="getTaskAttachmentUrl(row.id)" target="_blank" rel="noopener" class="text-primary-300 hover:text-primary-200" @click.stop>Attachment</a><a v-if="row.proof_of_work_data" :href="getTaskProofUrl(row.id)" target="_blank" rel="noopener" class="text-primary-300 hover:text-primary-200" @click.stop>Proof</a></div>
              </div>
              <div class="hidden shrink-0 items-center gap-3 sm:flex"><span class="rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="priorityTone(row.priority)">{{ formatPriority(row.priority) }}</span><div class="flex -space-x-2"><span v-for="person in assignees(row).slice(0, 3)" :key="person.id" class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-900 bg-gray-800 text-[9px] font-semibold text-gray-200" :title="person.name">{{ initials(person.name) }}</span><span v-if="assignees(row).length > 3" class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-900 bg-gray-700 text-[9px] text-gray-300">+{{ assignees(row).length - 3 }}</span></div>
                <div class="relative" :data-task-actions-menu="`task-${row.id}`" @click.stop><button type="button" class="icon-button h-8 w-8" aria-label="More actions" @click="$emit('toggle-actions', row.id)">⋮</button><div v-if="openActionsTaskId === row.id" class="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-xl"><button class="block w-full rounded-md px-3 py-2 text-left text-xs text-gray-200 hover:bg-gray-800" @click="$emit('details', row)">View details</button><button v-if="canManage" class="block w-full rounded-md px-3 py-2 text-left text-xs text-gray-200 hover:bg-gray-800" @click="$emit('edit', row)">Edit</button><button v-if="canManage && ['pending','in_progress'].includes(row.status)" class="block w-full rounded-md px-3 py-2 text-left text-xs text-red-300 hover:bg-red-950/40" :disabled="actionLoadingId === row.id" @click="$emit('cancel', row)">Cancel</button></div></div></div>
            </div>
          </article>
        </div>
      </section>
      <EmptyState v-if="!tasks.length" title="No tasks match these filters" description="Adjust the filters or create a new task or meeting." />
    </div>
  </section>
</template>
