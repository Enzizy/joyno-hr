const DEFAULTS = Object.freeze({
  dailyRateDivisor: 261,
  paidHoursPerDay: 8,
  monthlyWorkdays: 21.75,
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

function calculateSssAssessablePay({ firstCutoffPay, grossSalary, absenceDeduction = 0,
  lateDeduction = 0, undertimeDeduction = 0, basicAdjustment = 0, manualEarnings = [] }) {
  const first = finiteNumber(firstCutoffPay, 'firstCutoffPay')
  const gross = finiteNumber(grossSalary, 'grossSalary')
  const timeDeductions = [absenceDeduction, lateDeduction, undertimeDeduction]
    .reduce((total, value) => total + finiteNumber(value, 'timeDeduction'), 0)
  const adjustment = finiteNumber(basicAdjustment, 'basicAdjustment')
  if (first < 0 || gross < 0 || timeDeductions < 0 || !Array.isArray(manualEarnings)) {
    throw new RangeError('SSS assessable pay inputs are invalid')
  }
  const overtimePay = manualEarnings
    .filter((entry) => entry.type === 'overtime')
    .reduce((total, entry) => total + finiteNumber(entry.amount, 'overtimePay'), 0)
  const nightDifferentialPay = manualEarnings.filter(entry => entry.type === 'night_differential').reduce((total, entry) => total + finiteNumber(entry.amount, 'nightDifferentialPay'), 0)
  if (overtimePay < 0 || nightDifferentialPay < 0) throw new RangeError('Overtime and night differential cannot be negative')
  // Workbook Remittance: first cutoff + second cutoff net basic including
  // CHARGES basic-pay adjustments + OT + ND. COLA remains a separate allowance.
  // WSH/RD premium is a separate register column and is not in this lookup.
  const secondCutoffNetBasic = roundMoney(Math.max(0, gross - timeDeductions + adjustment))
  return {
    firstCutoffPay: roundMoney(first), secondCutoffNetBasic,
    overtimePay: roundMoney(overtimePay),
    ...(nightDifferentialPay ? {nightDifferentialPay:roundMoney(nightDifferentialPay)} : {}),
    monthlyCompensation: roundMoney(first + secondCutoffNetBasic + overtimePay + nightDifferentialPay),
  }
}

function calculateContributions(monthlyBasicSalary, { effectiveYear = 2025, sssCompensation } = {}) {
  const salary = finiteNumber(monthlyBasicSalary, 'monthlyBasicSalary')
  if (salary < 0) throw new RangeError('monthlyBasicSalary cannot be negative')
  if (effectiveYear < 2025) throw new RangeError('Only the 2025+ SSS contribution schedule is implemented')

  const sssBasis = sssCompensation === undefined ? salary : finiteNumber(sssCompensation, 'sssCompensation')
  const sssMsc = getSssMonthlySalaryCredit(sssBasis)
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
    sssCompensation: roundMoney(sssBasis),
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

function calculateWorkedSpecialHoliday({ monthlyBasicSalary, dailyRate: suppliedDailyRate, workedDays = 0,
  workedHours, overtimeHours = 0 }) {
  const salary = finiteNumber(monthlyBasicSalary, 'monthlyBasicSalary')
  const days = finiteNumber(workedDays, 'workedDays')
  const hoursWorked = workedHours === undefined
    ? days * DEFAULTS.paidHoursPerDay : finiteNumber(workedHours, 'workedHours')
  const hours = finiteNumber(overtimeHours, 'overtimeHours')
  const dailyRate = suppliedDailyRate === undefined
    ? salary * 12 / DEFAULTS.dailyRateDivisor : finiteNumber(suppliedDailyRate, 'dailyRate')
  if (salary < 0 || dailyRate < 0 || !Number.isInteger(days) || days < 0 || days > 31 ||
      hoursWorked < 0 || hoursWorked > 31 * DEFAULTS.paidHoursPerDay ||
      Math.abs(Math.round(hoursWorked * 100) - hoursWorked * 100) > 0.000001 ||
      hours < 0 || hours > 31 * 24 || (hours > 0 && hoursWorked === 0) ||
      Math.abs(Math.round(hours * 100) - hours * 100) > 0.000001) {
    throw new RangeError('Special-holiday days or overtime hours are invalid')
  }
  // Semi-monthly basic already includes the ordinary 100% day rate. Only the
  // extra 30% WSH/RD premium belongs in manual earnings for this pay model.
  // Approved WSH/RD overtime retains the 130% x 130% hourly multiplier.
  const holidayPremium = roundMoney(hoursWorked / DEFAULTS.paidHoursPerDay * dailyRate * 0.3)
  const overtimePay = roundMoney(hours * dailyRate / DEFAULTS.paidHoursPerDay * 1.3 * 1.3)
  return { holidayPremium, overtimePay, total: roundMoney(holidayPremium + overtimePay) }
}

function calculateAttendanceTotals(attendance, { dailyRate, hourlyRate, workdays = [1, 2, 3, 4, 5] }) {
  const daily = finiteNumber(dailyRate, 'dailyRate')
  const hourly = finiteNumber(hourlyRate, 'hourlyRate')
  let absenceDays = 0
  let paidLeaveDays = 0
  let unpaidLeaveDays = 0
  let absenceDeduction = 0
  let lateMinutes = 0
  let undertimeMinutes = 0

  for (const record of attendance || []) {
    const workDate = record.date ?? record.work_date
    if (workDate) {
      const date = new Date(`${workDate}T00:00:00Z`)
      if (Number.isNaN(date.getTime())) throw new TypeError('Attendance date must use YYYY-MM-DD format')
      if (!workdays.includes(date.getUTCDay())) continue
    }
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

    const missedLateMinutes = Math.max(0, finiteNumber(record.lateMinutes ?? record.late_minutes ?? 0, 'lateMinutes'))
    const missedMinutes = Math.max(0, finiteNumber(record.undertimeMinutes ?? record.undertime_minutes ?? 0, 'undertimeMinutes'))
    lateMinutes += missedLateMinutes
    undertimeMinutes += missedMinutes
  }

  // The workbook applies one missed-time rate to total late and undertime minutes.
  const timeDeduction = roundMoney((lateMinutes + undertimeMinutes) * hourly / 60)
  const lateDeduction = roundMoney(lateMinutes * hourly / 60)

  return {
    absenceDays: roundMinutes(absenceDays),
    paidLeaveDays: roundMinutes(paidLeaveDays),
    unpaidLeaveDays: roundMinutes(unpaidLeaveDays),
    absenceDeduction: roundMoney(absenceDeduction),
    lateMinutes: roundMinutes(lateMinutes),
    lateDeduction,
    undertimeMinutes: roundMinutes(undertimeMinutes),
    undertimeDeduction: roundMoney(timeDeduction - lateDeduction),
    // Legacy column retained for existing payroll rows; fare is outside salary payroll.
    weeklyFareAllowance: 0,
  }
}

// Workbook PAYROLL REGISTER: Total Basic Salary = basic - absences + leave w/pay
// + CHARGES basic-pay adjustment (BB), then 13th month = BB / 12 (BC). Paid leave
// never enters absenceDeduction here, and tardiness/undertime is not subtracted.
function calculateThirteenthMonthAccrual({ grossSalary, absenceDeduction = 0, basicAdjustment = 0 }) {
  const earnedBasic = roundMoney(Math.max(0, finiteNumber(grossSalary, 'grossSalary') -
    finiteNumber(absenceDeduction, 'absenceDeduction') + finiteNumber(basicAdjustment, 'basicAdjustment')))
  return roundMoney(earnedBasic / 12)
}

function calculatePayrollLine({
  monthlyBasicSalary,
  monthlyCola = 0,
  cutoff = 'first',
  includeContributions = false,
  attendance = [],
  dailyRateDivisor = DEFAULTS.dailyRateDivisor,
  paidHoursPerDay = DEFAULTS.paidHoursPerDay,
  workdays = [1, 2, 3, 4, 5],
  effectiveYear = 2025,
  sssCompensation,
}) {
  const monthlySalary = finiteNumber(monthlyBasicSalary, 'monthlyBasicSalary')
  const cola = finiteNumber(monthlyCola, 'monthlyCola')
  const divisor = finiteNumber(dailyRateDivisor, 'dailyRateDivisor')
  const paidHours = finiteNumber(paidHoursPerDay, 'paidHoursPerDay')
  if (monthlySalary < 0 || cola < 0 || divisor <= 0 || paidHours <= 0) {
    throw new RangeError('Salary must be non-negative and work-rate divisors must be positive')
  }
  if (!['first', 'second'].includes(cutoff)) throw new TypeError('cutoff must be first or second')

  const dailyRate = monthlySalary * 12 / divisor
  const hourlyRate = dailyRate / paidHours
  const grossSalary = roundMoney(monthlySalary / 2)
  // Allocate the odd cent to the first cutoff so both payslips total the
  // configured monthly COLA exactly.
  const firstColaPay = roundMoney(cola / 2)
  const colaPay = cutoff === 'first' ? firstColaPay : roundMoney(cola - firstColaPay)
  const attendanceTotals = calculateAttendanceTotals(attendance, {
    dailyRate,
    hourlyRate,
    workdays,
  })
  const contributionValues = cutoff === 'second' && includeContributions
    ? calculateContributions(monthlySalary, { effectiveYear, sssCompensation })
    : {
      schedule: DEFAULTS.contributionSchedule,
      sssCompensation: 0,
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
    attendanceTotals.absenceDeduction + attendanceTotals.lateDeduction + attendanceTotals.undertimeDeduction +
    contributionValues.sssEmployee + contributionValues.philHealthEmployee + contributionValues.pagIbigEmployee
  )

  return {
    monthlyBasicSalary: roundMoney(monthlySalary),
    monthlyCola: roundMoney(cola),
    colaPay,
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
      sssCompensation: contributionValues.sssCompensation,
      sssMsc: contributionValues.sssMsc,
      philHealth: contributionValues.philHealthBasis,
      pagIbig: contributionValues.pagIbigBasis,
      schedule: contributionValues.schedule,
    },
    thirteenthMonthAccrual: calculateThirteenthMonthAccrual({
      grossSalary, absenceDeduction: attendanceTotals.absenceDeduction,
    }),
    employeeDeductions,
    netPay: roundMoney(Math.max(0, grossSalary + colaPay - employeeDeductions)),
  }
}

module.exports = {
  DEFAULTS,
  calculateAttendanceTotals,
  calculateContributions,
  calculateSssAssessablePay,
  calculateThirteenthMonthAccrual,
  calculateWorkedSpecialHoliday,
  calculatePayrollLine,
  getSssMonthlySalaryCredit,
  roundMoney,
}
