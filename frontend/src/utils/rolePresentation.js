const ROLE_PRESENTATION = {
  admin: { label: 'Admin', variant: 'warning', avatarClass: 'border-amber-700/60 bg-amber-950/25 text-amber-300' },
  hr: { label: 'HR', variant: 'success', avatarClass: 'border-emerald-700/60 bg-emerald-950/25 text-emerald-300' },
  ceo: { label: 'CEO', variant: 'violet', avatarClass: 'border-violet-700/60 bg-violet-950/25 text-violet-300' },
  employee: { label: 'Employee', variant: 'info', avatarClass: 'border-sky-800/60 bg-sky-950/20 text-sky-300' },
}

export function getRolePresentation(role) {
  const key = String(role || '').trim().toLowerCase()
  return ROLE_PRESENTATION[key] || {
    label: key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unknown',
    variant: 'info',
    avatarClass: 'border-gray-700 bg-gray-950 text-gray-300',
  }
}
