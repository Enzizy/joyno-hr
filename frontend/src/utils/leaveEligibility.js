export function currentManilaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function isPaidLeaveEligible(dateHired, asOf = currentManilaDate(), minimumMonths = 0) {
  if (!dateHired || !asOf) return false
  const dateKey = (value) => value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value).slice(0, 10)
  const hired = dateKey(dateHired)
  const reference = dateKey(asOf)
  const valid = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
  if (!valid(hired) || !valid(reference)) return false
  const [year, month, day] = hired.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + Math.max(0, Math.trunc(Number(minimumMonths) || 0)), 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return reference >= target.toISOString().slice(0, 10)
}
