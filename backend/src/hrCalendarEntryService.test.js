const test = require('node:test')
const assert = require('node:assert/strict')
const { validateHrCalendarEntry } = require('./services/hrCalendarEntryService')

test('normalizes a valid official leave recorded by management', () => {
  const result = validateHrCalendarEntry({
    entry_type: 'leave',
    employee_id: 42,
    leave_type_name: 'Sick Leave',
    start_date: '2026-07-28',
    end_date: '2026-07-28',
    description: 'Submitted by email.',
    supporting_document_received: true,
  })

  assert.deepEqual(result.value, {
    entry_type: 'leave',
    employee_id: 42,
    title: 'Official leave',
    leave_type_name: 'Sick Leave',
    start_date: '2026-07-28',
    end_date: '2026-07-28',
    description: 'Submitted by email.',
    is_employee_visible: true,
    supporting_document_received: true,
  })
})

test('requires an employee and leave type for manual leave', () => {
  assert.equal(
    validateHrCalendarEntry({
      entry_type: 'leave',
      start_date: '2026-07-28',
      end_date: '2026-07-28',
    }).error,
    'Employee is required for an official leave'
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
  assert.equal(result.value.supporting_document_received, false)
})
