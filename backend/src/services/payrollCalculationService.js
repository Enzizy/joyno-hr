const DEFAULTS = Object.freeze({
  dailyRateDivisor: 261,
  paidHoursPerDay: 8,
  monthlyWorkdays: 21.75,
  fareLateDeductionPerMinute: 5,
  sssEmployeeRate: 0.05,
  sssEmployerRate: 0.10,
  philHealthRate: 0.05,
  pagIbigEmployeeRateBelowThreshold: 0.01,
  pagIbigEmployeeRateAboveThreshold: 0.02,
  pagIbigEmployerRate: 0.02,
  pagIbigThreshold: 1500,
  pagIbigSalaryCap: 10000,
  philHealthSalaryFloor: 10000,
  philHealthSalaryCap: 100000,
  contributionSchedule: 'PH-2025',
})

function finiteNumber(value, name) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} must be a finite number`)
  return parsed
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function roundMinutes(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getSssMonthlySalaryCredit(monthlyCompensation) {
  const compensation = finiteNumber(monthlyCompensation, 'monthlyCompensation')
  if (compensation < 0) throw new RangeError('monthlyCompensation cannot be negative')
  const roundedBracket = Math.floor((compensation + 250) / 500) * 500
  return clamp(roundedBracket, 5000, 35000)
}

function calculateContributions(monthlyBasicSalary, { effectiveYear = 2025 } = {}) {
  const salary = finiteNumber(monthlyBasicSalary, 'monthlyBasicSalary')
  if (salary < 0) throw new RangeError('monthlyBasicSalary cannot be negative')
  if (effectiveYear < 2025) throw new RangeError('Only the 2025+ SSS contribution schedule is implemented')

  const sssMsc = getSssMonthlySalaryCredit(salary)
  const sssEmployee = roundMoney(sssMsc * DEFAULTS.sssEmployeeRate)
  const sssEmployer = roundMoney(sssMsc * DEFAULTS.sssEmployerRate)
  const sssEmployerEc = sssMsc <= 14500 ? 10 : 30
  const philHealthBasis = clamp(salary, DEFAULTS.philHealthSalaryFloor, DEFAULTS.philHealthSalaryCap)
  const philHealthTotal = roundMoney(philHealthBasis * DEFAULTS.philHealthRate)
  const pagIbigBasis = Math.min(salary, DEFAULTS.pagIbigSalaryCap)
  const pagIbigEmployeeRate = salary <= DEFAULTS.pagIbigThreshold
    ? DEFAULTS.pagIbigEmployeeRateBelowThreshold
    : DEFAULTS.pagIbigEmployeeRateAboveThreshold

  return {
    schedule: DEFAULTS.contributionSchedule,
    sssMsc,
    sssEmployee,
    sssEmployer,
    sssEmployerEc,
    philHealthBasis,
    philHealthEmployee: roundMoney(philHealthTotal / 2),
    philHealthEmployer: roundMoney(philHealthTotal / 2),
    pagIbigBasis,
    pagIbigEmployee: roundMoney(pagIbigBasis * pagIbigEmployeeRate),
    pagIbigEmployer: roundMoney(pagIbigBasis * DEFAULTS.pagIbigEmployerRate),
  }
}

function calculateAttendanceTotals(attendance, { dailyRate, hourlyRate, dailyFareRate }) {
  const daily = finiteNumber(dailyRate, 'dailyRate')
  const hourly = finiteNumber(hourlyRate, 'hourlyRate')
  const fare = finiteNumber(dailyFareRate || 0, 'dailyFareRate')
  let absenceDays = 0
  let paidLeaveDays = 0
  let unpaidLeaveDays = 0
  let absenceDeduction = 0
  let undertimeMinutes = 0
  let undertimeDeduction = 0
  let weeklyFareAllowance = 0

  for (const record of attendance || []) {
    if (record.status === 'absent') {
      absenceDays += 1
      absenceDeduction += daily
      continue
    }
    if (record.status === 'paid_leave') {
      paidLeaveDays += 1
      continue
    }
    if (record.status === 'unpaid_leave' || record.status === 'partial_leave') {
      const unpaidFraction = record.status === 'unpaid_leave'
        ? 1
        : clamp(finiteNumber(record.leaveDeductionFraction ?? record.leave_deduction_fraction ?? 0.5, 'leaveDeductionFraction'), 0, 1)
      unpaidLeaveDays += unpaidFraction
      absenceDeduction += daily * unpaidFraction
      continue
    }
    // Incomplete scans require HR review and must not be guessed into a deduction.
    if (record.status !== 'present') continue

    const lateMinutes = Math.max(0, finiteNumber(record.lateMinutes ?? record.late_minutes ?? 0, 'lateMinutes'))
    const missedMinutes = Math.max(0, finiteNumber(record.undertimeMinutes ?? record.undertime_minutes ?? 0, 'undertimeMinutes'))
    undertimeMinutes += missedMinutes
    undertimeDeduction += missedMinutes * hourly / 60
    weeklyFareAllowance += Math.max(0, fare - lateMinutes * DEFAULTS.fareLateDeductionPerMinute)
  }

  return {
    absenceDays: roundMinutes(absenceDays),
    paidLeaveDays: roundMinutes(paidLeaveDays),
    unpaidLeaveDays: roundMinutes(unpaidLeaveDays),
    absenceDeduction: roundMoney(absenceDeduction),
    undertimeMinutes: roundMinutes(undertimeMinutes),
    undertimeDeduction: roundMoney(undertimeDeduction),
    weeklyFareAllowance: roundMoney(weeklyFareAllowance),
  }
}

function calculatePayrollLine({
  monthlyBasicSalary,
  dailyFareRate = 0,
  cutoff = 'first',
  includeContributions = false,
  attendance = [],
  dailyRateDivisor = DEFAULTS.dailyRateDivisor,
  paidHoursPerDay = DEFAULTS.paidHoursPerDay,
  effectiveYear = 2025,
}) {
  const monthlySalary = finiteNumber(monthlyBasicSalary, 'monthlyBasicSalary')
  const divisor = finiteNumber(dailyRateDivisor, 'dailyRateDivisor')
  const paidHours = finiteNumber(paidHoursPerDay, 'paidHoursPerDay')
  if (monthlySalary < 0 || divisor <= 0 || paidHours <= 0) {
    throw new RangeError('Salary must be non-negative and work-rate divisors must be positive')
  }
  if (!['first', 'second'].includes(cutoff)) throw new TypeError('cutoff must be first or second')

  const dailyRate = monthlySalary * 12 / divisor
  const hourlyRate = dailyRate / paidHours
  const grossSalary = roundMoney(monthlySalary / 2)
  const attendanceTotals = calculateAttendanceTotals(attendance, {
    dailyRate,
    hourlyRate,
    dailyFareRate,
  })
  const earnedBasic = Math.max(0, grossSalary - attendanceTotals.absenceDeduction - attendanceTotals.undertimeDeduction)
  const contributionValues = cutoff === 'second' && includeContributions
    ? calculateContributions(monthlySalary, { effectiveYear })
    : {
      schedule: DEFAULTS.contributionSchedule,
      sssMsc: 0,
      sssEmployee: 0,
      sssEmployer: 0,
      sssEmployerEc: 0,
      philHealthBasis: 0,
      philHealthEmployee: 0,
      philHealthEmployer: 0,
      pagIbigBasis: 0,
      pagIbigEmployee: 0,
      pagIbigEmployer: 0,
    }
  const employeeDeductions = roundMoney(
    attendanceTotals.absenceDeduction + attendanceTotals.undertimeDeduction +
    contributionValues.sssEmployee + contributionValues.philHealthEmployee + contributionValues.pagIbigEmployee
  )

  return {
    monthlyBasicSalary: roundMoney(monthlySalary),
    dailyRate: roundMoney(dailyRate),
    hourlyRate: roundMoney(hourlyRate),
    grossSalary,
    ...attendanceTotals,
    employeeSss: contributionValues.sssEmployee,
    employerSss: contributionValues.sssEmployer,
    employerEc: contributionValues.sssEmployerEc,
    employeePhilhealth: contributionValues.philHealthEmployee,
    employerPhilhealth: contributionValues.philHealthEmployer,
    employeePagibig: contributionValues.pagIbigEmployee,
    employerPagibig: contributionValues.pagIbigEmployer,
    contributionBasis: {
      sssMsc: contributionValues.sssMsc,
      philHealth: contributionValues.philHealthBasis,
      pagIbig: contributionValues.pagIbigBasis,
      schedule: contributionValues.schedule,
    },
    thirteenthMonthAccrual: roundMoney(earnedBasic / 12),
    employeeDeductions,
    netPay: roundMoney(Math.max(0, grossSalary - employeeDeductions)),
  }
}

module.exports = {
  DEFAULTS,
  calculateAttendanceTotals,
  calculateContributions,
  calculatePayrollLine,
  getSssMonthlySalaryCredit,
  roundMoney,
}
