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

function parseAttendanceCsv(text) {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new TypeError('CSV file is empty')
  const headers = rows[0].map((header) => String(header || '').trim())
  const normalized = headers.map(normalizeHeader)
  const employeeCodeIndex = normalized.findIndex((header) => EMPLOYEE_CODE_HEADERS.has(header))
  const timestampIndex = normalized.findIndex((header) => TIMESTAMP_HEADERS.has(header))
  const dateIndex = normalized.findIndex((header) => DATE_HEADERS.has(header))
  const timeIndex = normalized.findIndex((header) => TIME_HEADERS.has(header))
  if (employeeCodeIndex < 0) throw new TypeError('CSV needs an employee_code column (or a recognized employee code alias)')
  if (timestampIndex < 0 && (dateIndex < 0 || timeIndex < 0)) {
    throw new TypeError('CSV needs a timestamp column, or separate date and time columns')
  }

  return rows.slice(1).map((cells, index) => {
    const raw = Object.fromEntries(headers.map((header, headerIndex) => [header, cells[headerIndex] ?? '']))
    const employeeCode = String(cells[employeeCodeIndex] || '').trim()
    const timestamp = timestampIndex >= 0
      ? String(cells[timestampIndex] || '').trim()
      : `${String(cells[dateIndex] || '').trim()} ${String(cells[timeIndex] || '').trim()}`.trim()
    return { sourceRow: index + 2, employeeCode, timestamp, raw }
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

  // Common CSV export format: M/D/YYYY h:mm[:ss] [AM|PM].
  const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (usMatch) {
    const [, firstDatePart, secondDatePart, year, hourInput, minute, second = '00', meridiem] = usMatch
    let month = Number(firstDatePart)
    let day = Number(secondDatePart)
    // Support unambiguous day-first exports such as 21/09/2026; ambiguous dates default to M/D/Y.
    if (month > 12 && day <= 12) [day, month] = [month, day]
    let hour = Number(hourInput)
    if (meridiem) {
      if (hour < 1 || hour > 12) throw new TypeError(`Invalid Manila timestamp: ${input}`)
      hour = (hour % 12) + (meridiem.toUpperCase() === 'PM' ? 12 : 0)
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
    // PostgreSQL's DATE parser returns midnight UTC; use UTC fields to preserve that date.
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, '0')
    const day = String(value.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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

function timeToMinutes(value, fallback) {
  const input = String(value || fallback)
  const match = input.match(/^(\d{1,2}):(\d{2})/)
  if (!match) throw new TypeError(`Invalid schedule time: ${input}`)
  return Number(match[1]) * 60 + Number(match[2])
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
    .filter((event) => !Number.isNaN(event.occurredAt.getTime()) && manilaDateParts(event.occurredAt).date === workDate)
  const sorted = [...new Map(validEvents.map((event) => [event.occurredAt.getTime(), event])).values()]
    .sort((left, right) => left.occurredAt - right.occurredAt)

  if (sorted.length === 0) {
    return {
      date: workDate,
      status: 'absent',
      firstScanAt: null,
      lastScanAt: null,
      scanCount: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      exceptionReason: null,
    }
  }

  const first = sorted[0].occurredAt
  const last = sorted[sorted.length - 1].occurredAt
  const firstParts = manilaDateParts(first)
  const lastParts = manilaDateParts(last)
  const startMinutes = timeToMinutes(profile.work_start_time ?? profile.workStartTime, '09:00')
  const endMinutes = timeToMinutes(profile.work_end_time ?? profile.workEndTime, '18:00')
  const startAt = startMinutes * 60000
  const endAt = endMinutes * 60000
  const firstAt = (firstParts.hour * 60 + firstParts.minute + firstParts.second / 60) * 60000
  const lastAt = (lastParts.hour * 60 + lastParts.minute + lastParts.second / 60) * 60000
  const status = sorted.length === 1 ? 'exception' : 'present'

  return {
    date: workDate,
    status,
    firstScanAt: first.toISOString(),
    lastScanAt: last.toISOString(),
    scanCount: sorted.length,
    lateMinutes: status === 'present' ? roundMinutes(Math.max(0, firstAt - startAt) / 60000) : 0,
    undertimeMinutes: status === 'present' ? roundMinutes(Math.max(0, endAt - lastAt) / 60000) : 0,
    exceptionReason: status === 'exception' ? 'Only one scan was recorded for this workday' : null,
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
  addDays,
  computeDailyAttendance,
  dateKey,
  listWeekdays,
  manilaDateParts,
  parseAttendanceCsv,
  parseCsv,
  parseManilaTimestamp,
  weekday,
}
