// Plain words for audit log entries, shared by the Audit log page and each employee's History.

const ACTION_LABELS = {
  create_employee: 'Added employee', update_employee: 'Edited employee details', delete_employee: 'Deleted employee',
  set_employee_awol: 'Recorded AWOL',
  payroll_profile_created: 'Saved schedule & pay', payroll_profile_updated: 'Changed schedule & pay',
  create_leave_request: 'Filed leave', update_leave_request: 'Edited leave request', approve_leave_request: 'Approved leave',
  reject_leave_request: 'Rejected leave', delete_leave_request: 'Withdrew leave', delete_leave_request_admin: 'Deleted leave request',
  create_official_hr_recorded_leave: 'Recorded leave for employee', add_leave_comment: 'Commented on leave',
  mark_valid: 'Accepted leave document', upload_leave_attachment_replacement: 'Uploaded replacement document',
  create_user: 'Created login', delete_user: 'Deleted login',
  payroll_draft_created: 'Calculated pay', payroll_draft_refreshed: 'Recalculated pay', payroll_charges_updated: 'Adjusted pay',
  payroll_approved: 'Approved pay', payroll_locked: 'Released payslips', payroll_payment_recorded: 'Recorded payment',
  payroll_first_cutoff_pay_overridden: 'Corrected 15th pay for SSS', payroll_tax_table_saved: 'Saved tax rates',
  payroll_tax_table_removed: 'Removed tax rates', import_payroll_attendance: 'Imported attendance',
  create_task: 'Created task', start_task: 'Started task', complete_task: 'Completed task', cancel_task: 'Cancelled task',
  create_announcement_draft: 'Drafted announcement', publish_announcement: 'Published announcement', archive_announcement: 'Archived announcement',
  create_hr_calendar_entry: 'Added calendar note', delete_hr_calendar_entry: 'Removed calendar note',
}

export const AUDIT_CATEGORIES = [
  { value: 'employees', label: 'Employee details' },
  { value: 'pay', label: 'Schedule & pay' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'leave', label: 'Leave' },
  { value: 'accounts', label: 'Logins' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'announcements', label: 'Announcements' },
]

const titleize = text => String(text || '').replace(/_/g, ' ').replace(/^\w/, letter => letter.toUpperCase())

export function auditAction(row) {
  return ACTION_LABELS[row.action] || titleize(row.action) || 'Changed'
}

export function auditActor(row) {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim()
  return name || row.email || (row.user_id ? `User #${row.user_id}` : 'Deleted account')
}

const shortDate = value => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`))

// Who or what the entry is about, by name where the record still exists.
export function auditTarget(row) {
  switch (row.target_table) {
    case 'employees':
    case 'payroll_employee_profiles':
      return row.target_employee_name || 'Removed employee'
    case 'users': return row.target_user_email || 'Removed login'
    case 'leave_requests': return [row.target_leave_employee_name, row.target_leave_type_name].filter(Boolean).join(' · ') || 'Removed leave request'
    case 'payroll_runs': return row.target_payday ? `${shortDate(row.target_payday)} payday` : 'Pay run'
    case 'tasks': return row.target_title || 'Removed task'
    case 'announcements': return row.target_announcement_title || 'Announcement'
    case 'payroll_tax_tables': return 'Withholding tax rates'
    case 'payroll_attendance_batches': return 'Attendance file'
    case 'hr_calendar_entries': return 'Leave calendar'
    default: return titleize(row.target_table)
  }
}

// "Monthly basic: 15,000.00 → 16,000.00", one line per changed field.
export function auditChanges(row) {
  const changes = row.details?.changes
  if (!Array.isArray(changes)) return []
  return changes.map(change => change.from === '' ? `${change.field}: ${change.to || '—'}` : `${change.field}: ${change.from} → ${change.to || '—'}`)
}

export function auditTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
}
