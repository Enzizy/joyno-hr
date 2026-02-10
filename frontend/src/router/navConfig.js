/**
 * Role-based navigation config.
 * Each item can have roles: array of allowed roles, or omit for all authenticated.
 */
export const navItems = [
  { path: '/', name: 'Dashboard', icon: 'dashboard', roles: ['admin', 'hr', 'employee'] },
  { path: '/profile', name: 'Profile', icon: 'user', roles: ['admin', 'hr', 'employee'] },
  { divider: true },
  { label: 'My Work', header: true },
  { path: '/leave-request', name: 'Leave Request', icon: 'leave', roles: ['admin', 'hr', 'employee'] },
  { path: '/payslips', name: 'Payslips', icon: 'payslip', roles: ['admin', 'hr', 'employee'] },
  { divider: true },
  { label: 'HR', header: true },
  { path: '/employees', name: 'Employee Management', icon: 'users', roles: ['admin', 'hr'] },
  { path: '/leave-approvals', name: 'Leave Approvals', icon: 'check', roles: ['admin', 'hr'] },
  { path: '/reports', name: 'Reports', icon: 'chart', roles: ['admin', 'hr'] },
  { path: '/payroll', name: 'Payroll', icon: 'payroll', roles: ['admin', 'hr'] },
  { divider: true },
  { label: 'Admin', header: true },
  { path: '/users', name: 'User Management', icon: 'user-cog', roles: ['admin'] },
  { path: '/settings', name: 'System Settings', icon: 'settings', roles: ['admin'] },
  { path: '/audit-logs', name: 'Audit Logs', icon: 'audit', roles: ['admin'] },
]

export function getNavForRole(role) {
  return navItems.filter((item) => {
    if (item.divider || item.header) return true
    return item.roles && item.roles.includes(role)
  })
}
