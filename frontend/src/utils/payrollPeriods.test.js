import test from 'node:test'
import assert from 'node:assert/strict'
import { standardPeriod, coversWorkDates, formatWorkRange, matchingAttendanceReviews, attendanceSelection } from './payrollPeriods.js'

test('15th payroll carries the previous month and year into attendance work dates', () => {
  assert.deepEqual(standardPeriod('2027-01', 'first'), { start: '2026-12-26', end: '2027-01-10', payday: '2027-01-15' })
})
test('custom work dates survive a page reload and invalid calendar dates fall back to a standard cutoff', () => {
  assert.deepEqual(attendanceSelection({ cutoff: 'custom', firstWorkDate: '2026-09-01', lastWorkDate: '2026-09-30' }, '2026-10'), { month: '2026-09', cycle: 'custom', start: '2026-09-01', end: '2026-09-30' })
  assert.deepEqual(attendanceSelection({ payrollMonth: '2026-10', cutoff: 'first' }, '2026-10'), { month: '2026-10', cycle: 'first', start: '2026-09-26', end: '2026-10-10' })
  assert.equal(attendanceSelection({ cutoff: 'custom', firstWorkDate: '2026-02-30', lastWorkDate: '2026-03-01' }, '2026-10').cycle, 'second')
})
test('payroll automatically prefers the newest confirmed review for its actual work dates', () => {
  const reviews = [
    { id: 1, period_start: '2026-09-11', period_end: '2026-09-25', review_state: 'confirmed' },
    { id: 2, period_start: '2026-10-11', period_end: '2026-10-25', review_state: 'confirmed' },
    { id: 3, period_start: '2026-10-01', period_end: '2026-10-31', review_state: 'confirmed' },
    { id: 4, period_start: '2026-10-11', period_end: '2026-10-25', review_state: 'draft' },
  ]
  assert.deepEqual(matchingAttendanceReviews(reviews, '2026-10-11', '2026-10-25').map(r => r.id), [3, 2])
  assert.deepEqual(matchingAttendanceReviews(reviews, '2026-10-11', '2026-10-25', false).map(r => r.id), [4])
  assert.deepEqual(matchingAttendanceReviews(reviews, '2026-09-26', '2026-10-10'), [])
})
test('month-end payroll handles February and does not include dates after the 25th', () => {
  assert.deepEqual(standardPeriod('2028-02', 'second'), { start: '2028-02-11', end: '2028-02-25', payday: '2028-02-29' })
  assert.equal(standardPeriod('2026-13', 'second'), null)
  assert.equal(standardPeriod('2026-10', 'custom'), null)
})
test('an attendance review must cover the whole payroll cutoff', () => {
  assert.equal(coversWorkDates({ period_start: '2026-09-11', period_end: '2026-09-25' }, '2026-10-11', '2026-10-25'), false)
  assert.equal(coversWorkDates({ period_start: '2026-10-12', period_end: '2026-10-25' }, '2026-10-11', '2026-10-25'), false)
  assert.equal(coversWorkDates({ period_start: '2026-10-01', period_end: '2026-10-31' }, '2026-10-11', '2026-10-25'), true)
  assert.match(formatWorkRange('2026-10-11', '2026-10-25'), /Oct 11, 2026.*Oct 25, 2026/)
})
