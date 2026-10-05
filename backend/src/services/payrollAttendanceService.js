const { shiftWindow, paidShiftOverlap } = require('./payrollShiftService')
const MANILA_TIME_ZONE = 'Asia/Manila'

function parseCsv(text) {
  const input = String(text ?? '').replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => String(value).trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (quoted) throw new TypeError('CSV contains an unclosed quoted field')
  row.push(field)
  if (row.some((value) => String(value).trim() !== '')) rows.push(row)
  return rows
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

const EMPLOYEE_CODE_HEADERS = new Set([
  'employeecode', 'employeeid', 'employeeno', 'empcode', 'empid', 'empno', 'pin',
  'userid', 'usercode', 'personid', 'deviceuserid', 'cardno', 'cardnumber', 'badgeno', 'badgeid', 'enrollid',
])
const TIMESTAMP_HEADERS = new Set([
  'timestamp', 'datetime', 'scantime', 'scandatetime', 'punchdatetime', 'checktime',
  'recordtime', 'recorddatetime', 'eventtime', 'occurredat', 'localtime', 'devicetime', 'attendancetime',
])
const DATE_HEADERS = new Set(['date', 'eventdate', 'punchdate', 'checkdate'])
const TIME_HEADERS = new Set(['time', 'eventtimeonly', 'punchtime', 'checktimeonly'])
const CHECKPOINT_HEADERS = new Set(['attendancecheckpoint', 'checkpoint', 'reader'])

function checkpointDirection(value) {
  const checkpoint = String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
  if (checkpoint === 'main_door_out_door1_entrance card reader1') return 'in'
  if (checkpoint === 'main_door_in_door1_entrance card reader1') return 'out'
  if (checkpoint === 'new bio_new office biometrics_entrance card reader1') return 'boundary'
  return 'ignored'
}

function decodeAttendanceCsv(buffer) {
  // The biometric export uses Windows-1252; also accept standard UTF-8 CSVs.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

function isAttendanceScan(eventType) {
  return eventType === 'in' || eventType === 'out' || eventType === 'boundary'
}

function parseAttendanceCsv(text) {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new TypeError('CSV file is empty')
  const headers = rows[0].map((header) => String(header || '').trim())
  const normalized = headers.map(normalizeHeader)
  const employeeCodeIndex = normalized.findIndex((header) => EMPLOYEE_CODE_HEADERS.has(header))
  let timestampIndex = normalized.findIndex((header) => TIMESTAMP_HEADERS.has(header))
  const dateIndex = normalized.findIndex((header) => DATE_HEADERS.has(header))
  const timeIndex = normalized.findIndex((header) => TIME_HEADERS.has(header))
  const checkpointIndex = normalized.findIndex((header) => CHECKPOINT_HEADERS.has(header))
  // The biometric export calls its full date-time column simply "Time".
  if (timestampIndex < 0 && dateIndex < 0) timestampIndex = timeIndex
  if (employeeCodeIndex < 0) throw new TypeError('CSV needs an employee_code column (or a recognized employee code alias)')
  const identifierType = normalized[employeeCodeIndex] === 'personid' ? 'person_id' : 'employee_code'
  if (timestampIndex < 0 && (dateIndex < 0 || timeIndex < 0)) {
    throw new TypeError('CSV needs a timestamp column, or separate date and time columns')
  }

  return rows.slice(1).map((cells, index) => {
    const raw = Object.fromEntries(headers.map((header, headerIndex) => [header, cells[headerIndex] ?? '']))
    const sourceCode = String(cells[employeeCodeIndex] || '').trim()
    const employeeCode = normalized[employeeCodeIndex] === 'personid'
      ? sourceCode.replace(/^'/, '')
      : sourceCode
    const timestamp = timestampIndex >= 0
      ? String(cells[timestampIndex] || '').trim()
      : `${String(cells[dateIndex] || '').trim()} ${String(cells[timeIndex] || '').trim()}`.trim()
    const eventType = checkpointIndex < 0 ? null : checkpointDirection(cells[checkpointIndex])
    return { sourceRow: index + 2, employeeCode, identifierType, timestamp, eventType, raw }
  }).filter((record) => record.employeeCode || record.timestamp)
}

function parseManilaTimestamp(value) {
  const input = String(value ?? '').trim()
  if (!input) throw new TypeError('Attendance timestamp is required')

  let normalized = input
  // A timezone-less ISO timestamp exported by the door system is local Manila time.
  const isoLocal = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/
  const isoMatch = normalized.match(isoLocal)
  if (isoMatch) normalized = `${isoMatch[1]}T${isoMatch[2]}+08:00`

  // Common CSV export format: M/D/YY[YY] h:mm[:ss] [AM|PM].
  const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (usMatch) {
    const [, firstDatePart, secondDatePart, yearInput, hourInput, minute, second = '00', meridiem] = usMatch
    const year = yearInput.length === 2 ? 2000 + Number(yearInput) : Number(yearInput)
    let month = Number(firstDatePart)
    let day = Number(secondDatePart)
    // Support unambiguous day-first exports such as 21/09/2026; ambiguous dates default to M/D/Y.
    if (month > 12 && day <= 12) [day, month] = [month, day]
    let hour = Number(hourInput)
    if (meridiem) {
      if (hour < 1 || hour > 12) throw new TypeError(`Invalid Manila timestamp: ${input}`)
      hour = (hour % 12) + (meridiem.toUpperCase() === 'PM' ? 12 : 0)
    }
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
        hour > 23 || Number(minute) > 59 || Number(second) > 59) {
      throw new TypeError(`Invalid Manila timestamp: ${input}`)
    }
    normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}:${second}+08:00`
  }

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid attendance timestamp: ${input}`)
  return date
}

function manilaDateParts(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError('Attendance event must have a valid timestamp')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function dateKey(value) {
  if (value instanceof Date) {
    // pg parses DATE at local midnight. On a Manila server that instant is still
    // the previous UTC day, so UTC fields would shift every payroll work date.
    return manilaDateParts(value).date
  }
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) throw new TypeError('Date must use YYYY-MM-DD format')
  return match[1]
}

function addDays(date, amount) {
  const [year, month, day] = dateKey(date).split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + amount))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

