import { useAuthStore } from '@/stores/authStore'
import * as api from '@/services/api'

export async function getAuditLogs(options = {}) {
  return api.getAuditLogs(options)
}

export async function addAuditLog() {
  return null
}

export async function getEmployees() {
  return api.getEmployees()
}

export async function getEmployee(id) {
  return api.getEmployee(id)
}

export async function createEmployee(data) {
  return api.createEmployee(data)
}

export async function updateEmployee(id, data) {
  return api.updateEmployee(id, data)
}

export async function deleteEmployee(id) {
  return api.deleteEmployee(id)
}

export async function getUsers() {
  return api.getUsers()
}

export async function createUser(data) {
  return api.createUser(data)
}

export async function deleteUser(id) {
  return api.deleteUser(id)
}

export async function getLeaveTypes() {
  return api.getLeaveTypes()
}

export async function getLeaveBalances() {
  return []
}

export async function getLeaveRequests(options = {}) {
  return api.getLeaveRequests(options)
}

export async function getLeaveRequestsForEmployee() {
  return api.getLeaveRequests({ scope: 'mine' })
}

export async function createLeaveRequest(data) {
  return api.createLeaveRequest(data)
}

export async function updateLeaveRequest(id, data) {
  return api.updateLeaveRequest(id, data)
}

export async function approveLeaveRequest(id) {
  return api.approveLeaveRequest(id)
}

export async function rejectLeaveRequest(id, comment) {
  return api.rejectLeaveRequest(id, comment)
}

export async function cancelLeaveRequest(id) {
  return api.cancelLeaveRequest(id)
}

export async function getLeaveReport(from, to) {
  return api.getLeaveReport(from, to)
}

export async function fetchMe() {
  const authStore = useAuthStore()
  const data = await api.fetchMe()
  authStore.userProfile = data.user
  return data.user
}
