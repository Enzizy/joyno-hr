import { ALL_ROLES, MANAGEMENT_ROLES, isRoleAllowed } from '@/utils/roles'
import { payrollEnabled } from '@/config/features'

// Navigation describes HR jobs. Existing screens and URLs remain available during the payroll trial.
export const navGroups = [
  { name: 'Home', icon: 'dashboard', path: '/', roles: ALL_ROLES },
  {
    name: 'Employees', icon: 'users', path: '/employees', roles: MANAGEMENT_ROLES,
    activePaths: ['/employees'],
  },
  { name: 'Payroll', employeeName: 'My payslips', icon: 'pay', path: '/payroll', roles: ALL_ROLES, hidden: !payrollEnabled },
  {
    name: 'Leave', icon: 'leave', roles: ALL_ROLES,
    children: [
      { path: '/leave-request', name: 'My leave', icon: 'leave', roles: ALL_ROLES },
      { path: '/leave-approvals', name: 'Approvals', icon: 'check', roles: MANAGEMENT_ROLES },
      { path: '/leave-calendar', name: 'Team calendar', icon: 'leave', roles: MANAGEMENT_ROLES },
    ],
  },
  { name: 'Tasks & meetings', icon: 'task', path: '/tasks', roles: MANAGEMENT_ROLES },
  { name: 'My tasks', icon: 'task', path: '/my-tasks', roles: ['employee'] },
  { name: 'Announcements', icon: 'announcement', path: '/announcements', roles: ALL_ROLES },
  {
    name: 'Reports', icon: 'chart', roles: MANAGEMENT_ROLES,
    children: [
      { path: '/reports/leave', name: 'Leave reports', icon: 'leave', roles: MANAGEMENT_ROLES },
      { path: '/reports/leave-balances', name: 'Leave balances', icon: 'leave', roles: MANAGEMENT_ROLES },
      { path: '/reports/payroll', name: 'Payroll reports', icon: 'pay', roles: MANAGEMENT_ROLES, hidden: !payrollEnabled },
      { path: '/reports/remittances', name: 'Government remittances', icon: 'pay', roles: MANAGEMENT_ROLES, hidden: !payrollEnabled },
      { path: '/reports/13th-month', name: '13th month pay', icon: 'pay', roles: MANAGEMENT_ROLES, hidden: !payrollEnabled },
      { path: '/reports/sil-conversion', name: 'SIL cash conversion', icon: 'leave', roles: MANAGEMENT_ROLES, hidden: !payrollEnabled },
      { path: '/reports/attendance', name: 'Attendance reports', icon: 'check', roles: MANAGEMENT_ROLES, hidden: !payrollEnabled },
    ],
  },
  {
    name: 'Settings', icon: 'settings', roles: MANAGEMENT_ROLES,
    children: [
      { path: '/settings/leave', name: 'Leave policy', icon: 'leave', roles: MANAGEMENT_ROLES },
      { path: '/settings/tax', name: 'Withholding tax', icon: 'pay', roles: MANAGEMENT_ROLES, hidden: !payrollEnabled },
      { path: '/users', name: 'Accounts', icon: 'user-cog', roles: MANAGEMENT_ROLES },
      { path: '/audit-logs', name: 'Audit log', icon: 'audit', roles: MANAGEMENT_ROLES },
    ],
  },
  { name: 'Profile', icon: 'users', path: '/profile', roles: ['employee'] },
]

function roleAllowed(item, role) {
  return !item.roles || isRoleAllowed(item.roles, role)
}

export function getNavForRole(role) {
  return navGroups
    .filter(group => !group.hidden && roleAllowed(group, role))
    .map(group => ({
      ...group,
      name: role === 'employee' ? group.employeeName || group.name : group.name,
      children: group.children?.filter(child => !child.hidden && roleAllowed(child, role)) || [],
      related: group.related?.filter(child => !child.hidden && roleAllowed(child, role)) || [],
    }))
    .filter(group => group.path || group.children.length)
}

export function getSearchNavForRole(role) {
  return getNavForRole(role).flatMap(group => [
    ...(group.path ? [{ path: group.path, name: group.name, icon: group.icon }] : []),
    ...[...group.children, ...group.related].map(child => ({ ...child, group: group.name })),
  ])
}
