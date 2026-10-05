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
  const supportingDocumentReceived = input.supporting_document_received === true
  const dayFraction = Number(input.day_fraction ?? 1)
  const coverageStart = input.coverage_start || null, coverageEnd = input.coverage_end || null
  if (entryType==='leave' && (![0.5,1].includes(dayFraction) || (dayFraction < 1 && (startDate !== endDate ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(coverageStart || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(coverageEnd || '') || coverageEnd <= coverageStart)))) {
    return { error: 'Half-day leave needs one date and valid covered start/end times' }
  }

  if (!ENTRY_TYPES.has(entryType)) {
    return { error: 'Entry type must be leave or note' }
  }
  if (!startDate || !endDate || endDate < startDate) {
    return { error: 'A valid calendar date range is required' }
  }
  if (entryType === 'leave' && !employeeId) {
    return { error: 'Employee is required for an official leave' }
  }
  if (entryType === 'leave' && !leaveTypeName) {
    return { error: 'Leave type is required for an official leave' }
  }
  if (entryType === 'leave' && !description) {
    return { error: 'Record how the leave request was received and the reason provided' }
  }
  if (entryType === 'note' && !noteTitle) {
    return { error: 'Title is required for a calendar note' }
  }

  return {
    value: {
      entry_type: entryType,
      employee_id: employeeId,
      title: entryType === 'note' ? noteTitle : 'Official leave',
      leave_type_name: entryType === 'leave' ? leaveTypeName : null,
      start_date: startDate,
      end_date: endDate,
      description: description || null,
      is_employee_visible: entryType === 'leave',
      supporting_document_received: entryType === 'leave' && supportingDocumentReceived,
      ...(entryType==='leave'&&dayFraction < 1 ? {day_fraction:dayFraction,coverage_start:coverageStart,coverage_end:coverageEnd} : {}),
    },
  }
}

module.exports = {
  validateHrCalendarEntry,
}
