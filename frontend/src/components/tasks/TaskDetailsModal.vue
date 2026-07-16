<script setup>
import { getTaskAttachmentUrl } from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'

const props = defineProps({ show: Boolean, task: { type: Object, default: null }, users: { type: Array, default: () => [] } })
const emit = defineEmits(['close'])

function labelFromOptions(value, options) {
  return options[value] || value || '-'
}

function formatDate(value) {
  const iso = String(value || '').slice(0, 10)
  if (!iso) return '-'
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })
}

function resolveTaskType(row) {
  const value = String(row?.task_type || row?.task_type_resolved || '').toLowerCase()
  if (value === 'meeting' || value === 'task') return value
  return row?.client_id || row?.service_id ? 'task' : 'meeting'
}

function userLabel(id) {
  const user = props.users.find((item) => Number(item.id) === Number(id))
  if (!user) return `User #${id}`
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || `User #${id}`
}

function assigneeNames(row) {
  const ids = Array.isArray(row?.assigned_to_ids) && row.assigned_to_ids.length ? row.assigned_to_ids : [row?.assigned_to]
  return ids.filter(Boolean).map(userLabel).join(', ') || '-'
}
</script>

<template>
  <AppModal :show="show" :title="resolveTaskType(task) === 'meeting' ? 'Meeting Details' : 'Task Details'" size="lg" @close="emit('close')">
    <div v-if="task" class="space-y-5">
      <div>
        <h3 class="text-lg font-semibold text-primary-200">{{ task.title }}</h3>
        <p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-300">{{ task.description || 'No description.' }}</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div class="detail-card"><p>Status</p><strong>{{ labelFromOptions(task.status, { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }) }}</strong></div>
        <div class="detail-card"><p>Priority</p><strong>{{ labelFromOptions(task.priority, { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }) }}</strong></div>
        <div class="detail-card"><p>Type</p><strong class="capitalize">{{ resolveTaskType(task) }}</strong></div>
        <div class="detail-card"><p>Due Date</p><strong>{{ formatDate(task.due_date) }}</strong></div>
        <div class="detail-card"><p>Service</p><strong>{{ labelFromOptions(task.service_type, { social_media_management: 'Social Media', website_development: 'Website Dev' }) }}</strong></div>
        <div class="detail-card"><p>Client</p><strong>{{ task.company_name || '-' }}</strong></div>
      </div>
      <div class="detail-card"><p>Assigned Employees</p><strong class="break-words">{{ assigneeNames(task) }}</strong></div>
      <a v-if="task.attachment_data" :href="getTaskAttachmentUrl(task.id)" target="_blank" rel="noopener" class="inline-flex items-center rounded-lg border border-primary-500/40 bg-primary-500/10 px-4 py-2 text-sm font-medium text-primary-200 hover:bg-primary-500/20">{{ task.attachment_name || 'View attachment' }}</a>
    </div>
    <template #footer><AppButton variant="secondary" @click="emit('close')">Close</AppButton></template>
  </AppModal>
</template>

<style scoped>
.detail-card { @apply rounded-lg border border-gray-800 bg-gray-950 p-3; }
.detail-card p { @apply text-xs text-gray-400; }
.detail-card strong { @apply mt-1 block text-sm font-medium text-gray-200; }
</style>
