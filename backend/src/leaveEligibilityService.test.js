const test = require('node:test')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const { eligibilityDate, isPaidLeaveEligible, currentManilaDate } = require('./services/leaveEligibilityService')

const cases = [
  ['2026-01-15', '2026-04-14', 3, false],
  ['2026-01-15', '2026-04-15', 3, true],
  ['2026-01-15', '2027-01-14', 12, false],
  ['2026-01-15', '2027-01-15', 12, true],
  ['2026-01-31', '2026-04-29', 3, false],
  ['2026-01-31', '2026-04-30', 3, true],
  ['2024-02-29', '2025-02-28', 12, true],
  [null, '2026-10-02', 3, false],
  ['invalid', '2026-10-02', 3, false],
  ['2026-02-30', '2026-10-02', 3, false],
]

test('backend and frontend use the same calendar eligibility boundaries', async () => {
  const frontend = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/leaveEligibility.js')).href)
  for (const [hired, asOf, months, expected] of cases) {
    assert.equal(isPaidLeaveEligible(hired, asOf, months), expected, `${hired}: ${asOf}`)
    assert.equal(frontend.isPaidLeaveEligible(hired, asOf, months), expected, `frontend ${hired}: ${asOf}`)
  }
  assert.equal(eligibilityDate('2026-01-31', 3), '2026-04-30')
})

test('credit dates follow Manila across UTC midnight', () => {
  assert.equal(currentManilaDate(new Date('2026-12-31T16:00:00Z')), '2027-01-01')
})
