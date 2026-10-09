const test = require('node:test')
const assert = require('node:assert/strict')
const { scheduleProblem, scheduledPaidMinutes } = require('./services/payrollShiftService')

const schedule = (start, end, unpaidBreak = 60) => ({ work_start_time: start, work_end_time: end, unpaid_break_minutes: unpaidBreak })

test('schedules pay 4 to 8 hours; an 8-hour day keeps its one-hour lunch', () => {
  assert.equal(scheduleProblem(schedule('09:00', '18:00')), null)
  assert.equal(scheduleProblem(schedule('21:00', '06:00')), null)
  assert.equal(scheduleProblem(schedule('19:00', '01:00')), null)
  assert.equal(scheduleProblem(schedule('09:00', '15:00')), null)
  assert.match(scheduleProblem(schedule('09:00', '18:00', 0)), /4 to 8 paid hours/)
  assert.match(scheduleProblem(schedule('19:00', '22:00')), /4 to 8 paid hours/)
  assert.match(scheduleProblem(schedule('09:00', '17:00', 0)), /one-hour unpaid lunch/)
})

test('scheduled paid minutes follow the schedule, defaulting to eight hours', () => {
  assert.equal(scheduledPaidMinutes(schedule('19:00', '01:00')), 360)
  assert.equal(scheduledPaidMinutes(schedule('09:00', '18:00')), 480)
  assert.equal(scheduledPaidMinutes(schedule('09:00', '15:00')), 300)
  assert.equal(scheduledPaidMinutes({}), 480)
  assert.equal(scheduledPaidMinutes(undefined), 480)
})
