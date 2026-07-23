const DEPARTMENT_VARIANTS = {
  marketing: 'violet',
  it: 'info',
  sales: 'success',
  admin: 'warning',
}

export function getDepartmentPresentation(department) {
  const value = String(department || '').trim()
  return {
    label: value.toLowerCase() === 'it' ? 'IT' : value || 'Unassigned',
    variant: DEPARTMENT_VARIANTS[value.toLowerCase()] || 'info',
  }
}

export function getShiftPresentation(shift) {
  const value = String(shift || 'day').trim().toLowerCase()
  return {
    label: value === 'night' ? 'Night' : 'Day',
    variant: value === 'night' ? 'violet' : 'warning',
  }
}
