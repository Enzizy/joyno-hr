const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }

export function formatStatus(value) {
  return STATUS_LABELS[value] || value
}

export function formatPriority(value) {
  return PRIORITY_LABELS[value] || value
}

export function statusTone(value) {
  if (value === 'completed') return 'bg-emerald-900/60 text-emerald-200'
  if (value === 'in_progress') return 'bg-amber-900/60 text-amber-200'
  if (value === 'cancelled') return 'bg-gray-800 text-gray-300'
  return 'bg-sky-900/60 text-sky-200'
}

export function priorityTone(value) {
  if (value === 'urgent') return 'bg-red-900/70 text-red-200'
  if (value === 'high') return 'bg-orange-900/70 text-orange-200'
  if (value === 'medium') return 'bg-amber-900/70 text-amber-200'
  return 'bg-gray-800 text-gray-300'
}

export function serviceCardClass(row) {
  if (row.service_type === 'website_development') return 'border-cyan-700/70 bg-cyan-950/10'
  if (row.service_type === 'social_media_management') return 'border-violet-700/70 bg-violet-950/10'
  return 'border-gray-800 bg-gray-900'
}

export function serviceBadgeClass(serviceType) {
  if (serviceType === 'website_development') return 'border-cyan-600/60 bg-cyan-900/30 text-cyan-200'
  if (serviceType === 'social_media_management') return 'border-violet-600/60 bg-violet-900/30 text-violet-200'
  return 'border-gray-700 text-gray-300'
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
    ? 'border-indigo-600/60 bg-indigo-900/30 text-indigo-200'
    : 'border-emerald-600/60 bg-emerald-900/30 text-emerald-200'
}
