const LEAVE_TYPE_VARIANTS = {
  'vacation leave': 'success',
  'sick leave': 'info',
  'bereavement leave': 'violet',
  'service incentive leave': 'warning',
  'leave of absence': 'neutral',
  'emergency leave': 'orange',
  awol: 'danger',
}

export function getLeaveTypePresentation(leaveType) {
  const label = String(leaveType || '').trim() || 'Leave'
  return {
    label,
    variant: LEAVE_TYPE_VARIANTS[label.toLowerCase()] || 'neutral',
  }
}
