const { effectiveEarnings } = require('./payrollNightDifferentialService')
const { calculateTax } = require('./payrollCalculationService')
const CHARGE_TYPES = Object.freeze({
  sss_salary_loan: { label: 'SSS salary loan', direction: 'deduction' },
  sss_calamity_loan: { label: 'SSS calamity loan', direction: 'deduction' },
  pagibig_mpl: { label: 'Pag-IBIG MPL', direction: 'deduction' },
  pagibig_calamity: { label: 'Pag-IBIG calamity loan', direction: 'deduction' },
  pagibig_mp2: { label: 'Pag-IBIG MP2', direction: 'deduction' },
  cash_advance: { label: 'Cash advance', direction: 'deduction' },
  other_charge: { label: 'Other charge', direction: 'deduction' },
  tax_withholding: { label: 'Withholding tax (entered by HR)', direction: 'deduction' },
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
    // A note is optional; the item's type is used as its description on the payslip.
    const note = String(entry?.note || '').trim() || CHARGE_TYPES[type]?.label || ''
    if (!CHARGE_TYPES[type] || !Number.isFinite(amount) || amount === 0 ||
        Math.abs(amount) > 1000000 || (amount < 0 && type !== 'basic_pay_adjustment') ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001 || note.length > 200) {
      throw new TypeError('Each item needs a valid type and peso amount (notes up to 200 characters)')
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

// Net pay and withholding tax of a draft line. Tax follows the line's saved tax settings; a draft made
// before tax was computed has none and gets no tax until it is recalculated. An HR-entered tax
// withholding replaces the computed tax.
function draftPay(line, { manualEarnings = line.details?.manualEarnings || [],
  charges = line.details?.charges || [], employeeSss = line.employee_sss } = {}) {
  const manualTotal = effectiveEarnings(line.details, manualEarnings).reduce((sum, entry) => sum + Number(entry.amount), 0)
  const chargeTotals = summarizeCharges(charges)
  const timeDeductions = ['absence_deduction', 'late_deduction', 'undertime_deduction']
    .reduce((sum, field) => sum + Number(line[field] || 0), 0)
  const contributions = Number(employeeSss || 0) + Number(line.employee_philhealth || 0) + Number(line.employee_pagibig || 0)
  const overridden = charges.some(entry => entry.type === 'tax_withholding')
  // COLA and other non-taxable allowances stay out of taxable pay; basic corrections are in it.
  // The tax table in effect on the payday is saved with the line when the draft is calculated.
  const taxTable = line.details?.taxTable
  const tax = line.details?.taxSettings && !overridden
    ? calculateTax({ taxSettings: line.details.taxSettings, employeeContributions: contributions,
      ...(taxTable ? { taxTable: taxTable.rows } : {}),
      taxableEarnings: Number(line.gross_salary || 0) - timeDeductions + manualTotal + basicAdjustmentTotal(charges) })
    : { taxablePay: null, withholdingTax: 0 }
  const net = Number(line.gross_salary || 0) + Number(line.cola_pay || 0) +
    manualTotal + chargeTotals.earnings - timeDeductions - contributions - chargeTotals.deductions - tax.withholdingTax
  if (!Number.isFinite(net)) throw new TypeError('Payroll net pay is invalid')
  return { netPay: roundMoney(net), withholdingTax: tax.withholdingTax,
    tax: { taxablePay: tax.taxablePay, overridden, tableEffectiveFrom: taxTable?.effectiveFrom ?? null } }
}

function draftNetPay(line, options) {
  return draftPay(line, options).netPay
}

module.exports = { CHARGE_TYPES, normalizeCharges, summarizeCharges, basicAdjustmentTotal, draftPay, draftNetPay }
