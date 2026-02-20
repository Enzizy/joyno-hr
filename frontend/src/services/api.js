const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

function getToken() {
  return localStorage.getItem('token')
}

async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers = { ...(options.headers || {}) }
  if (!isFormData) headers['Content-Type'] = 'application/json'
  const token = getToken()
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
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
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
  const qs = params.toString()
  return request(`/api/notifications${qs ? `?${qs}` : ''}`)
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

export async function approveLeaveRequest(id) {
  return request(`/api/leave-requests/${id}/approve`, { method: 'POST' })
}

export async function rejectLeaveRequest(id, comment) {
  return request(`/api/leave-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export async function cancelLeaveRequest(id) {
  return request(`/api/leave-requests/${id}/cancel`, { method: 'POST' })
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
  if (options.limit) params.set('limit', options.limit)
  if (options.offset || options.offset === 0) params.set('offset', options.offset)
  const qs = params.toString()
  return request(`/api/tasks${qs ? `?${qs}` : ''}`)
}

export async function createTask(data) {
  return request('/api/tasks', { method: 'POST', body: JSON.stringify(data) })
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
