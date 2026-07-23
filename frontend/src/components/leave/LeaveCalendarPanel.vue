<script setup>
import { computed, onMounted, ref } from 'vue'
import { getEmployees, getLeaveCalendar, getLeaveRequests, getPhilippineHolidays } from '@/services/backendService'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getDepartmentPresentation } from '@/utils/employeePresentation'
import { getLeaveTypePresentation } from '@/utils/leavePresentation'

const props = defineProps({
  compact: Boolean,
  showFilters: { type: Boolean, default: true },
})

const toast = useToastStore()
const currentMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const events = ref([])
const holidays = ref([])
const loading = ref(false)
const departmentFilter = ref('all')
const statusFilter = ref('all')
const selectedEvent = ref(null)
const employeeDepartments = ref(new Map())

const monthLabel = computed(() => currentMonth.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))
const monthStart = computed(() => toISO(new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth(), 1)))
const monthEnd = computed(() => toISO(new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1, 0)))
const departments = computed(() => [...new Set(events.value.map((event) => event.department || 'Unassigned'))].sort())
const filteredEvents = computed(() => events.value.filter((event) => {
  if (departmentFilter.value !== 'all' && (event.department || 'Unassigned') !== departmentFilter.value) return false
  return statusFilter.value === 'all' || event.status === statusFilter.value
}))
const holidayMap = computed(() => new Map(
  holidays.value.map((holiday) => [String(holiday.holiday_date).slice(0, 10), holiday])
))

const calendarDays = computed(() => {
  const year = currentMonth.value.getFullYear()
  const month = currentMonth.value.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const iso = toISO(date)
    const holiday = holidayMap.value.get(iso) || null
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const isWorkingDay = !isWeekend && (!holiday || holiday.is_working_day)
    return {
      iso,
      date,
      holiday,
      isWeekend,
      currentMonth: date.getMonth() === month,
      today: iso === toISO(new Date()),
      events: isWorkingDay
        ? filteredEvents.value.filter((event) => event.start_date <= iso && event.end_date >= iso)
        : [],
    }
  })
})

const agendaItems = computed(() => filteredEvents.value.slice().sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))))

function toISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeCalendarEvent(event) {
  return {
    ...event,
    start_date: String(event.start_date || '').slice(0, 10),
    end_date: String(event.end_date || '').slice(0, 10),
    status: String(event.status || '').toLowerCase(),
    department: event.department || '',
  }
}

function addEmployeeDepartments(rows) {
  return rows.map((event) => ({
    ...event,
    department: event.department
      || employeeDepartments.value.get(Number(event.employee_id))
      || 'Unassigned',
  }))
}

async function loadEmployeeDepartments() {
  try {
    const employees = await getEmployees()
    employeeDepartments.value = new Map(
      employees.map((employee) => [Number(employee.id), employee.department || 'Unassigned'])
    )
  } catch {
    employeeDepartments.value = new Map()
  }
}

function normalizeCalendarEvents(rows) {
  return Array.isArray(rows)
    ? rows.map(normalizeCalendarEvent).filter((event) => event.start_date && event.end_date)
    : []
}

function eventTone(event) {
  if (event.status === 'pending') return 'border-amber-600/40 bg-amber-500/15 text-amber-200'
  if (String(event.leave_pay_type).toLowerCase() === 'unpaid') return 'border-blue-600/40 bg-blue-500/15 text-blue-200'
  return 'border-emerald-600/40 bg-emerald-500/15 text-emerald-200'
}

function shortName(event) {
  return String(event.employee_name || 'Employee').split(' ')[0]
}

async function loadCalendar() {
  loading.value = true
  try {
    holidays.value = await getPhilippineHolidays(monthStart.value, monthEnd.value).catch(() => [])
    try {
      const rows = await getLeaveCalendar({ from: monthStart.value, to: monthEnd.value })
      events.value = addEmployeeDepartments(normalizeCalendarEvents(rows))
    } catch {
      const rows = normalizeCalendarEvents(await getLeaveRequests())
      events.value = addEmployeeDepartments(rows)
        .filter((row) => ['pending', 'approved'].includes(row.status) && row.start_date <= monthEnd.value && row.end_date >= monthStart.value)
    }
  } catch (error) {
    events.value = []
    holidays.value = []
    toast.error(error.message || 'Unable to load the leave calendar.')
  } finally {
    loading.value = false
  }
}

