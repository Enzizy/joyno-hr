function normalizeDateOnly(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/)
  if (!match) return null
  const [year, month, day] = match[1].split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }
  return match[1]
}

function validDate(value) {
  return Boolean(normalizeDateOnly(value))
}

function parseDate(value) {
  const normalized = normalizeDateOnly(value)
  if (!normalized) return null
  const [year, month, day] = normalized.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toISO(date) {
  return date.toISOString().slice(0, 10)
}

async function getPhilippineHolidays(db, from, to) {
  const normalizedFrom = normalizeDateOnly(from)
  const normalizedTo = normalizeDateOnly(to)
  if (!normalizedFrom || !normalizedTo || normalizedFrom > normalizedTo) return []
  const { rows } = await db.query(
    `SELECT id, holiday_date, name, category, is_working_day, source
     FROM philippine_holidays
     WHERE holiday_date BETWEEN $1 AND $2
     ORDER BY holiday_date ASC`,
    [normalizedFrom, normalizedTo]
  )
  return rows.map((row) => ({
    ...row,
    holiday_date: normalizeDateOnly(row.holiday_date),
  }))
}

async function countPhilippineWorkingDays(db, startDate, endDate) {
  const normalizedStart = normalizeDateOnly(startDate)
  const normalizedEnd = normalizeDateOnly(endDate)
  const start = parseDate(normalizedStart)
  const end = parseDate(normalizedEnd)
  if (!start || !end || end < start) return null
  const holidays = await getPhilippineHolidays(db, normalizedStart, normalizedEnd)
  const nonWorkingHolidays = new Set(
    holidays.filter((holiday) => !holiday.is_working_day).map((holiday) => holiday.holiday_date)
  )
  let workingDays = 0
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.getUTCDay()
    if (day === 0 || day === 6 || nonWorkingHolidays.has(toISO(date))) continue
    workingDays += 1
  }
  return workingDays
}

module.exports = {
  countPhilippineWorkingDays,
  getPhilippineHolidays,
  normalizeDateOnly,
  validDate,
}
