const ALL_ROLES = ['admin', 'hr', 'ceo', 'employee']
const MANAGEMENT_ROLES = ['admin', 'hr', 'ceo']

export const navGroups = [
  {
    name: 'Home',
    icon: 'dashboard',
    path: '/',
    roles: ALL_ROLES,
  },
  {
    name: 'People',
    icon: 'users',
    roles: MANAGEMENT_ROLES,
    children: [
      { path: '/employees', name: 'Employees', icon: 'users', roles: MANAGEMENT_ROLES },
      { path: '/users', name: 'User accounts', icon: 'user-cog', roles: MANAGEMENT_ROLES },
    ],
  },
  {
    name: 'Work',
    icon: 'task',
    roles: ALL_ROLES,
    children: [
      { path: '/my-tasks', name: 'My tasks', icon: 'task', roles: ['employee'] },
      { path: '/leads', name: 'Leads', icon: 'lead', roles: MANAGEMENT_ROLES, hidden: true },
      { path: '/clients', name: 'Clients', icon: 'client', roles: MANAGEMENT_ROLES, hidden: true },
      { path: '/services', name: 'Services', icon: 'service', roles: MANAGEMENT_ROLES, hidden: true },
      { path: '/tasks', name: 'Tasks & meetings', icon: 'task', roles: MANAGEMENT_ROLES },
      { path: '/automation', name: 'Automation', icon: 'automation', roles: MANAGEMENT_ROLES, hidden: true },
    ],
  },
  {
    name: 'Leave',
    icon: 'leave',
    roles: ALL_ROLES,
    children: [
      { path: '/leave-request', name: 'My leave', icon: 'leave', roles: ALL_ROLES },
      { path: '/leave-calendar', name: 'Team calendar', icon: 'chart', roles: MANAGEMENT_ROLES },
      { path: '/leave-approvals', name: 'Approvals', icon: 'check', roles: MANAGEMENT_ROLES },
    ],
  },
  {
    name: 'Insights',
    icon: 'chart',
    roles: MANAGEMENT_ROLES,
    children: [
      { path: '/reports', name: 'Leave reports', icon: 'chart', roles: MANAGEMENT_ROLES },
    ],
  },
  {
    name: 'Administration',
    icon: 'settings',
    roles: MANAGEMENT_ROLES,
    children: [
      { path: '/settings', name: 'System settings', icon: 'settings', roles: MANAGEMENT_ROLES },
      { path: '/audit-logs', name: 'Audit logs', icon: 'audit', roles: MANAGEMENT_ROLES },
    ],
  },
]

function roleAllowed(item, role) {
  return !item.roles || item.roles.includes(role)
}

export function getNavForRole(role) {
  return navGroups
    .filter((group) => roleAllowed(group, role))
    .map((group) => ({
      ...group,
      children: group.children?.filter((child) => !child.hidden && roleAllowed(child, role)) || [],
    }))
    .filter((group) => group.path || group.children.length)
}

export function getSearchNavForRole(role) {
  return getNavForRole(role).flatMap((group) => {
    if (group.path) return [{ path: group.path, name: group.name, icon: group.icon }]
    return group.children.map((child) => ({ ...child, group: group.name }))
  })
}