async function changeMonth(offset) {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + offset, 1)
  departmentFilter.value = 'all'
  await loadCalendar()
}

async function goToday() {
  currentMonth.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  await loadCalendar()
}

onMounted(async () => {
  await loadEmployeeDepartments()
  await loadCalendar()
})
</script>

<template>
  <section class="surface-card overflow-hidden">
    <div class="flex flex-col gap-3 border-b border-gray-800 p-4" :class="showFilters && !compact ? 'lg:flex-row lg:items-end lg:justify-between' : ''">
      <div class="grid items-center gap-3" :class="compact ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-[1fr_auto]'">
        <div class="flex items-center gap-2">
          <button type="button" class="icon-button h-9 w-9" aria-label="Previous month" @click="changeMonth(-1)">‹</button>
          <h2 class="min-w-36 text-center text-sm font-semibold text-gray-100 sm:min-w-40">{{ monthLabel }}</h2>
          <button type="button" class="icon-button h-9 w-9" aria-label="Next month" @click="changeMonth(1)">›</button>
        </div>
        <div v-if="compact" class="hidden min-w-0 text-center lg:block">
          <h2 class="text-sm font-semibold text-gray-100">Leave calendar</h2>
          <p class="mt-0.5 truncate text-[11px] text-gray-500">Review scheduled leave while choosing your dates.</p>
        </div>
        <AppButton class="justify-self-end" variant="ghost" size="sm" @click="goToday">Today</AppButton>
      </div>
      <div v-if="showFilters && !compact" class="grid gap-3 sm:grid-cols-2">
        <label class="text-xs text-gray-400">Department<select v-model="departmentFilter" class="form-control mt-1 min-w-44"><option value="all">All departments</option><option v-for="department in departments" :key="department" :value="department">{{ department }}</option></select></label>
        <label class="text-xs text-gray-400">Status<select v-model="statusFilter" class="form-control mt-1 min-w-36"><option value="all">All statuses</option><option value="approved">Approved</option><option value="pending">Pending</option></select></label>
      </div>
    </div>

    <div v-if="loading" class="grid grid-cols-7 gap-px bg-gray-800 p-px" role="status" aria-label="Loading calendar">
      <div v-for="item in 35" :key="item" class="animate-pulse bg-gray-900" :class="compact ? 'h-16' : 'h-28'" />
    </div>
    <div v-else class="hidden md:block">
      <div class="grid grid-cols-7 border-b border-gray-800 bg-gray-950/60">
        <div v-for="day in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="day" class="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-500">{{ day }}</div>
      </div>
      <div class="grid grid-cols-7 gap-px bg-gray-800">
        <div v-for="day in calendarDays" :key="day.iso" class="relative bg-gray-900 p-1.5" :class="[compact ? 'min-h-[72px]' : 'min-h-28 p-2', !day.currentMonth && 'opacity-35', day.holiday && !day.holiday.is_working_day && 'bg-primary-500/[0.06] shadow-[inset_0_0_0_1px_rgba(195,145,15,0.22)]', day.holiday?.is_working_day && 'bg-violet-500/[0.04]']">
          <div class="flex items-center justify-between gap-1">
            <span class="inline-flex items-center justify-center rounded-full text-[11px]" :class="day.today ? 'h-6 w-6 bg-primary-500 font-bold text-black' : 'h-5 w-5 text-gray-400'">{{ day.date.getDate() }}</span>
            <span v-if="day.holiday" class="text-[8px] font-bold uppercase tracking-wider" :class="day.holiday.is_working_day ? 'text-violet-400' : 'text-primary-400'">{{ day.holiday.is_working_day ? 'Observance' : 'Holiday' }}</span>
          </div>
          <div class="mt-0.5 space-y-0.5">
            <p v-if="day.holiday" class="line-clamp-2 px-0.5 text-left text-[9px] font-semibold leading-tight sm:text-[10px]" :class="day.holiday.is_working_day ? 'text-violet-300' : 'text-primary-300'" :title="`${day.holiday.name} · ${day.holiday.is_working_day ? 'Special working day' : 'Non-working holiday'}`">{{ day.holiday.name }}</p>
            <button v-for="event in day.events.slice(0, compact ? 2 : 3)" :key="`${day.iso}-${event.id}`" type="button" class="block w-full truncate rounded border px-1.5 py-0.5 text-left text-[9px] font-medium sm:text-[10px]" :class="eventTone(event)" :title="`${event.employee_name} — ${event.leave_type_name}`" @click="selectedEvent = event">{{ compact ? shortName(event) : event.employee_name }}</button>
            <p v-if="day.events.length > (compact ? 2 : 3)" class="px-1 text-[9px] text-gray-500">+{{ day.events.length - (compact ? 2 : 3) }}</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loading" class="space-y-2 p-4 md:hidden">
      <EmptyState v-if="!agendaItems.length && !holidays.length" title="No leave or holidays scheduled" description="No calendar events are recorded this month." compact />
      <div v-for="holiday in holidays" :key="`holiday-${holiday.id}`" class="flex w-full items-center gap-3 rounded-lg border border-primary-700/30 bg-primary-500/[0.06] p-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-primary-300">★</span>
        <span class="min-w-0 flex-1"><span class="block text-[10px] font-bold uppercase tracking-wider text-primary-400">{{ holiday.is_working_day ? 'Working observance' : 'National holiday' }}</span><span class="mt-0.5 block truncate text-sm font-semibold text-gray-100">{{ holiday.name }}</span><span class="text-xs text-gray-500">{{ formatDate(holiday.holiday_date) }}</span></span>
      </div>
      <button v-for="event in agendaItems" :key="event.id" type="button" class="flex w-full items-center gap-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3 text-left" @click="selectedEvent = event">
        <span class="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-gray-800 text-[10px] text-gray-400"><strong class="text-sm text-primary-200">{{ String(event.start_date).slice(8, 10) }}</strong>{{ new Date(`${String(event.start_date).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }) }}</span>
        <span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold text-gray-100">{{ event.employee_name }}</span><span class="text-xs text-gray-500">{{ event.leave_type_name }}</span></span>
        <StatusBadge :status="event.status" />
      </button>
    </div>

    <div class="flex flex-wrap gap-4 border-t border-gray-800 px-4 py-3 text-[11px] text-gray-500">
      <span class="inline-flex items-center gap-1.5"><i class="h-2 w-2 rounded-full bg-emerald-500" />Approved paid</span>
      <span class="inline-flex items-center gap-1.5"><i class="h-2 w-2 rounded-full bg-blue-500" />Approved unpaid</span>
      <span class="inline-flex items-center gap-1.5"><i class="h-2 w-2 rounded-full bg-amber-500" />Pending</span>
      <span class="inline-flex items-center gap-1.5"><i class="h-2 w-2 rotate-45 bg-primary-500" />Non-working holiday</span>
      <span class="inline-flex items-center gap-1.5"><i class="h-2 w-2 rounded-full bg-violet-500" />Special working day</span>
    </div>
  </section>

  <AppModal :show="Boolean(selectedEvent)" title="Scheduled leave" @close="selectedEvent = null">
    <div v-if="selectedEvent" class="space-y-4 text-sm">
      <div class="rounded-xl border border-gray-800 bg-gray-950/40 p-4"><p class="text-xs uppercase tracking-wider text-gray-500">Employee</p><p class="mt-1 font-semibold text-gray-100">{{ selectedEvent.employee_name }}</p><div class="mt-2"><StatusBadge :status="selectedEvent.department" :variant="getDepartmentPresentation(selectedEvent.department).variant">{{ getDepartmentPresentation(selectedEvent.department).label }}</StatusBadge></div></div>
      <dl class="grid gap-4 sm:grid-cols-2"><div><dt class="text-xs text-gray-500">Leave type</dt><dd class="mt-1"><StatusBadge :status="selectedEvent.leave_type_name" :variant="getLeaveTypePresentation(selectedEvent.leave_type_name).variant">{{ getLeaveTypePresentation(selectedEvent.leave_type_name).label }}</StatusBadge></dd></div><div><dt class="text-xs text-gray-500">Status</dt><dd class="mt-1"><StatusBadge :status="selectedEvent.status" /></dd></div><div class="sm:col-span-2"><dt class="text-xs text-gray-500">Dates</dt><dd class="mt-1 text-gray-200">{{ formatDate(selectedEvent.start_date) }} – {{ formatDate(selectedEvent.end_date) }}</dd></div></dl>
    </div>
    <template #footer><AppButton variant="secondary" @click="selectedEvent = null">Close</AppButton></template>
  </AppModal>
</template>
