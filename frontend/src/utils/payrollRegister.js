import { effectiveEarnings, needsNightReview } from './payrollEarnings.js'
import { DEDUCTION_TYPES } from './payrollAdjustments.js'

export function payAmounts(line) {
  const charges = line.charges || line.details?.charges || []
  const basic = Number(line.gross_salary || 0)
  const cola = Number(line.cola_pay ?? line.colaPay ?? line.details?.colaPay ?? 0)
  const extra = effectiveEarnings(line.details).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const additions = charges.reduce((sum, item) => sum + (!DEDUCTION_TYPES[item.type] && Number(item.amount) > 0 ? Number(item.amount) : 0), 0)
  const otherDeductions = charges.reduce((sum, item) => sum + (DEDUCTION_TYPES[item.type] || Number(item.amount) < 0 ? Math.abs(Number(item.amount)) : 0), 0)
  const time = ['absence_deduction', 'late_deduction', 'undertime_deduction'].reduce((sum, key) => sum + Number(line[key] || 0), 0)
  const contributions = ['employee_sss', 'employee_philhealth', 'employee_pagibig'].reduce((sum, key) => sum + Number(line[key] || 0), 0)
  return { basic, cola, extra, additions, otherDeductions, time, contributions,
    earnings: basic + cola + extra + additions, deductions: time + contributions + otherDeductions,
    net: Number(line.net_pay || 0) }
}

export function payAttention(line) {
  return [Number(line.net_pay) <= 0 && 'Zero or negative net pay',
    needsNightReview(line) && 'Night differential needs verification',
    line.details?.payBasisReview?.required && !line.details.payBasisReview.verifiedReason && 'Cutoff basic pay needs verification',
    (line.details?.manualEarnings || []).some(item => item.type === 'special_holiday_pay') && 'Old holiday adjustment needs replacing',
  ].filter(Boolean)
}
