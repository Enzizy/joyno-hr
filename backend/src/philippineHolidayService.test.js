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
