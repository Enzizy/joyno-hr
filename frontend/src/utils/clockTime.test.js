import test from 'node:test'
import assert from 'node:assert/strict'
import { clockLabel, clockTime, twelveHourText } from './clockTime.js'

test('clock times show on the 12-hour clock', () => {
  assert.equal(clockLabel('19:02'), '7:02 PM')
  assert.equal(clockLabel('00:07:00'), '12:07 AM')
  assert.equal(clockLabel('12:00'), '12:00 PM')
  assert.equal(clockLabel('09:04'), '9:04 AM')
  assert.equal(clockLabel('Not configured'), 'Not configured')
  assert.equal(clockTime('2026-09-17T10:59:00.000Z'), '6:59 PM')
  assert.equal(clockTime('2026-09-18T16:02:00.000Z'), '12:02 AM')
  assert.equal(clockTime(null), '')
})

test('times inside server text are rewritten, other numbers are left alone', () => {
  assert.equal(twelveHourText('19:00–01:00 next day'), '7:00 PM–1:00 AM next day')
  assert.equal(twelveHourText('Real times entered: 08:47–22:00 · special holiday / rest day · 4 h approved OT'),
    'Real times entered: 8:47 AM–10:00 PM · special holiday / rest day · 4 h approved OT')
  assert.equal(twelveHourText('Did not come to work on 2026-09-16'), 'Did not come to work on 2026-09-16')
  assert.equal(twelveHourText(null), '')
})
