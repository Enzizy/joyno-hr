const { normalizeDateOnly } = require('./philippineHolidayService')

const ENTRY_TYPES = new Set(['leave', 'note'])

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function validateHrCalendarEntry(input = {}) {
  const entryType = cleanText(input.entry_type, 20).toLowerCase()
  const startDate = normalizeDateOnly(input.start_date)
  const endDate = normalizeDateOnly(input.end_date)
  const description = cleanText(input.description, 500)
  const parsedEmployeeId = Number(input.employee_id)
  const employeeId = Number.isInteger(parsedEmployeeId) && parsedEmployeeId > 0 ? parsedEmployeeId : null
  const leaveTypeName = cleanText(input.leave_type_name, 120)
  const noteTitle = cleanText(input.title, 160)

  if (!ENTRY_TYPES.has(entryType)) {
    return { error: 'Entry type must be leave or note' }
  }
  if (!startDate || !endDate || endDate < startDate) {
    return { error: 'A valid calendar date range is required' }
  }
  if (entryType === 'leave' && !employeeId) {
    return { error: 'Employee is required for an HR-recorded leave' }
  }
  if (entryType === 'leave' && !leaveTypeName) {
    return { error: 'Leave type is required for an HR-recorded leave' }
  }
  if (entryType === 'note' && !noteTitle) {
    return { error: 'Title is required for a calendar note' }
  }

  return {
    value: {
      entry_type: entryType,
      employee_id: employeeId,
      title: entryType === 'note' ? noteTitle : 'HR-recorded leave',
      leave_type_name: entryType === 'leave' ? leaveTypeName : null,
      start_date: startDate,
      end_date: endDate,
      description: description || null,
      is_employee_visible: entryType === 'leave' && input.is_employee_visible === true,
    },
  }
}

module.exports = {
  validateHrCalendarEntry,
}
