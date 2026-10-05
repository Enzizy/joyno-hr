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

test('requires the source and reason for management-recorded leave', () => {
  assert.equal(
    validateHrCalendarEntry({
      entry_type: 'leave',
      employee_id: 42,
      leave_type_name: 'Sick Leave',
      start_date: '2026-07-28',
      end_date: '2026-07-28',
    }).error,
    'Record how the leave request was received and the reason provided'
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
test('half-day official leave requires one date and real time coverage, while notes ignore duration',()=>{
 const entry={entry_type:'leave',employee_id:7,leave_type_name:'Vacation Leave',start_date:'2026-09-21',end_date:'2026-09-21',description:'Paper request received by HR',day_fraction:.5,coverage_start:'14:00',coverage_end:'18:00'}
 assert.equal(validateHrCalendarEntry(entry).value.day_fraction,.5)
 assert.match(validateHrCalendarEntry({...entry,coverage_end:'25:00'}).error,/valid covered/)
 assert.match(validateHrCalendarEntry({...entry,end_date:'2026-09-22'}).error,/one date/)
 assert.equal(validateHrCalendarEntry({...entry,entry_type:'note',title:'HR office record'}).value.day_fraction,undefined)
})