function weekday(date) {
  const [year, month, day] = dateKey(date).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function attendanceWorkDate(instant, profile = {}) {
  const parts = manilaDateParts(instant), shift = shiftWindow(profile)
  return shift.overnight && parts.hour * 60 + parts.minute < shift.boundary ? addDays(parts.date, -1) : parts.date
}
function minutesOnWorkDate(instant, workDate) {
  const parts = manilaDateParts(instant)
  return (Date.parse(parts.date) - Date.parse(dateKey(workDate))) / 86400000 * 1440 + parts.hour * 60 + parts.minute + parts.second / 60
}
function verifiedShiftTimestamp(workDate, clock, profile = {}) {
  const { clockMinutes } = require('./payrollShiftService')
  const shift = shiftWindow(profile)
  const date = shift.overnight && clockMinutes(clock) < shift.boundary ? addDays(workDate, 1) : workDate
  return parseManilaTimestamp(`${date} ${clock}`)
}

function roundMinutes(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function computeDailyAttendance({ date, events = [], profile = {} }) {
  const workDate = dateKey(date)
  const workdays = Array.isArray(profile.workdays) ? profile.workdays.map(Number) : [1, 2, 3, 4, 5]
  const dayOfWeek = weekday(workDate)
  if (!workdays.includes(dayOfWeek)) return null

  const validEvents = events
    .map((event) => ({ ...event, occurredAt: new Date(event.occurredAt ?? event.occurred_at ?? event.timestamp) }))
    .filter((event) => !Number.isNaN(event.occurredAt.getTime()) && attendanceWorkDate(event.occurredAt, profile) === workDate)
  const sorted = [...new Map(validEvents.map((event) => [`${event.occurredAt.getTime()}:${event.eventType ?? event.event_type ?? ''}`, event])).values()]
    .sort((left, right) => left.occurredAt - right.occurredAt)

  if (sorted.length === 0) {
    return {
      date: workDate,
      status: 'exception',
      firstScanAt: null,
      lastScanAt: null,
      scanCount: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      exceptionReason: 'No biometric scans; HR must confirm absence, leave, or offsite work',
    }
  }

  const hasCheckpointTypes = sorted.some((event) => event.eventType != null || event.event_type != null)
  // New Bio has no direction. It can extend either daily endpoint; interior
  // scans never change the first arrival or last departure.
  const arrivals = hasCheckpointTypes ? sorted.filter((event) => ['in', 'boundary'].includes(event.eventType ?? event.event_type)) : sorted
  const departures = hasCheckpointTypes ? sorted.filter((event) => ['out', 'boundary'].includes(event.eventType ?? event.event_type)) : sorted
  const first = arrivals[0]?.occurredAt ?? null
  const last = departures[departures.length - 1]?.occurredAt ?? null
  const complete = first && last && last > first && (hasCheckpointTypes || sorted.length > 1)
  const { start: startMinutes, end: endMinutes } = shiftWindow(profile)
  const firstAt = first ? minutesOnWorkDate(first, workDate) : null
  const lastAt = last ? minutesOnWorkDate(last, workDate) : null
  const status = complete ? 'present' : 'exception'
  let exceptionReason = null
  if (!complete) {
    if (!hasCheckpointTypes) exceptionReason = 'Only one scan was recorded for this workday'
    else if (!first && !last) exceptionReason = 'No recognized time-in or time-out scan for this workday'
    else if (!first) exceptionReason = 'No recognized time-in scan for this workday'
    else if (!last) exceptionReason = 'No recognized time-out scan for this workday'
    else exceptionReason = 'Time-out scan is not after time-in scan'
  }

  return {
    date: workDate,
    status,
    firstScanAt: first?.toISOString() ?? null,
    lastScanAt: last?.toISOString() ?? null,
    scanCount: sorted.length,
    lateMinutes: complete ? roundMinutes(paidShiftOverlap(startMinutes, firstAt, profile)) : 0,
    undertimeMinutes: complete ? roundMinutes(paidShiftOverlap(lastAt, endMinutes, profile)) : 0,
    exceptionReason,
  }
}

function listWeekdays(start, end, workdays = [1, 2, 3, 4, 5]) {
  const from = dateKey(start)
  const to = dateKey(end)
  if (to < from) throw new RangeError('periodEnd must be on or after periodStart')
  const dates = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (workdays.includes(weekday(date))) dates.push(date)
  }
  return dates
}

module.exports = {
  MANILA_TIME_ZONE,
  attendanceWorkDate,
  minutesOnWorkDate,
  verifiedShiftTimestamp,
  addDays,
  computeDailyAttendance,
  dateKey,
  decodeAttendanceCsv,
  isAttendanceScan,
  listWeekdays,
  manilaDateParts,
  parseAttendanceCsv,
  parseCsv,
  parseManilaTimestamp,
  weekday,
}
