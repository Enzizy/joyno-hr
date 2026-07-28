import { getLocalPhilippineHolidays } from '@/data/philippineHolidays2026'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const HAS_WORKSPACE_API = import.meta.env.VITE_WORKSPACE_API !== 'false'

function getToken() {
  return localStorage.getItem('token')
}

async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers = { ...(options.headers || {}) }
  if (!isFormData) headers['Content-Type'] = 'application/json'
  const token = options.skipAuth ? null : getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    let msg = 'Request failed'
    try {
      const data = await res.json()
      msg = data.message || msg
    } catch {}
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return res.json()
}

export async function login(email, password) {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), skipAuth: true })
}

export async function forgotPassword(email) {
  return request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }), skipAuth: true })
}

export async function resetPassword(token, newPassword) {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
    skipAuth: true,
  })
}

export async function fetchMe() {
  return request('/api/auth/me')
}

export async function getDashboardOverview() {
  return request('/api/dashboard/overview')
}

export async function getNotifications(options = {}) {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', options.limit)
  if (options.offset || options.offset === 0) params.set('offset', options.offset)
  if (options.unreadOnly) params.set('unread', 'true')
  if (options.type) params.set('type', options.type)
  if (options.category) params.set('category', options.category)
  if (options.search) params.set('search', options.search)
  const qs = params.toString()
  const endpoint = HAS_WORKSPACE_API ? '/api/notification-feed' : '/api/notifications'
  const data = await request(`${endpoint}${qs ? `?${qs}` : ''}`)
  if (HAS_WORKSPACE_API) return data
  const categorized = (data.items || []).map((item) => ({
    ...item,
    category: String(item.type || '').startsWith('leave_') ? 'leave' : String(item.type || '').startsWith('task_') ? 'task' : 'system',
    preview: null,
  }))
  const search = String(options.search || '').trim().toLowerCase()
  const items = categorized.filter((item) => (!options.category || item.category === options.category)
    && (!search || `${item.title || ''} ${item.message || ''}`.toLowerCase().includes(search)))
  return { ...data, items, total: options.category || search ? items.length : data.total }
}

export async function searchWorkspace(query, limit = 6) {
  if (!HAS_WORKSPACE_API) return { employees: [], leaves: [], tasks: [], notifications: [] }
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return request(`/api/workspace-search?${params.toString()}`)
}

export async function getNotificationPreferences() {
  if (!HAS_WORKSPACE_API) return { email_delivery: 'immediate', leave_enabled: true, task_enabled: true, system_enabled: true, unavailable: true }
  return request('/api/notification-preferences')
}

export async function updateNotificationPreferences(data) {
  if (!HAS_WORKSPACE_API) return { ...data, unavailable: true }
  return request('/api/notification-preferences', { method: 'PUT', body: JSON.stringify(data) })
}

export async function getLeaveApprovalInbox() {
  if (!HAS_WORKSPACE_API) {
    const rows = await getLeaveRequests()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return rows.filter((row) => row.status === 'pending').map((row) => {
      const created = new Date(row.created_at)
      const start = new Date(`${String(row.start_date).slice(0, 10)}T00:00:00`)
      const filingAgeHours = Math.max(0, Math.floor((Date.now() - created.getTime()) / 3600000))
      const daysUntilStart = Math.round((start.getTime() - today.getTime()) / 86400000)
      return { ...row, filing_age_hours: filingAgeHours, days_until_start: daysUntilStart, overlapping_count: null, leave_credits: null, urgency: daysUntilStart <= 0 || filingAgeHours >= 48 ? 'critical' : filingAgeHours >= 24 || daysUntilStart <= 2 ? 'high' : 'normal', low_risk: false }
    })
  }
  return request('/api/leave-approval-inbox')
}

