const { dateKey } = require('./payrollAttendanceService')

function payrollPeriodForMonth(month, cutoff) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) {
    throw new TypeError('Payroll month must use YYYY-MM format')
  }
  if (!['first', 'second'].includes(cutoff)) throw new TypeError('cutoff must be first or second')

  const [year, monthNumber] = month.split('-').map(Number)
  const previousMonth = new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return cutoff === 'first'
    ? {
      periodStart: `${previousMonth}-26`,
      periodEnd: `${month}-10`,
      suggestedPayday: `${month}-15`,
    }
    : {
      periodStart: `${month}-11`,
      periodEnd: `${month}-25`,
      // February uses its last calendar day because there is no 30th.
      suggestedPayday: `${month}-${String(Math.min(30, lastDay)).padStart(2, '0')}`,
    }
}

function validatePayrollPeriod(periodStart, periodEnd, cutoff) {
  const start = dateKey(periodStart)
  const end = dateKey(periodEnd)
  const expected = payrollPeriodForMonth(end.slice(0, 7), cutoff)
  if (start !== expected.periodStart || end !== expected.periodEnd) {
    throw new RangeError(`${cutoff === 'first' ? '15th' : 'second'} payroll covers ${expected.periodStart} through ${expected.periodEnd}`)
  }
  return expected
}

module.exports = { payrollPeriodForMonth, validatePayrollPeriod }
