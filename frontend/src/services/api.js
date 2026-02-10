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

export async function createPayrollRun(data) {
  return request('/api/payroll-runs', { method: 'POST', body: JSON.stringify(data) })
}

export async function getPayrollRuns() {
  return request('/api/payroll-runs')
}

export async function getPayslips(options = {}) {
  const params = new URLSearchParams()
  if (options.mine) params.set('mine', '1')
  const qs = params.toString()
  return request(`/api/payslips${qs ? `?${qs}` : ''}`)
}
