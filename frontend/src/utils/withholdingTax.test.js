import test from 'node:test'
import assert from 'node:assert/strict'
import { tableFor, withholdingTax } from './withholdingTax.js'

// The workbook's 2023 table.
const table2023 = [
  { upTo: 10417, base: 0, over: 0, rate: 0 },
  { upTo: 16666, base: 0, over: 10417, rate: 0.15 },
  { upTo: 33332, base: 937.5, over: 16667, rate: 0.2 },
  { upTo: 83332, base: 4270.7, over: 33333, rate: 0.25 },
  { upTo: 333332, base: 16770.7, over: 83333, rate: 0.3 },
  { upTo: null, base: 91770.7, over: 333333, rate: 0.35 },
]

test('withholding tax matches the workbook semi-monthly table', () => {
  for (const [taxable, tax] of [[10417, 0], [11000, 87.45], [16667, 937.5], [20000, 1604.1], [40000, 5937.45], [400000, 115104.15]]) {
    assert.equal(withholdingTax(taxable, table2023), tax)
  }
})

test('a payday uses the newest table that started on or before it', () => {
  const tables = [{ effectiveFrom: '2023-01-01' }, { effectiveFrom: '2027-01-01' }]
  assert.equal(tableFor(tables, '2026-12-31').effectiveFrom, '2023-01-01')
  assert.equal(tableFor(tables, '2027-01-15').effectiveFrom, '2027-01-01')
  assert.equal(tableFor(tables, '2022-12-31'), null)
})
