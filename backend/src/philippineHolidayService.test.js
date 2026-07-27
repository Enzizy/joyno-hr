const test = require('node:test')
const assert = require('node:assert/strict')
const { countPhilippineWorkingDays } = require('./services/philippineHolidayService')

function holidayDb(rows = []) {
  return {
    async query() {
      return { rows }
    },
  }
}

test('counts Friday to Monday as two working days', async () => {
  const days = await countPhilippineWorkingDays(
    holidayDb(),
    '2026-07-24',
    '2026-07-27'
  )
  assert.equal(days, 2)
})

test('excludes a non-working Philippine holiday between leave dates', async () => {
  const days = await countPhilippineWorkingDays(
    holidayDb([{
      holiday_date: '2026-08-21',
      name: 'Ninoy Aquino Day',
      category: 'special_non_working',
      is_working_day: false,
    }]),
    '2026-08-20',
    '2026-08-24'
  )
  assert.equal(days, 2)
})

test('does not exclude a special working holiday', async () => {
  const days = await countPhilippineWorkingDays(
    holidayDb([{
      holiday_date: '2026-02-25',
      name: 'EDSA People Power Revolution Anniversary',
      category: 'special_working',
      is_working_day: true,
    }]),
    '2026-02-25',
    '2026-02-25'
  )
  assert.equal(days, 1)
})

test('accepts PostgreSQL date values represented as Date objects', async () => {
  const days = await countPhilippineWorkingDays(
    holidayDb(),
    new Date(2026, 6, 27),
    new Date(2026, 6, 27)
  )
  assert.equal(days, 1)
})

test('accepts timestamp-form date strings returned by a database driver', async () => {
  const days = await countPhilippineWorkingDays(
    holidayDb(),
    '2026-07-27T00:00:00.000Z',
    '2026-07-27T00:00:00.000Z'
  )
  assert.equal(days, 1)
})
