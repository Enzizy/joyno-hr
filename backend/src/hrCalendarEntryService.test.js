const test = require('node:test')
const assert = require('node:assert/strict')
const { validateHrCalendarEntry } = require('./services/hrCalendarEntryService')

test('normalizes a valid HR-recorded leave', () => {
  const result = validateHrCalendarEntry({
    entry_type: 'leave',
    employee_id: 42,
    leave_type_name: 'Sick Leave',
    start_date: '2026-07-28',
    end_date: '2026-07-28',
    description: 'Submitted by email.',
    is_employee_visible: true,
  })

  assert.deepEqual(result.value, {
    entry_type: 'leave',
    employee_id: 42,
    title: 'HR-recorded leave',
    leave_type_name: 'Sick Leave',
    start_date: '2026-07-28',
    end_date: '2026-07-28',
    description: 'Submitted by email.',
    is_employee_visible: true,
  })
})

test('requires an employee and leave type for manual leave', () => {
  assert.equal(
    validateHrCalendarEntry({
      entry_type: 'leave',
      start_date: '2026-07-28',
      end_date: '2026-07-28',
    }).error,
    'Employee is required for an HR-recorded leave'
  )
})

test('creates management-only notes by default', () => {
  const result = validateHrCalendarEntry({
    entry_type: 'note',
    title: 'Written leave letter received',
    start_date: '2026-08-03',
    end_date: '2026-08-03',
  })

  assert.equal(result.value.title, 'Written leave letter received')
  assert.equal(result.value.employee_id, null)
  assert.equal(result.value.is_employee_visible, false)
})
