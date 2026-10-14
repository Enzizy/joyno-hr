// "What changed" for the audit log: one { field, from, to } per field whose shown value differs.
// Values are stored as the text people see, so the log reads the same after code changes.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function blank(value) {
  return value === undefined || value === null || value === ''
}

const formats = {
  text: value => blank(value) ? '' : String(value).trim(),
  money: value => blank(value) ? '' : Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  date: value => {
    if (blank(value)) return ''
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    return String(value).slice(0, 10)
  },
  clock: value => {
    if (blank(value)) return ''
    const [h, m] = String(value).split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  },
  days: value => Array.isArray(value) ? [...value].map(Number).sort((a, b) => a - b).map(day => DAY_NAMES[day]).join(', ') : '',
  ready: value => value === false ? 'Pending' : 'Ready',
  yesNo: value => value ? 'Yes' : 'No',
}

// fields: [{ label, read: row => value, format: key of formats }]
function auditChanges(before, after, fields) {
  const changes = []
  for (const field of fields) {
    const format = formats[field.format || 'text']
    const from = before ? format(field.read(before)) : ''
    const to = format(field.read(after))
    if (from !== to) changes.push({ field: field.label, from, to })
  }
  return changes.length ? { changes } : null
}

const EMPLOYEE_FIELDS = [
  { label: 'Employee ID', read: row => row.employee_code },
  { label: 'First name', read: row => row.first_name },
  { label: 'Last name', read: row => row.last_name },
  { label: 'Department', read: row => row.department },
  { label: 'Position', read: row => row.position },
  { label: 'Shift', read: row => row.shift },
  { label: 'Date hired', read: row => row.date_hired, format: 'date' },
  { label: 'Status', read: row => row.status },
  { label: 'Last working date', read: row => row.last_working_date, format: 'date' },
  { label: 'Leave entitlement', read: row => row.leave_credits_entitlement },
]

const PAY_SETUP_FIELDS = [
  { label: 'Monthly basic', read: row => row.monthly_basic_salary, format: 'money' },
  { label: 'Monthly COLA', read: row => row.monthly_cola, format: 'money' },
  { label: 'Work starts', read: row => row.work_start_time, format: 'clock' },
  { label: 'Work ends', read: row => row.work_end_time, format: 'clock' },
  { label: 'Workdays', read: row => row.workdays, format: 'days' },
  { label: 'SSS ID', read: row => row.contribution_settings?.sss, format: 'ready' },
  { label: 'PhilHealth ID', read: row => row.contribution_settings?.philhealth, format: 'ready' },
  { label: 'Pag-IBIG ID', read: row => row.contribution_settings?.pagibig, format: 'ready' },
  { label: 'TIN', read: row => row.contribution_settings?.tin, format: 'ready' },
  { label: 'Minimum wage earner', read: row => row.minimum_wage_earner, format: 'yesNo' },
  { label: 'Tax shield', read: row => row.tax_shield, format: 'money' },
  { label: 'Attendance ID', read: row => row.biometric_person_id },
]

module.exports = { auditChanges, EMPLOYEE_FIELDS, PAY_SETUP_FIELDS }
