const MANAGEMENT_ROLES = Object.freeze(['admin', 'hr', 'ceo'])
const ALL_ROLES = Object.freeze([...MANAGEMENT_ROLES, 'employee'])

function isManagementRole(role) {
  return MANAGEMENT_ROLES.includes(String(role || '').toLowerCase())
}

function isRoleAllowed(allowedRoles = [], role) {
  if (allowedRoles.includes(role)) return true
  return isManagementRole(role) && allowedRoles.some(isManagementRole)
}

module.exports = { ALL_ROLES, MANAGEMENT_ROLES, isManagementRole, isRoleAllowed }
