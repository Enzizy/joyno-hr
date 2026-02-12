const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiating', 'converted', 'lost']
const LEAD_SOURCES = ['referral', 'website', 'social_media', 'cold_outreach', 'event', 'other']
const CLIENT_STATUSES = ['active', 'paused', 'inactive']
const CLIENT_PACKAGES = ['basic', 'standard', 'premium', 'enterprise', 'custom']
const LEAD_SERVICES = ['social_media', 'website_dev']
const CLIENT_SERVICES = ['social_media_management', 'website_development']
const SERVICE_STATUSES = ['not_started', 'in_progress', 'active', 'completed', 'paused']
const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'youtube']
const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled']
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent']
const AUTOMATION_SCHEDULES = ['daily', 'weekdays', 'custom']
const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function normalizeEnum(value, allowed, { defaultValue = null, allowNull = false } = {}) {
  if (value == null || value === '') return defaultValue
  const normalized = String(value).trim().toLowerCase()
  if (allowNull && !normalized) return null
  return allowed.includes(normalized) ? normalized : null
}

function normalizeServices(value, allowed) {
  const items = Array.isArray(value) ? value : []
  return [...new Set(items.map((item) => String(item || '').trim().toLowerCase()).filter((item) => allowed.includes(item)))]
}

function parsePagination(query, defaultLimit = 10, maxLimit = 50) {
  const rawLimit = Number.parseInt(query.limit, 10)
  const rawOffset = Number.parseInt(query.offset, 10)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, maxLimit)) : defaultLimit
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

function normalizeDaysOfWeek(value) {
  const items = Array.isArray(value) ? value : []
  return [...new Set(items.map((item) => String(item || '').trim().toLowerCase()).filter((item) => WEEK_DAYS.includes(item)))]
}

function calculateContractEndDate(contractStartDate, durationMonths) {
  if (!contractStartDate || !durationMonths) return null
  const start = new Date(contractStartDate)
  if (Number.isNaN(start.getTime())) return null
  start.setMonth(start.getMonth() + Number(durationMonths))
  return start.toISOString().slice(0, 10)
}

module.exports = {
  LEAD_STATUSES,
  LEAD_SOURCES,
  CLIENT_STATUSES,
  CLIENT_PACKAGES,
  LEAD_SERVICES,
  CLIENT_SERVICES,
  SERVICE_STATUSES,
  SOCIAL_PLATFORMS,
  TASK_STATUSES,
  TASK_PRIORITIES,
  AUTOMATION_SCHEDULES,
  WEEK_DAYS,
  normalizeEnum,
  normalizeServices,
  normalizeDaysOfWeek,
  parsePagination,
  calculateContractEndDate,
}
