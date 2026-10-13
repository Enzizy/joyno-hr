// Withholding tax from a BIR semi-monthly table: base + (taxable pay - over) x rate, for the first row
// whose upTo covers the pay; the last row has no upTo. Same rule as calculateWithholdingTax in the backend.
export function withholdingTax(taxablePay, table) {
  const pay = Number(taxablePay)
  if (!Number.isFinite(pay) || !table?.length) return 0
  const row = table.find(entry => entry.upTo == null || pay <= Number(entry.upTo))
  return Math.round((Math.max(0, Number(row.base) + (pay - Number(row.over)) * Number(row.rate)) + Number.EPSILON) * 100) / 100
}

// The table in effect on a date: the newest one that started on or before it.
export function tableFor(tables, date) {
  return [...tables].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).find(table => table.effectiveFrom <= date) || null
}
