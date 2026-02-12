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

export async function getLeads(options = {}) {
  return api.getLeads(options)
}

export async function createLead(data) {
  return api.createLead(data)
}

export async function updateLead(id, data) {
  return api.updateLead(id, data)
}

export async function deleteLead(id) {
  return api.deleteLead(id)
}

export async function getLeadConversations(id) {
  return api.getLeadConversations(id)
}

export async function createLeadConversation(id, data) {
  return api.createLeadConversation(id, data)
}

export async function convertLead(id, data) {
  return api.convertLead(id, data)
}

export async function getClients(options = {}) {
  return api.getClients(options)
}

export async function createClient(data) {
  return api.createClient(data)
}

export async function updateClient(id, data) {
  return api.updateClient(id, data)
}

export async function getClientConversations(id) {
  return api.getClientConversations(id)
}

export async function createClientConversation(id, data) {
  return api.createClientConversation(id, data)
}

export async function getServices(options = {}) {
  return api.getServices(options)
}

export async function updateService(id, data) {
  return api.updateService(id, data)
}

export async function getTasks(options = {}) {
  return api.getTasks(options)
}

export async function createTask(data) {
  return api.createTask(data)
}

export async function updateTask(id, data) {
  return api.updateTask(id, data)
}

export async function startTask(id) {
  return api.startTask(id)
}

export async function cancelTask(id) {
  return api.cancelTask(id)
}

export async function completeTask(id, data) {
  return api.completeTask(id, data)
}

export function getTaskProofUrl(id) {
  return api.getTaskProofUrl(id)
}

export async function getAutomationRules(options = {}) {
  return api.getAutomationRules(options)
}

export async function createAutomationRule(data) {
  return api.createAutomationRule(data)
}

export async function updateAutomationRule(id, data) {
  return api.updateAutomationRule(id, data)
}

export async function toggleAutomationRule(id) {
  return api.toggleAutomationRule(id)
}

export async function runAutomationRuleNow(id) {
  return api.runAutomationRuleNow(id)
}

export async function deleteAutomationRule(id) {
  return api.deleteAutomationRule(id)
}
