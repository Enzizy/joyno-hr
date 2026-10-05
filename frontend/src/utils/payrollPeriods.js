export function standardPeriod(monthKey, type) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) || !['first', 'second'].includes(type)) return null
  const [year, month] = monthKey.split('-').map(Number)
  const previousMonth = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    start: type === 'first' ? `${previousMonth}-26` : `${monthKey}-11`,
    end: type === 'first' ? `${monthKey}-10` : `${monthKey}-25`,
    payday: type === 'first' ? `${monthKey}-15` : `${monthKey}-${String(Math.min(30, lastDay)).padStart(2, '0')}`,
  }
}

export function formatWorkDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' }).format(date)
}

export function formatWorkRange(start, end) {
  return `${formatWorkDate(start)} – ${formatWorkDate(end)}`
}

export function coversWorkDates(review, start, end) {
  return Boolean(start && end && review?.period_start <= start && review?.period_end >= end)
}

export function matchingAttendanceReviews(reviews, start, end, confirmed = true) {
  return reviews.filter(review => (review.review_state === 'confirmed') === confirmed && (!confirmed || !review.scope_needs_refresh) && coversWorkDates(review, start, end))
    .sort((a, b) => Number(b.id) - Number(a.id))
}

export function attendanceSelection(query, fallbackMonth) {
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  if (query.cutoff === 'custom' && validDate(query.firstWorkDate) && validDate(query.lastWorkDate) && query.firstWorkDate <= query.lastWorkDate) {
    return { month: query.lastWorkDate.slice(0, 7), cycle: 'custom', start: query.firstWorkDate, end: query.lastWorkDate }
  }
  const cycle = query.cutoff === 'first' ? 'first' : 'second'
  const period = standardPeriod(String(query.payrollMonth || fallbackMonth), cycle) || standardPeriod(fallbackMonth, cycle)
  return { month: period.end.slice(0, 7), cycle, start: period.start, end: period.end }
}
