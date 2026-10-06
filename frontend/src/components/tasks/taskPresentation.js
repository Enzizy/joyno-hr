const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }

export function formatStatus(value) {
  return STATUS_LABELS[value] || value
}

export function formatPriority(value) {
  return PRIORITY_LABELS[value] || value
}

export function statusTone(value) {
  if (value === 'completed') return 'border status-badge--success'
  if (['pending', 'in_progress'].includes(value)) return 'border status-badge--warning'
  return 'border status-badge--neutral'
}

export function priorityTone(value) {
  if (value === 'urgent') return 'border status-badge--danger'
  if (value === 'high') return 'border status-badge--orange'
  if (value === 'medium') return 'border status-badge--warning'
  return 'border status-badge--neutral'
}

export function serviceCardClass(row) {
  if (row.service_type === 'website_development') return 'border-cyan-700/70 bg-cyan-950/10'
  if (row.service_type === 'social_media_management') return 'border-violet-700/70 bg-violet-950/10'
  return 'border-gray-800 bg-gray-900'
}

export function serviceBadgeClass(serviceType) {
  if (serviceType === 'website_development') return 'status-badge--info'
  if (serviceType === 'social_media_management') return 'status-badge--violet'
  return 'status-badge--neutral'
}

export function serviceBadgeLabel(serviceType) {
  if (serviceType === 'website_development') return 'Web Dev'
  if (serviceType === 'social_media_management') return 'SocMed'
  return 'General'
}

export function resolveTaskType(row) {
  const direct = String(row?.task_type || row?.task_type_resolved || '').trim().toLowerCase()
  if (direct === 'meeting' || direct === 'task') return direct
  return row?.client_id || row?.service_id ? 'task' : 'meeting'
}

export function taskTypeLabel(value) {
  return value === 'meeting' ? 'Meeting' : 'Task'
}

export function taskTypeBadgeClass(value) {
  return value === 'meeting'
    ? 'status-badge--violet'
    : 'status-badge--info'
}

export function workAccentClass(row) {
  if (resolveTaskType(row) === 'meeting') return 'border-l-violet-500'
  if (row?.service_type === 'website_development') return 'border-l-sky-500'
  if (row?.service_type === 'social_media_management') return 'border-l-emerald-500'
  return 'border-l-amber-500'
}

export function workIconClass(row) {
  if (resolveTaskType(row) === 'meeting') return 'status-badge--violet'
  if (row?.service_type === 'website_development') return 'tone-mark--info'
  if (row?.service_type === 'social_media_management') return 'tone-mark--success'
  return 'tone-mark--warning'
}
