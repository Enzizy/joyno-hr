export const MANAGEMENT_ROLES = Object.freeze(['admin', 'hr', 'ceo'])
export const ALL_ROLES = Object.freeze([...MANAGEMENT_ROLES, 'employee'])

export function isManagementRole(role) {
  return MANAGEMENT_ROLES.includes(String(role || '').toLowerCase())
}

export function isRoleAllowed(allowedRoles = [], role) {
  if (allowedRoles.includes(role)) return true
  return isManagementRole(role) && allowedRoles.some(isManagementRole)
}
