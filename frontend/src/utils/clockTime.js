// 12-hour clock times for display, for example "7:02 PM". Time inputs keep their 24-hour "HH:MM" values.
const MANILA_CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// "19:02" or "19:02:00" → "7:02 PM"; anything else is returned as given.
export function clockLabel(value) {
  const match = String(value ?? '').match(/^([01]?\d|2[0-3]):([0-5]\d)/)
  if (!match) return String(value ?? '')
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`
}

// A scan timestamp shown in Manila time, for example "7:02 PM".
export function clockTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? clockLabel(value) : clockLabel(MANILA_CLOCK.format(date))
}

// 24-hour times inside text from the server, for example "Real times entered: 19:02–00:07"
// or the schedule "19:00–01:00 next day", shown on the 12-hour clock.
export function twelveHourText(text) {
  return String(text ?? '').replace(/\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g, (time) => clockLabel(time))
}
