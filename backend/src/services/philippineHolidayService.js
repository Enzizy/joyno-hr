function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function parseDate(value) {
  if (!validDate(value)) return null
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toISO(date) {
  return date.toISOString().slice(0, 10)
}

async function getPhilippineHolidays(db, from, to) {
  if (!validDate(from) || !validDate(to) || from > to) return []
  const { rows } = await db.query(
    `SELECT id, holiday_date, name, category, is_working_day, source
     FROM philippine_holidays
     WHERE holiday_date BETWEEN $1 AND $2
     ORDER BY holiday_date ASC`,
    [from, to]
  )
  return rows.map((row) => ({
    ...row,
    holiday_date: String(row.holiday_date).slice(0, 10),
  }))
}

async function countPhilippineWorkingDays(db, startDate, endDate) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end || end < start) return null
  const holidays = await getPhilippineHolidays(db, startDate, endDate)
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
  validDate,
}
