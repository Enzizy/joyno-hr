/**
 * Role-based navigation config.
 * Each item can have roles: array of allowed roles, or omit for all authenticated.
 */
export const navItems = [
  { path: '/', name: 'Dashboard', icon: 'dashboard', roles: ['admin', 'hr', 'ceo', 'employee'] },
  { divider: true, roles: ['admin', 'hr', 'ceo', 'employee'] },
  { label: 'CRM', header: true, roles: ['admin', 'hr', 'ceo', 'employee'] },
  { path: '/leads', name: 'Leads', icon: 'lead', roles: ['admin', 'hr', 'ceo'] },
  { path: '/clients', name: 'Clients', icon: 'client', roles: ['admin', 'hr', 'ceo'] },
  { path: '/services', name: 'Services', icon: 'service', roles: ['admin', 'hr', 'ceo'] },
  { path: '/tasks', name: 'Tasks', icon: 'task', roles: ['admin', 'hr', 'ceo'] },
  { path: '/my-tasks', name: 'My Tasks', icon: 'task', roles: ['employee'] },
  { path: '/automation', name: 'Automation', icon: 'automation', roles: ['admin', 'hr', 'ceo'] },
  { divider: true, roles: ['admin', 'hr', 'ceo', 'employee'] },
  { label: 'Leave', header: true, roles: ['admin', 'hr', 'ceo', 'employee'] },
  { path: '/leave-request', name: 'Leave Request', icon: 'leave', roles: ['admin', 'hr', 'ceo', 'employee'] },
  { path: '/leave-approvals', name: 'Leave Approvals', icon: 'check', roles: ['admin', 'hr', 'ceo'] },
  { path: '/reports', name: 'Leave Reports', icon: 'chart', roles: ['admin', 'hr', 'ceo'] },
  { divider: true, roles: ['admin', 'hr', 'ceo'] },
  { label: 'Management', header: true, roles: ['admin', 'hr', 'ceo'] },
  { path: '/employees', name: 'Employee Management', icon: 'users', roles: ['admin', 'hr', 'ceo'] },
  { path: '/users', name: 'User Management', icon: 'user-cog', roles: ['admin', 'hr', 'ceo'] },
  { path: '/settings', name: 'System Settings', icon: 'settings', roles: ['admin', 'hr', 'ceo'] },
  { path: '/audit-logs', name: 'Audit Logs', icon: 'audit', roles: ['admin', 'hr', 'ceo'] },
  { divider: true, roles: ['admin', 'hr', 'ceo', 'employee'] },
  { label: 'Account', header: true, roles: ['admin', 'hr', 'ceo', 'employee'] },
  { path: '/profile', name: 'Profile', icon: 'user', roles: ['admin', 'hr', 'ceo', 'employee'] },
]

export function getNavForRole(role) {
  const visible = navItems.filter((item) => {
    if (!item.roles) return true
    return item.roles.includes(role)
  })

  const cleaned = []
  for (let i = 0; i < visible.length; i += 1) {
    const item = visible[i]
    if (item.divider) {
      const prev = cleaned[cleaned.length - 1]
      const next = visible[i + 1]
      if (!prev || prev.divider || !next || next.divider) continue
      cleaned.push(item)
      continue
    }
    if (item.header) {
      const nextLink = visible.slice(i + 1).find((candidate) => !candidate.header && !candidate.divider)
      const nextHeaderOrDivider = visible.slice(i + 1).find((candidate) => candidate.header || candidate.divider)
      if (!nextLink) continue
      if (nextHeaderOrDivider && visible.indexOf(nextLink) > visible.indexOf(nextHeaderOrDivider)) continue
      cleaned.push(item)
      continue
    }
    cleaned.push(item)
  }
  return cleaned
}
