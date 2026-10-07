// Names for the adjustments HR adds to a draft (stored as charges and manual earnings).
export const DEDUCTION_TYPES = Object.freeze({
  sss_salary_loan: 'SSS salary loan',
  sss_calamity_loan: 'SSS calamity loan',
  pagibig_mpl: 'Pag-IBIG MPL',
  pagibig_calamity: 'Pag-IBIG calamity loan',
  pagibig_mp2: 'Pag-IBIG MP2',
  cash_advance: 'Cash advance',
  tax_withholding: 'Tax withholding',
  other_charge: 'Other charge',
})
export const ADDITION_TYPES = Object.freeze({
  other_non_taxable_earning: 'Allowance or reimbursement (non-taxable)',
  other: 'Other earning',
})
const OTHER_LABELS = {
  basic_pay_adjustment: 'Basic pay correction',
  night_differential: 'Night differential override',
  overtime: 'Manual overtime',
  holiday_premium: 'Manual holiday premium',
  special_holiday_pay: 'Old full holiday pay',
}
// Deductions that the company passes on to an agency rather than keeping.
export const AGENCY_FOR_DEDUCTION = Object.freeze({
  sss_salary_loan: 'sss', sss_calamity_loan: 'sss',
  pagibig_mpl: 'pagibig', pagibig_calamity: 'pagibig', pagibig_mp2: 'pagibig',
  tax_withholding: 'bir',
})

export const adjustmentLabel = type => DEDUCTION_TYPES[type] || ADDITION_TYPES[type] || OTHER_LABELS[type] || type

// Every adjustment on a pay line, signed: deductions negative, additions positive.
export function lineAdjustments(line) {
  const charges = Array.isArray(line?.details?.charges) ? line.details.charges : Array.isArray(line?.charges) ? line.charges : []
  const earnings = Array.isArray(line?.details?.manualEarnings) ? line.details.manualEarnings : []
  return [
    ...charges.map(entry => ({ type: entry.type, label: adjustmentLabel(entry.type), note: entry.note,
      amount: DEDUCTION_TYPES[entry.type] ? -Math.abs(Number(entry.amount)) : Number(entry.amount) })),
    ...earnings.map(entry => ({ type: entry.type, label: adjustmentLabel(entry.type), note: entry.note, amount: Number(entry.amount) })),
  ]
}
