const db = require('../db')

const POLICY_COLUMNS = `
  id, name, paid_days_per_year, min_months_employed, filing_notice_days,
  requires_attachment_for_paid, remarks, is_employee_requestable, updated_at
`

const POLICY_ALIASES = {
  vacation_leave: ['vacation'],
  sick_leave: ['sick'],
  bereavement_leave: ['bereavement'],
  service_incentive_leave: ['sil', 'service incentive'],
  emergency_leave: ['emergency'],
}

function normalizePolicy(row) {
  return {
    ...row,
    paid_days_per_year: Number(row.paid_days_per_year || 0),
    min_months_employed: Number(row.min_months_employed || 0),
    filing_notice_days: Number(row.filing_notice_days || 0),
    requires_attachment_for_paid: Boolean(row.requires_attachment_for_paid),
    is_employee_requestable: Boolean(row.is_employee_requestable),
    aliases: POLICY_ALIASES[row.id] || [],
  }
}

function nonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

function nonNegativeInteger(value, fallback = 0) {
  return Math.trunc(nonNegativeNumber(value, fallback))
}

async function getLeavePolicies({ includeRestricted = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${POLICY_COLUMNS}
     FROM leave_policies
     ${includeRestricted ? '' : 'WHERE is_employee_requestable = TRUE'}
     ORDER BY name ASC`
  )
  return rows.map(normalizePolicy)
}

async function resolveLeaveType(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  const policies = await getLeavePolicies({ includeRestricted: true })
  return policies.find((policy) =>
    policy.id.toLowerCase() === raw ||
    policy.name.toLowerCase() === raw ||
    policy.aliases.some((alias) => alias.toLowerCase() === raw)
  ) || null
}

async function updateLeavePolicy(id, input, userId) {
  const paidDays = nonNegativeNumber(input.paid_days_per_year)
  const minimumMonths = nonNegativeInteger(input.min_months_employed)
  const noticeDays = nonNegativeInteger(input.filing_notice_days)
  const remarks = String(input.remarks || '').trim().slice(0, 1000)
  const { rows } = await db.query(
    `UPDATE leave_policies
     SET paid_days_per_year = $1, min_months_employed = $2, filing_notice_days = $3,
         requires_attachment_for_paid = $4, remarks = $5, updated_by = $6, updated_at = NOW()
     WHERE id = $7
     RETURNING ${POLICY_COLUMNS}`,
    [paidDays, minimumMonths, noticeDays, Boolean(input.requires_attachment_for_paid), remarks, userId, id]
  )
  return rows[0] ? normalizePolicy(rows[0]) : null
}

async function getLeavePolicySettings() {
  const { rows } = await db.query(
    `SELECT probationary_months, probationary_leave_type_id, availability_warning_threshold, updated_at
     FROM leave_policy_settings WHERE id = 1`
  )
  const row = rows[0] || {}
  return {
    probationary_months: Number(row.probationary_months ?? 6),
    probationary_leave_type_id: row.probationary_leave_type_id || 'leave_of_absence',
    availability_warning_threshold: Number(row.availability_warning_threshold ?? 2),
    updated_at: row.updated_at || null,
  }
}

async function updateLeavePolicySettings(input, userId) {
  const months = nonNegativeInteger(input.probationary_months, 6)
  const threshold = Math.max(1, nonNegativeInteger(input.availability_warning_threshold, 2))
  const leaveType = await resolveLeaveType(input.probationary_leave_type_id || 'leave_of_absence')
  if (!leaveType?.is_employee_requestable) return null
  const { rows } = await db.query(
    `UPDATE leave_policy_settings
     SET probationary_months = $1, probationary_leave_type_id = $2,
         availability_warning_threshold = $3, updated_by = $4, updated_at = NOW()
     WHERE id = 1
     RETURNING probationary_months, probationary_leave_type_id, availability_warning_threshold, updated_at`,
    [months, leaveType.id, threshold, userId]
  )
  return rows[0] || null
}

async function resolveEffectiveLeaveType(selectedType, dateHired, asOfDate, calculateTenureMonths) {
  const settings = await getLeavePolicySettings()
  const months = calculateTenureMonths(dateHired, asOfDate)
  if (months >= settings.probationary_months) return selectedType
  return resolveLeaveType(settings.probationary_leave_type_id)
}

module.exports = {
  getLeavePolicies,
  getLeavePolicySettings,
  resolveEffectiveLeaveType,
  resolveLeaveType,
  updateLeavePolicy,
  updateLeavePolicySettings,
}
