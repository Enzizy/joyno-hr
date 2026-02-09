const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

function getToken() {
  return localStorage.getItem('token')
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
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

export async function getLeaveTypes() {
  return request('/api/leave-types')
}

export async function createLeaveType(data) {
  return request('/api/leave-types', { method: 'POST', body: JSON.stringify(data) })
}

export async function getLeaveRequests() {
  return request('/api/leave-requests')
}

export async function createLeaveRequest(data) {
  return request('/api/leave-requests', { method: 'POST', body: JSON.stringify(data) })
}

export async function approveLeaveRequest(id) {
  return request(`/api/leave-requests/${id}/approve`, { method: 'POST' })
}

export async function rejectLeaveRequest(id, comment) {
  return request(`/api/leave-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export async function getLeaveReport(from, to) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  return request(`/api/reports/leave${qs ? `?${qs}` : ''}`)
}

export async function getAuditLogs() {
  return request('/api/audit-logs')
}
