import { computed, ref, watch } from 'vue'
import { getPhilippineHolidays } from '@/services/backendService'

function parseISO(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toISO(date) {
  return date.toISOString().slice(0, 10)
}

export function usePhilippineWorkingDays(startDate, endDate) {
  const holidays = ref([])
  const loadedRange = ref('')

  const workingDays = computed(() => {
    const start = parseISO(startDate.value)
    const end = parseISO(endDate.value)
    if (!start || !end || end < start) return 0
    const nonWorking = new Set(
      holidays.value
        .filter((holiday) => !holiday.is_working_day)
        .map((holiday) => String(holiday.holiday_date).slice(0, 10))
    )
    let total = 0
    for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      if ([0, 6].includes(date.getUTCDay()) || nonWorking.has(toISO(date))) continue
      total += 1
    }
    return total
  })

  async function load() {
    if (!startDate.value || !endDate.value) return
    const range = `${startDate.value}:${endDate.value}`
    if (range === loadedRange.value) return
    holidays.value = await getPhilippineHolidays(startDate.value, endDate.value)
    loadedRange.value = range
  }

  watch([startDate, endDate], () => {
    load().catch(() => {
      holidays.value = []
    })
  }, { immediate: true })

  return { holidays, workingDays }
}
