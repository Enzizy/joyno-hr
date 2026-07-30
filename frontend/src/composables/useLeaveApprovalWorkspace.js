import { computed, ref, watch } from 'vue'
import { usePersistentFilters } from '@/composables/usePersistentFilters'

const DOCUMENT_REVIEW_STATUSES = new Set([
  'missing',
  'pending_review',
  'replacement_required',
  'deadline_missed',
])

function dateOnly(value) {
  return String(value || '').slice(0, 10)
}

function startOfMonthISO() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    '01',
  ].join('-')
}

function endOfMonthISO() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10)
}

export function useLeaveApprovalWorkspace(leaveStore, employees, inboxRows) {
  const activeTab = ref('pending')
  const searchQuery = ref('')
  const typeFilter = ref('all')
  const departmentFilter = ref('all')
  const scheduleFilter = ref('all')
  const page = ref(1)
  const pageSize = 10

  usePersistentFilters('leave-approval-workspace', {
    activeTab,
    searchQuery,
    typeFilter,
    departmentFilter,
    scheduleFilter,
  })

  const employeeMap = computed(() => new Map(
    employees.value.map((employee) => [Number(employee.id), employee])
  ))
  const inboxMap = computed(() => new Map(
    inboxRows.value.map((row) => [Number(row.id), row])
  ))

  const rows = computed(() => leaveStore.requests.map((request) => {
    const employee = employeeMap.value.get(Number(request.employee_id))
    const inbox = inboxMap.value.get(Number(request.id))
    return {
      ...request,
      ...inbox,
      employee_name: request.employee_name || inbox?.employee_name || 'Employee',
      department: inbox?.department || employee?.department || 'Unassigned',
      position: employee?.position || '',
    }
  }))

  const counts = computed(() => ({
    pending: rows.value.filter((row) => row.status === 'pending').length,
    approved: rows.value.filter((row) => row.status === 'approved').length,
    rejected: rows.value.filter((row) => row.status === 'rejected').length,
  }))

  const typeOptions = computed(() => [...new Set(
    rows.value.map((row) => row.leave_type_name).filter(Boolean)
  )].sort())
  const departmentOptions = computed(() => [...new Set(
    rows.value.map((row) => row.department || 'Unassigned')
  )].sort())

  const filteredRows = computed(() => {
    const today = new Date().toISOString().slice(0, 10)
    const monthStart = startOfMonthISO()
    const monthEnd = endOfMonthISO()
    const query = searchQuery.value.trim().toLowerCase()

    return rows.value
      .filter((row) => {
        if (row.status !== activeTab.value) return false
        if (typeFilter.value !== 'all' && row.leave_type_name !== typeFilter.value) return false
        if (departmentFilter.value !== 'all' && row.department !== departmentFilter.value) return false
        if (query && !String(row.employee_name || '').toLowerCase().includes(query)) return false

        const start = dateOnly(row.start_date)
        const end = dateOnly(row.end_date)
        if (scheduleFilter.value === 'upcoming' && end < today) return false
        if (scheduleFilter.value === 'past' && end >= today) return false
        if (scheduleFilter.value === 'this_month' && (start > monthEnd || end < monthStart)) return false
        return true
      })
      .sort((left, right) => {
        if (activeTab.value === 'pending') {
          return dateOnly(left.start_date).localeCompare(dateOnly(right.start_date))
            || new Date(left.created_at) - new Date(right.created_at)
        }
        return new Date(right.decided_at || right.created_at) - new Date(left.decided_at || left.created_at)
      })
  })

  const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize)))
  const pagedRows = computed(() => {
    const start = (page.value - 1) * pageSize
    return filteredRows.value.slice(start, start + pageSize)
  })
  const documentReviewRows = computed(() => pagedRows.value.filter((row) =>
    activeTab.value === 'pending'
    && DOCUMENT_REVIEW_STATUSES.has(row.attachment_review_status)
  ))
  const readyRows = computed(() => pagedRows.value.filter((row) =>
    activeTab.value === 'pending'
    && !DOCUMENT_REVIEW_STATUSES.has(row.attachment_review_status)
  ))

  watch(
    [activeTab, searchQuery, typeFilter, departmentFilter, scheduleFilter],
    () => { page.value = 1 }
  )
  watch(pageCount, (count) => {
    if (page.value > count) page.value = count
  })

  function resetFilters() {
    searchQuery.value = ''
    typeFilter.value = 'all'
    departmentFilter.value = 'all'
    scheduleFilter.value = 'all'
    page.value = 1
  }

  return {
    activeTab,
    counts,
    departmentFilter,
    departmentOptions,
    documentReviewRows,
    filteredRows,
    page,
    pageCount,
    pagedRows,
    readyRows,
    resetFilters,
    rows,
    scheduleFilter,
    searchQuery,
    typeFilter,
    typeOptions,
  }
}
