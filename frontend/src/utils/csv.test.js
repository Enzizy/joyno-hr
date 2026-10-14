import test from 'node:test'
import assert from 'node:assert/strict'
import { toCsv } from './csv.js'

test('CSV quotes commas and quotes, keeps numbers, and defuses formulas', () => {
  assert.equal(toCsv(['Name', 'Amount'], [['Cruz, Juan', 1250.5], ['=HYPERLINK("x")', -3], ['He said "hi"', null]]),
    'Name,Amount\r\n"Cruz, Juan",1250.5\r\n"\'=HYPERLINK(""x"")",-3\r\n"He said ""hi""",')
})
