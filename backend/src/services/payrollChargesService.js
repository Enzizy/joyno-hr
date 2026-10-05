const { effectiveEarnings } = require('./payrollNightDifferentialService')
const CHARGE_TYPES = Object.freeze({
  sss_salary_loan: { label: 'SSS salary loan', direction: 'deduction' },
  sss_calamity_loan: { label: 'SSS calamity loan', direction: 'deduction' },
  pagibig_mpl: { label: 'Pag-IBIG MPL', direction: 'deduction' },
  pagibig_calamity: { label: 'Pag-IBIG calamity loan', direction: 'deduction' },
  pagibig_mp2: { label: 'Pag-IBIG MP2', direction: 'deduction' },
  cash_advance: { label: 'Cash advance', direction: 'deduction' },
  other_charge: { label: 'Other charge', direction: 'deduction' },
  tax_withholding: { label: 'HR-approved tax withholding', direction: 'deduction' },
  other_non_taxable_earning: { label: 'Other non-taxable earning', direction: 'earning' },
  basic_pay_adjustment: { label: 'Basic pay adjustment', direction: 'signed' },
})

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function normalizeCharges(charges) {
  if (!Array.isArray(charges) || charges.length > 20) {
    throw new TypeError('Provide up to 20 charges or adjustments')
  }
  return charges.map((entry) => {
    const type = String(entry?.type || '')
    const amount = Number(entry?.amount)
    const note = String(entry?.note || '').trim()
    if (!CHARGE_TYPES[type] || !Number.isFinite(amount) || amount === 0 ||
        Math.abs(amount) > 1000000 || (amount < 0 && type !== 'basic_pay_adjustment') ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001 ||
        note.length < 3 || note.length > 200) {
      throw new TypeError('Each item needs a valid type, peso amount, and a 3–200 character reason')
    }
    return { type, amount, note }
  })
}

function summarizeCharges(charges = []) {
  const summary = { earnings: 0, deductions: 0 }
  for (const entry of charges) {
    if (!CHARGE_TYPES[entry.type]) throw new TypeError('Unknown payroll charge type')
    const amount = Number(entry.amount)
    if (!Number.isFinite(amount) || amount === 0 ||
        (amount < 0 && entry.type !== 'basic_pay_adjustment')) {
      throw new TypeError('Payroll charge amount is invalid')
    }
    if (entry.type === 'basic_pay_adjustment' && amount < 0) summary.deductions += -amount
    else if (CHARGE_TYPES[entry.type].direction === 'deduction') summary.deductions += amount
    else summary.earnings += amount
  }
  return { earnings: roundMoney(summary.earnings), deductions: roundMoney(summary.deductions) }
}

function basicAdjustmentTotal(charges = []) {
  return roundMoney(charges.filter((entry) => entry.type === 'basic_pay_adjustment')
    .reduce((sum, entry) => sum + Number(entry.amount), 0))
}

function draftNetPay(line, { manualEarnings = line.details?.manualEarnings || [],
  charges = line.details?.charges || [], employeeSss = line.employee_sss } = {}) {
  const manualTotal = effectiveEarnings(line.details, manualEarnings).reduce((sum, entry) => sum + Number(entry.amount), 0)
  const chargeTotals = summarizeCharges(charges)
  const standardDeductions = ['absence_deduction', 'late_deduction', 'undertime_deduction',
    'employee_philhealth', 'employee_pagibig']
    .reduce((sum, field) => sum + Number(line[field] || 0), Number(employeeSss || 0))
  const net = Number(line.gross_salary || 0) + Number(line.cola_pay || 0) +
    manualTotal + chargeTotals.earnings - standardDeductions - chargeTotals.deductions
  if (!Number.isFinite(net)) throw new TypeError('Payroll net pay is invalid')
  return roundMoney(net)
}

module.exports = { CHARGE_TYPES, normalizeCharges, summarizeCharges, basicAdjustmentTotal, draftNetPay }
