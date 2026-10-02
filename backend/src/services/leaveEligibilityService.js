const { normalizeDateOnly } = require('./philippineHolidayService')

function currentManilaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function eligibilityDate(dateHired, minimumMonths = 0) {
  const date = normalizeDateOnly(dateHired)
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  const months = Math.max(0, Math.trunc(Number(minimumMonths) || 0))
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

function isPaidLeaveEligible(dateHired, asOf = currentManilaDate(), minimumMonths = 0) {
  const eligibleOn = eligibilityDate(dateHired, minimumMonths)
  const referenceDate = normalizeDateOnly(asOf)
  return Boolean(eligibleOn && referenceDate && referenceDate >= eligibleOn)
}

module.exports = { currentManilaDate, eligibilityDate, isPaidLeaveEligible }