export async function markNotificationRead(id) {
  return request(`/api/notifications/${id}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead() {
  return request('/api/notifications/read-all', { method: 'POST' })
}

export async function markManyNotificationsRead(ids = []) {
  return request('/api/notifications/read-many', { method: 'POST', body: JSON.stringify({ ids }) })
}

export async function deleteNotification(id) {
  return request(`/api/notifications/${id}`, { method: 'DELETE' })
}

export async function deleteManyNotifications(ids = []) {
  return request('/api/notifications/delete-many', { method: 'POST', body: JSON.stringify({ ids }) })
}

export async function cleanupNotifications(days = 90) {
  return request('/api/notifications/cleanup', { method: 'POST', body: JSON.stringify({ days }) })
}

export async function changePassword(currentPassword, newPassword) {
  return request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function getEmployees() {
  return request('/api/employees')
}

export async function getEmployee(id) {
  return request(`/api/employees/${id}`)
}

export async function createEmployee(data) {
  return request('/api/employees', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateEmployee(id, data) {
  return request(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteEmployee(id) {
  return request(`/api/employees/${id}`, { method: 'DELETE' })
}

export async function setEmployeeAwol(id, data) {
  return request(`/api/employees/${id}/awol`, { method: 'POST', body: JSON.stringify(data) })
}

export async function getUsers() {
  return request('/api/users')
}

export async function createUser(data) {
  return request('/api/users', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteUser(id) {
  return request(`/api/users/${id}`, { method: 'DELETE' })
}

export async function getLeaveTypes() {
  return request('/api/leave-types')
}

export async function createLeaveType(data) {
  return request('/api/leave-types', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateLeaveType(id, data) {
  return request(`/api/leave-types/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function getLeavePolicySettings() {
  return request('/api/leave-policy-settings')
}

export async function updateLeavePolicySettings(data) {
  return request('/api/leave-policy-settings', { method: 'PUT', body: JSON.stringify(data) })
}

export async function getLeaveCalendar(options = {}) {
  if (!HAS_WORKSPACE_API) {
    const rows = await getLeaveRequests()
    return rows.filter((row) => ['pending', 'approved'].includes(row.status)
      && (!options.from || row.end_date >= options.from)
      && (!options.to || row.start_date <= options.to))
  }
  const params = new URLSearchParams()
  if (options.from) params.set('from', options.from)
  if (options.to) params.set('to', options.to)
  if (options.department && options.department !== 'all') params.set('department', options.department)
  return request(`/api/leave-calendar?${params.toString()}`)
}

export async function getPhilippineHolidays(from, to) {
  const params = new URLSearchParams({ from, to })
  try {
    return await request(`/api/philippine-holidays?${params.toString()}`)
  } catch {
    return getLocalPhilippineHolidays(from, to)
  }
}

export async function getHrCalendarEntries(options = {}) {
  const params = new URLSearchParams()
  if (options.from) params.set('from', options.from)
  if (options.to) params.set('to', options.to)
  if (options.department && options.department !== 'all') params.set('department', options.department)
  return request(`/api/hr-calendar-entries?${params.toString()}`)
}

export async function createHrCalendarEntry(data) {
  return request('/api/hr-calendar-entries', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateHrCalendarEntry(id, data) {
  return request(`/api/hr-calendar-entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteHrCalendarEntry(id) {
  return request(`/api/hr-calendar-entries/${id}`, { method: 'DELETE' })
}

export async function getLeaveAvailability(options = {}) {
  const params = new URLSearchParams()
  params.set('employee_id', options.employeeId)
  params.set('from', options.from)
  params.set('to', options.to)
  if (options.excludeId) params.set('exclude_id', options.excludeId)
  return request(`/api/leave-availability?${params.toString()}`)
}

export async function getLeaveTimeline(id) {
  return request(`/api/leave-requests/${id}/timeline`)
}

export async function getLeaveRequests(options = {}) {
  const params = new URLSearchParams()
  if (options.scope) params.set('scope', options.scope)
  const qs = params.toString()
  return request(`/api/leave-requests${qs ? `?${qs}` : ''}`)
}

export async function createLeaveRequest(data) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData
  return request('/api/leave-requests', { method: 'POST', body: isFormData ? data : JSON.stringify(data) })
}

export async function updateLeaveRequest(id, data) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData
  return request(`/api/leave-requests/${id}`, { method: 'PUT', body: isFormData ? data : JSON.stringify(data) })
}

export async function approveLeaveRequest(id, options = {}) {
  return request(`/api/leave-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function reviewLeaveAttachment(id, data) {
  return request(`/api/leave-requests/${id}/attachment-review`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function uploadLeaveAttachmentReplacement(id, file) {
  const body = new FormData()
  body.append('attachment', file)
  return request(`/api/leave-requests/${id}/attachment-replacement`, {
    method: 'POST',
    body,
  })
}

export async function rejectLeaveRequest(id, comment) {
  return request(`/api/leave-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export async function cancelLeaveRequest(id) {
  return request(`/api/leave-requests/${id}/cancel`, { method: 'POST' })
}

export async function getLeaveChangeRequests(options = {}) {
  const params = new URLSearchParams()
  if (options.scope) params.set('scope', options.scope)
  if (options.status) params.set('status', options.status)
  const query = params.toString()
  return request(`/api/leave-change-requests${query ? `?${query}` : ''}`)
}

export async function createLeaveChangeRequest(data) {
  return request('/api/leave-change-requests', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function approveLeaveChangeRequest(id, comment = '') {
  return request(`/api/leave-change-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  })
}

export async function rejectLeaveChangeRequest(id, comment) {
  return request(`/api/leave-change-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  })
}

export async function deleteLeaveRequest(id) {
  return request(`/api/leave-requests/${id}`, { method: 'DELETE' })
}

export async function getLeaveComments(id) {
  return request(`/api/leave-requests/${id}/comments`)
}

export async function createLeaveComment(id, message) {
  return request(`/api/leave-requests/${id}/comments`, { method: 'POST', body: JSON.stringify({ message }) })
}

export async function getLeaveReport(from, to) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  return request(`/api/reports/leave${qs ? `?${qs}` : ''}`)
}

export async function getAuditLogs(options = {}) {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', options.limit)
  if (options.offset) params.set('offset', options.offset)
  const qs = params.toString()
  return request(`/api/audit-logs${qs ? `?${qs}` : ''}`)
}

export async function getLeads(options = {}) {
  const params = new URLSearchParams()
  if (options.status && options.status !== 'all') params.set('status', options.status)
  if (options.source && options.source !== 'all') params.set('source', options.source)
  if (options.search) params.set('search', options.search)
  if (options.limit) params.set('limit', options.limit)
  if (options.offset || options.offset === 0) params.set('offset', options.offset)
  const qs = params.toString()
  return request(`/api/leads${qs ? `?${qs}` : ''}`)
}

export async function createLead(data) {
  return request('/api/leads', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateLead(id, data) {
  return request(`/api/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteLead(id) {
  return request(`/api/leads/${id}`, { method: 'DELETE' })
}

export async function getLeadConversations(id) {
  return request(`/api/leads/${id}/conversations`)
}

export async function createLeadConversation(id, data) {
  return request(`/api/leads/${id}/conversations`, { method: 'POST', body: JSON.stringify(data) })
}

export async function convertLead(id, data) {
  return request(`/api/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(data) })
}

export async function getClients(options = {}) {
  const params = new URLSearchParams()
  if (options.status && options.status !== 'all') params.set('status', options.status)
  if (options.search) params.set('search', options.search)
  if (options.limit) params.set('limit', options.limit)
  if (options.offset || options.offset === 0) params.set('offset', options.offset)
  const qs = params.toString()
  return request(`/api/clients${qs ? `?${qs}` : ''}`)
}

export async function createClient(data) {
  return request('/api/clients', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateClient(id, data) {
  return request(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function getClientConversations(id) {
  return request(`/api/clients/${id}/conversations`)
}

export async function createClientConversation(id, data) {
  return request(`/api/clients/${id}/conversations`, { method: 'POST', body: JSON.stringify(data) })
}

export async function getServices(options = {}) {
  const params = new URLSearchParams()
  if (options.search) params.set('search', options.search)
  if (options.type && options.type !== 'all') params.set('type', options.type)
  if (options.client_id) params.set('client_id', options.client_id)
  const qs = params.toString()
  return request(`/api/services${qs ? `?${qs}` : ''}`)
}

export async function updateService(id, data) {
  return request(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function getTasks(options = {}) {
  const params = new URLSearchParams()
  if (options.tab) params.set('tab', options.tab)
  if (options.search) params.set('search', options.search)
  if (options.client_id) params.set('client_id', options.client_id)
  if (options.assigned_to) params.set('assigned_to', options.assigned_to)
  if (options.task_type) params.set('task_type', options.task_type)
  if (options.limit) params.set('limit', options.limit)
  if (options.offset || options.offset === 0) params.set('offset', options.offset)
  const qs = params.toString()
  return request(`/api/tasks${qs ? `?${qs}` : ''}`)
}

export async function createTask(data) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData
  return request('/api/tasks', { method: 'POST', body: isFormData ? data : JSON.stringify(data) })
}

export async function updateTask(id, data) {
  return request(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function startTask(id) {
  return request(`/api/tasks/${id}/start`, { method: 'POST' })
}

export async function cancelTask(id) {
  return request(`/api/tasks/${id}/cancel`, { method: 'POST' })
}

export async function completeTask(id, data) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData
  return request(`/api/tasks/${id}/complete`, { method: 'POST', body: isFormData ? data : JSON.stringify(data) })
}

export function getTaskProofUrl(id) {
  return `${API_BASE}/api/tasks/${id}/proof`
}

export function getTaskAttachmentUrl(id) {
  return `${API_BASE}/api/tasks/${id}/attachment`
}

export async function getAutomationRules(options = {}) {
  const params = new URLSearchParams()
  if (options.client_id) params.set('client_id', options.client_id)
  const qs = params.toString()
  return request(`/api/automation-rules${qs ? `?${qs}` : ''}`)
}

export async function createAutomationRule(data) {
  return request('/api/automation-rules', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateAutomationRule(id, data) {
  return request(`/api/automation-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function toggleAutomationRule(id) {
  return request(`/api/automation-rules/${id}/toggle`, { method: 'POST' })
}

export async function runAutomationRuleNow(id) {
  return request(`/api/automation-rules/${id}/run-now`, { method: 'POST' })
}

export async function deleteAutomationRule(id) {
  return request(`/api/automation-rules/${id}`, { method: 'DELETE' })
}
