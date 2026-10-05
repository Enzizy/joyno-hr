<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listAttendanceReviews, getAttendanceReview, recordPayrollPayment, getPayrollPaymentExport, verifyPayrollPayBasis, getPayrollRegisterExport } from '@/services/api'
import AppModal from '@/components/ui/AppModal.vue'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import {
  approvePayrollRun,
  getMyPayrollLines,
  getPayrollAttendanceBatch,
  getPayrollRun,
  getPayrollProfiles,
  getPayrollPayslipPdf,
  getPayrollRuns,
  inspectPayrollTestCsv,
  importPayrollAttendance,
  lockPayrollRun,
  previewPayrollRun,
  previewEmployeePayTest,
  sendPayrollPayslip,
  updatePayrollAttendanceDay,
  updatePayrollProfile,
  updatePayrollManualEarnings,
  updatePayrollCharges,
  updatePayrollFirstCutoffPay,
} from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PayrollAttendanceAdjustmentModal from '@/components/payroll/PayrollAttendanceAdjustmentModal.vue'
import PayrollPayslipPreview from '@/components/payroll/PayrollPayslipPreview.vue'
import { isManagementRole } from '@/utils/roles'
import { payrollFinalizationEnabled } from '@/config/features'

const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
const attendanceReviews = ref([])
const eligibleReviews = computed(() => attendanceReviews.value.filter(b => b.review_state === 'confirmed' && b.period_start <= cutoffStart.value && b.period_end >= cutoffEnd.value))
const paymentForm = ref(null)
const payBasisForm = ref(null)
async function savePayBasis() {
  busy.value = true
  try {
    const updated = await verifyPayrollPayBasis(activeRun.value.id, payBasisForm.value.line.id, payBasisForm.value.reason)
    activeRun.value = updated; preview.value = updated; payBasisForm.value = null
    toast.success('Basic pay and COLA verification recorded')
  } catch (error) { toast.error(error.message) } finally { busy.value = false }
}
const canManage = computed(() => isManagementRole(auth.role))
const isEmployee = computed(() => auth.role === 'employee')
const busy = ref(false)
const loadingRun = ref(false)
const loading = ref(true)
const profiles = ref([])
const runs = ref([])
const myLines = ref([])
const preview = ref(null)
const attendanceResult = ref(null)
const selectedFile = ref(null)
const attendanceFileInfo = ref(null)
const attendanceSearch = ref('')
const onlyAttendanceExceptions = ref(false)
const expandedEmployeeId = ref(null)
const cutoffStart = ref('')
const cutoffEnd = ref('')
const payDate = ref('')
const manilaMonthParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit',
}).formatToParts(new Date()).map(({ type, value }) => [type, value]))
const payrollMonth = ref(`${manilaMonthParts.year}-${manilaMonthParts.month}`)
const testPayrollMonth = ref(payrollMonth.value)
const testCutoffType = ref('second')
const testCutoffStart = ref('')
const testCutoffEnd = ref('')
const testPayDate = ref('')
const runAttendanceBatch = ref('')
const cutoffType = ref('second')
const editingProfile = ref(null)
const savingProfile = ref('')
const savingAttendanceDay = ref('')
const activeRun = ref(null)
const editingAttendanceDay = ref(null)
const workflowStep = ref(1)
const profileSearch = ref('')
const selectedPayslip = ref(null)
const editingEarnings = ref(null)
const editingCharges = ref(null)
const editingFirstCutoff = ref(null)
const sendProgress = ref('')
const testFile = ref(null)
const testCsvInfo = ref(null)
const testEmployeeId = ref('')
const testPersonId = ref('')
const testMonthlySalary = ref(15000)
const testMonthlyCola = ref(0)
const testFirstCutoffPay = ref('')
const testWorkedHolidayHours = ref(0)
const testHolidayOvertimeHours = ref(0)
const actualNetReceived = ref('')
const testResult = ref(null)
watch([testEmployeeId, testPersonId, testMonthlySalary, testMonthlyCola, testFirstCutoffPay, testWorkedHolidayHours, testHolidayOvertimeHours,
  testCutoffStart, testCutoffEnd, testPayDate, testCutoffType], () => { testResult.value = null })
const testDailyRate = computed(() => Number(testMonthlySalary.value || 0) * 12 / 261)
const testHolidayPremium = computed(() => Math.round(testDailyRate.value * Number(testWorkedHolidayHours.value || 0) / 8 * 0.3 * 100) / 100)
const testHolidayOvertimePay = computed(() => Math.round(testDailyRate.value / 8 * Number(testHolidayOvertimeHours.value || 0) * 1.3 * 1.3 * 100) / 100)

const workflowSteps = [
  { id: 1, label: 'Set up payroll', detail: 'Dates & employee pay' },
  { id: 2, label: 'Confirm attendance', detail: 'Select HR-reviewed records' },
  { id: 3, label: 'Calculate draft', detail: 'Check calculation inputs' },
  { id: 4, label: 'Review payslips', detail: 'Earnings & net pay' },
]

const chargeTypes = [
  { value: 'sss_salary_loan', label: 'SSS salary loan', kind: 'deduction' },
  { value: 'sss_calamity_loan', label: 'SSS calamity loan', kind: 'deduction' },
  { value: 'pagibig_mpl', label: 'Pag-IBIG MPL', kind: 'deduction' },
  { value: 'pagibig_calamity', label: 'Pag-IBIG calamity loan', kind: 'deduction' },
  { value: 'pagibig_mp2', label: 'Pag-IBIG MP2', kind: 'deduction' },
  { value: 'cash_advance', label: 'Cash advance', kind: 'deduction' },
  { value: 'tax_withholding', label: 'HR-approved tax withholding', kind: 'deduction' },
  { value: 'other_charge', label: 'Other charge', kind: 'deduction' },
  { value: 'other_non_taxable_earning', label: 'Other non-taxable earning', kind: 'earning' },
  { value: 'basic_pay_adjustment', label: 'Basic pay adjustment (+/-)', kind: 'adjustment' },
]

function listFrom(result, key) {
  if (Array.isArray(result)) return result
  return result?.[key] || result?.data?.[key] || []
}

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
}

function profileDailyRate(profile) {
  const salary = profile.monthly_basic ?? profile.monthly_basic_salary ?? profile.monthly_salary
  if (salary == null || salary === '') return null
  const monthly = Number(salary)
  const divisor = Number(profile.daily_rate_divisor || 261)
  return Number.isFinite(monthly) && divisor > 0 ? monthly * 12 / divisor : null
}

function displayName(row) {
  return row.employee_name || row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || `Employee ${row.employee_id ?? ''}`
}

function standardPeriod(monthKey, type) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return null
  const [year, month] = monthKey.split('-').map(Number)
  const previousMonth = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const first = type === 'first'
  return {
    start: first ? `${previousMonth}-26` : `${monthKey}-11`,
    end: first ? `${monthKey}-10` : `${monthKey}-25`,
    payday: first ? `${monthKey}-15` : `${monthKey}-${String(Math.min(30, lastDay)).padStart(2, '0')}`,
  }
}

function applyStandardPeriod() {
  const period = standardPeriod(payrollMonth.value, cutoffType.value)
  if (!period) return
  cutoffStart.value = period.start
  cutoffEnd.value = period.end
  payDate.value = period.payday
}

function applyTestPeriod() {
  const period = standardPeriod(testPayrollMonth.value, testCutoffType.value)
  if (!period) return
  testCutoffStart.value = period.start
  testCutoffEnd.value = period.end
  testPayDate.value = period.payday
}

watch([payrollMonth, cutoffType], applyStandardPeriod, { immediate: true })
watch([testPayrollMonth, testCutoffType], applyTestPeriod, { immediate: true })
watch([cutoffStart, cutoffEnd], () => {
  attendanceResult.value = null
  runAttendanceBatch.value = ''
  expandedEmployeeId.value = null
})

function scheduledDates(startKey, endKey) {
  const start = Date.parse(`${startKey}T00:00:00Z`)
  const end = Date.parse(`${endKey}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  const dates = []
  for (let day = start; day <= end; day += 86400000) {
    const weekday = new Date(day).getUTCDay()
    if (weekday >= 1 && weekday <= 5) dates.push(new Date(day).toISOString().slice(0, 10))
  }
  return dates
}

const attendanceFileWeekdays = computed(() => (attendanceFileInfo.value?.usableDates || []).filter((date) => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return date >= cutoffStart.value && date <= cutoffEnd.value && weekday >= 1 && weekday <= 5
}).length)
const suggestedFilePeriod = computed(() => {
  const lastDate = attendanceFileInfo.value?.lastDate
  if (!lastDate) return null
  const day = Number(lastDate.slice(8, 10))
  if (day <= 10) return { month: lastDate.slice(0, 7), cutoff: 'first', label: `${lastDate.slice(0, 7)} · 15th payday` }
  if (day <= 25) return { month: lastDate.slice(0, 7), cutoff: 'second', label: `${lastDate.slice(0, 7)} · month-end payday` }
  const [year, month] = lastDate.slice(0, 7).split('-').map(Number)
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7)
  return { month: nextMonth, cutoff: 'first', label: `${nextMonth} · 15th payday` }
})
const testScheduledWeekdayCount = computed(() => scheduledDates(testCutoffStart.value, testCutoffEnd.value).length)
const payDateError = computed(() => !payDate.value || payDate.value <= cutoffEnd.value)
const profileIssueCount = computed(() => profiles.value.filter((profile) => {
  const salary = Number(profile.monthly_basic ?? profile.monthly_basic_salary ?? profile.monthly_salary ?? 0)
  return !Number.isFinite(salary) || salary <= 0 || !String(profile.biometric_person_id || '').trim()
}).length)
const testHolidayInputError = computed(() => {
  const hoursWorked = Number(testWorkedHolidayHours.value)
  const hours = Number(testHolidayOvertimeHours.value)
  if (!Number.isFinite(hoursWorked) || hoursWorked < 0 || hoursWorked > testScheduledWeekdayCount.value * 8 ||
      Math.abs(hoursWorked * 100 - Math.round(hoursWorked * 100)) > 0.000001) {
    return 'Enter 0–8 approved paid hours per worked holiday in this cutoff.'
  }
  if (!Number.isFinite(hours) || hours < 0 || Math.abs(hours * 100 - Math.round(hours * 100)) > 0.000001 ||
      hours > 24 || (hours > 0 && hoursWorked === 0)) {
    return 'Holiday overtime needs approved holiday work and cannot exceed 24 hours in this test.'
  }
  return ''
})
const testValidationError = computed(() => {
  const salary = Number(testMonthlySalary.value)
  if (!Number.isFinite(salary) || salary <= 0) return 'Enter a positive monthly basic salary.'
  const cola = Number(testMonthlyCola.value)
  if (!Number.isFinite(cola) || cola < 0) return 'Enter a non-negative monthly COLA.'
  if (testFirstCutoffPay.value !== '') {
    const first = Number(testFirstCutoffPay.value)
    if (!Number.isFinite(first) || first < 0 || first > 10000000 ||
        Math.abs(first * 100 - Math.round(first * 100)) > 0.000001) {
      return 'Enter the 15th cutoff SSS-eligible pay in pesos and centavos.'
    }
  }
  return testHolidayInputError.value
})

onMounted(async () => {
  await loadWorkspace()
  if (canManage.value && route.query.attendanceBatch) {
    try {
      const b = await getAttendanceReview(route.query.attendanceBatch)
      payrollMonth.value = b.period_end.slice(0, 7)
      cutoffType.value = b.period_end.endsWith('-10') ? 'first' : 'second'
      await nextTick()
      await chooseAttendance(b.id)
      workflowStep.value = 3
    } catch (error) { toast.error(error.message) }
  }
})

async function chooseAttendance(id) {
  try {
    attendanceResult.value = await getAttendanceReview(id)
    runAttendanceBatch.value = attendanceResult.value?.review_state === 'confirmed' ? id : ''
  } catch (error) { toast.error(error.message) }
}

function beginPayment() {
  paymentForm.value = { reference: '', paidOn: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) }
}
async function savePayment() {
  busy.value = true
  try {
    const updated = await recordPayrollPayment(activeRun.value.id, { ...paymentForm.value, expectedTotal: totalNet.value })
    activeRun.value = updated; preview.value = updated; paymentForm.value = null
    toast.success('Actual payment recorded. Close payroll to release employee payslips.')
    await refreshRuns()
  } catch (error) { toast.error(error.message) } finally { busy.value = false }
}
async function exportPayment(type='payment') {
  busy.value = true
  try {
    const url = URL.createObjectURL(type==='payment'?await getPayrollPaymentExport(activeRun.value.id):await getPayrollRegisterExport(activeRun.value.id,type))
    const link = document.createElement('a'); link.href = url; link.download = `payroll-${type}-${activeRun.value.id}-${activeRun.value.status}.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) { toast.error(error.message) } finally { busy.value = false }
}

async function loadWorkspace() {
  loading.value = true
  const tasks = []
  if (canManage.value) {
    tasks.push(listAttendanceReviews().then(data => { attendanceReviews.value = data }))
    tasks.push(getPayrollProfiles().then((data) => { profiles.value = listFrom(data, 'items') }))
    tasks.push(getPayrollRuns().then((data) => { runs.value = listFrom(data, 'items') }))
  }
  if (isEmployee.value) tasks.push(getMyPayrollLines().then((data) => { myLines.value = listFrom(data, 'items') }))
  const results = await Promise.allSettled(tasks)
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) toast.error(failed.reason?.message || 'Some payroll information could not be loaded.')
  loading.value = false
}

async function onFileChange(event) {
  selectedFile.value = event.target.files?.[0] || null
  attendanceResult.value = null
  runAttendanceBatch.value = ''
  expandedEmployeeId.value = null
  attendanceFileInfo.value = null
  if (!selectedFile.value) return
  busy.value = true
  try {
    attendanceFileInfo.value = await inspectPayrollTestCsv(selectedFile.value)
  } catch (error) {
    toast.error(error.message || 'Unable to inspect the biometric CSV.')
  } finally {
    busy.value = false
  }
}

function useSuggestedFilePeriod() {
  if (!suggestedFilePeriod.value) return
  payrollMonth.value = suggestedFilePeriod.value.month
  cutoffType.value = suggestedFilePeriod.value.cutoff
}

async function importAttendance() {
  if (!selectedFile.value || !attendanceFileInfo.value || !attendanceFileWeekdays.value) {
    toast.error('Choose a biometric CSV with scans on scheduled weekdays for this payroll.')
    return
  }
  busy.value = true
  try {
    const result = await importPayrollAttendance(selectedFile.value, cutoffStart.value, cutoffEnd.value)
    attendanceResult.value = normalizeBatch(result.batch || result)
    runAttendanceBatch.value = attendanceResult.value.id || ''
    expandedEmployeeId.value = attendanceGroups.value.find((group) => group.exceptions)?.id
      ?? attendanceGroups.value[0]?.id ?? null
    workflowStep.value = 2
    toast.success('Attendance imported. Review daily records and exceptions before previewing payroll.')
  } catch (error) {
    toast.error(error.message || 'Attendance import failed.')
  } finally {
    busy.value = false
  }
}

function normalizeBatch(batch) {
  const days = (batch.daily || batch.days || []).map(normalizeDay)
  const exceptions = [
    ...(batch.exceptions || []),
    ...days.filter((day) => String(day.status || '').toLowerCase() === 'exception'),
  ]
  const errors = batch.errors || []
  return {
    ...batch,
    exception_count: batch.exception_count ?? exceptions.length + errors.length,
    errors,
    daily: days,
    exceptions: exceptions.map((item) => ({
      ...normalizeDay(item),
      reason: item.reason || item.exception_reason || '',
    })),
  }
}

function timeValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 5)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

function normalizeDay(day) {
  return {
    ...day,
    employee_name: day.employee_name || [day.first_name, day.last_name].filter(Boolean).join(' '),
    work_date: String(day.work_date || day.date || '').slice(0, 10),
    timeIn: timeValue(day.timeIn ?? day.time_in ?? day.first_scan_at),
    timeOut: timeValue(day.timeOut ?? day.time_out ?? day.last_scan_at),
    status: day.status || 'present',
  }
}

function beginProfileEdit(profile) {
  editingProfile.value = {
    id: profile.employee_id ?? profile.id,
    employee_name: displayName(profile),
    monthly_basic: Number(profile.monthly_basic ?? profile.monthly_basic_salary ?? profile.monthlyBasicSalary ?? profile.monthly_salary ?? 0),
    monthly_cola: Number(profile.monthly_cola ?? profile.monthlyCola ?? 0),
    biometric_person_id: profile.biometric_person_id || '',
    effective_from: String(profile.effective_from || new Date().toISOString()).slice(0, 10),
  }
}

async function saveProfile() {
  if (!editingProfile.value) return
  const profile = editingProfile.value
  if (!profile.id || !Number.isFinite(Number(profile.monthly_basic)) || Number(profile.monthly_basic) <= 0 || !Number.isFinite(Number(profile.monthly_cola)) || Number(profile.monthly_cola) < 0 || !profile.effective_from) {
    toast.error('Enter a positive monthly salary, a non-negative monthly COLA, and an effective date.')
    return
  }
  savingProfile.value = String(profile.id)
  try {
    const result = await updatePayrollProfile(profile.id, {
      monthlyBasicSalary: Number(profile.monthly_basic),
      monthlyCola: Number(profile.monthly_cola),
      biometricPersonId: profile.biometric_person_id.trim(),
      effectiveFrom: profile.effective_from,
    })
    const saved = result.profile || result
    profiles.value = profiles.value.map((row) => String(row.employee_id ?? row.id) === String(profile.id)
      ? { ...row, ...saved, monthly_basic: Number(saved.monthly_basic ?? saved.monthly_basic_salary ?? saved.monthlyBasicSalary ?? profile.monthly_basic), monthly_cola: Number(saved.monthly_cola ?? saved.monthlyCola ?? profile.monthly_cola), biometric_person_id: profile.biometric_person_id.trim() }
      : row)
    editingProfile.value = null
    toast.success('Pay profile saved.')
  } catch (error) {
    toast.error(error.message || 'Unable to save pay profile.')
  } finally {
    savingProfile.value = ''
  }
}

async function saveAttendanceAdjustment(payload) {
  const day = editingAttendanceDay.value
  if (!day?.id) return
  savingAttendanceDay.value = String(day.id)
  try {
    await updatePayrollAttendanceDay(day.id, payload)
    if (attendanceResult.value?.id) {
      attendanceResult.value = normalizeBatch(await getPayrollAttendanceBatch(attendanceResult.value.id))
    }
    editingAttendanceDay.value = null
    toast.success('Attendance adjustment saved. Recreate any draft payroll preview to use the updated values.')
  } catch (error) {
    toast.error(error.message || 'Unable to save attendance adjustment.')
  } finally {
    savingAttendanceDay.value = ''
  }
}

async function createPreview() {
  if (!cutoffStart.value || !cutoffEnd.value || !payDate.value || cutoffStart.value > cutoffEnd.value || payDate.value <= cutoffEnd.value) {
    toast.error('Choose a pay date after the attendance cutoff.')
    return
  }
  busy.value = true
  try {
    const result = await previewPayrollRun({
      periodStart: cutoffStart.value,
      periodEnd: cutoffEnd.value,
      payday: payDate.value,
      cutoff: cutoffType.value,
      includeContributions: cutoffType.value === 'second',
      attendanceBatchId: runAttendanceBatch.value || null,
    })
    preview.value = result.run || result
    activeRun.value = preview.value
    workflowStep.value = 4
    toast.success('Draft payroll saved. Review every employee and amount before any release.')
    await refreshRuns()
  } catch (error) {
    toast.error(error.message || 'Unable to create payroll preview.')
  } finally {
    busy.value = false
  }
}

async function refreshRuns() {
  try {
    runs.value = listFrom(await getPayrollRuns(), 'items')
  } catch (error) {
    toast.error(error.message || 'Unable to refresh payroll runs.')
  }
}

async function changeRunState(action, run) {
  busy.value = true
  try {
    const result = action === 'approve' ? await approvePayrollRun(run.id) : await lockPayrollRun(run.id)
    const updated = result.run || result
    preview.value = updated
    activeRun.value = updated
    toast.success(action === 'approve' ? 'Payroll approved.' : 'Payroll locked.')
    await refreshRuns()
  } catch (error) {
    toast.error(error.message || `Unable to ${action} payroll.`)
  } finally {
    busy.value = false
  }
}

async function selectRun(run) {
  if (!run?.id) return
  loadingRun.value = true
  try {
    const result = await getPayrollRun(run.id)
    const detail = result.run || result
    activeRun.value = detail
    preview.value = detail
    workflowStep.value = 4
  } catch (error) {
    toast.error(error.message || 'Unable to load payroll run details.')
  } finally {
    loadingRun.value = false
  }
}

const currentLines = computed(() => activeRun.value?.lines || activeRun.value?.items || [])
const filteredProfiles = computed(() => profiles.value.filter((profile) =>
  `${displayName(profile)} ${profile.employee_code || ''} ${profile.biometric_person_id || ''}`
    .toLowerCase().includes(profileSearch.value.trim().toLowerCase())))
function extraEarnings(line) {
  return (line.details?.manualEarnings || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
}

function lineColaPay(line) {
  return Number(line.cola_pay ?? line.colaPay ?? line.details?.colaPay ?? line.details?.cola_pay ?? 0)
}

function lineCharges(line) {
  return Array.isArray(line.charges) ? line.charges : Array.isArray(line.details?.charges) ? line.details.charges : []
}

function chargeEarnings(line) {
  return lineCharges(line).reduce((sum, entry) => sum + (entry.type === 'other_non_taxable_earning' || (entry.type === 'basic_pay_adjustment' && Number(entry.amount) > 0) ? Number(entry.amount || 0) : 0), 0)
}

function chargeDeductions(line) {
  return lineCharges(line).reduce((sum, entry) => sum + (entry.type !== 'other_non_taxable_earning' && !(entry.type === 'basic_pay_adjustment' && Number(entry.amount) > 0) ? Math.abs(Number(entry.amount || 0)) : 0), 0)
}

function timeDeductions(line) {
  return Number(line.absence_deduction || 0) + Number(line.late_deduction || 0) + Number(line.undertime_deduction || 0)
}

function statutoryDeductions(line) {
  return Number(line.employee_sss || 0) + Number(line.employee_philhealth || 0) + Number(line.employee_pagibig || 0)
}

const registerTotals = computed(() => currentLines.value.reduce((totals, line) => {
  totals.basic += Number(line.gross_salary || 0)
  totals.extras += extraEarnings(line) + lineColaPay(line)
  totals.chargeEarnings += chargeEarnings(line)
  totals.charges += chargeDeductions(line)
  totals.time += timeDeductions(line)
  totals.statutory += statutoryDeductions(line)
  totals.net += Number(line.net_pay || 0)
  return totals
}, { basic: 0, extras: 0, chargeEarnings: 0, charges: 0, time: 0, statutory: 0, net: 0 }))
const remittanceTotals = computed(() => currentLines.value.reduce((totals, line) => {
  for (const field of Object.keys(totals)) totals[field] += Number(line[field] || 0)
  return totals
}, { employee_sss: 0, employer_sss: 0, employer_ec: 0, employee_philhealth: 0,
  employer_philhealth: 0, employee_pagibig: 0, employer_pagibig: 0 }))
const totalNet = computed(() => registerTotals.value.net)
const unverifiedFirstCutoffCount = computed(() => activeRun.value?.cutoff === 'second' && activeRun.value?.include_contributions
  ? currentLines.value.filter((line) => !['saved-first-cutoff-approved', 'saved-first-cutoff-locked', 'hr-override']
    .includes(line.details?.sssAssessment?.firstCutoffSource)).length : 0)
const reviewExceptionCount = computed(() => currentLines.value.reduce((count, line) => count +
  (line.details?.attendance || []).filter((day) => day.status === 'exception').length, 0))
const reviewImportErrorCount = computed(() => Number(currentLines.value[0]?.details?.attendanceImportErrors || 0))
const legacyHolidayLineCount = computed(() => currentLines.value.reduce((count, line) => count +
  (line.details?.manualEarnings || []).filter((entry) => entry.type === 'special_holiday_pay').length, 0))
const attendanceDays = computed(() => attendanceResult.value?.daily || [])
const unresolvedScanCount = computed(() => attendanceDays.value.filter((day) => day.status === 'exception').length)
const attendanceGroups = computed(() => {
  const groups = new Map()
  for (const day of attendanceDays.value) {
    const id = String(day.employee_id ?? day.employee_code)
    const group = groups.get(id) || { id, name: day.employee_name || day.employee_code || `Employee ${id}`, code: day.employee_code, days: [], exceptions: 0, lateMinutes: 0, undertimeMinutes: 0 }
    group.days.push(day)
    if (day.status === 'exception') group.exceptions += 1
    group.lateMinutes += Number(day.late_minutes || 0)
    group.undertimeMinutes += Number(day.undertime_minutes || 0)
    groups.set(id, group)
  }
  return [...groups.values()].map((group) => ({ ...group, days: group.days.sort((a, b) => a.work_date.localeCompare(b.work_date)) }))
    .sort((a, b) => b.exceptions - a.exceptions || a.name.localeCompare(b.name))
})
const visibleAttendanceGroups = computed(() => attendanceGroups.value.filter((group) =>
  (!onlyAttendanceExceptions.value || group.exceptions > 0) &&
  `${group.name} ${group.code || ''}`.toLowerCase().includes(attendanceSearch.value.trim().toLowerCase())))

function openPayslip(line, run = activeRun.value, pdfBase64 = null) {
  selectedPayslip.value = { line, run, pdfBase64 }
}

function beginEarningsEdit(line) {
  editingEarnings.value = {
    line,
    earnings: (Array.isArray(line.details?.manualEarnings) ? line.details.manualEarnings : []).map((entry) => ({
      ...entry, wasLegacyHolidayPay: entry.type === 'special_holiday_pay',
    })),
    holidayDate: '',
    holidayApprovedHours: 8,
    holidayOvertimeHours: 0,
  }
  selectedPayslip.value = null
}

function earningsDailyRate(line) {
  return Number(line.daily_rate || 0) || Number(line.monthly_basic_salary || 0) * 12 / 261
}

const suggestedHolidayPremium = computed(() => editingEarnings.value
  ? Math.round(earningsDailyRate(editingEarnings.value.line) * Number(editingEarnings.value.holidayApprovedHours || 0) / 8 * 0.3 * 100) / 100 : 0)
const suggestedHolidayOvertime = computed(() => editingEarnings.value
  ? Math.round(earningsDailyRate(editingEarnings.value.line) / 8 * 1.3 * 1.3 * Number(editingEarnings.value.holidayOvertimeHours || 0) * 100) / 100 : 0)

function addCalculatedHoliday() {
  const editor = editingEarnings.value
  if (!editor) return
  const hours = Number(editor.holidayOvertimeHours)
  const approvedHours = Number(editor.holidayApprovedHours)
  const date = editor.holidayDate
  if (!date || date < String(activeRun.value?.period_start || '').slice(0, 10) || date > String(activeRun.value?.period_end || '').slice(0, 10)) {
    toast.error('Choose a holiday date inside this payroll period.')
    return
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  if (weekday < 1 || weekday > 5) {
    toast.error('This calculator is for a scheduled Monday–Friday special holiday. Use an HR-approved amount for rest-day work.')
    return
  }
  if (!Number.isFinite(hours) || hours < 0 || hours > 24 || Math.abs(hours * 100 - Math.round(hours * 100)) > 0.000001) {
    toast.error('Enter 0–24 approved overtime hours, with up to two decimals.')
    return
  }
  if (!Number.isFinite(approvedHours) || approvedHours <= 0 || approvedHours > 8 ||
      Math.abs(approvedHours * 100 - Math.round(approvedHours * 100)) > 0.000001 ||
      editor.earnings.some((earning) => earning.type === 'holiday_premium' && earning.holidayDate === date)) {
    toast.error('Enter 0.01–8 approved paid hours and use each holiday date only once.')
    return
  }
  if (editor.earnings.length + (hours > 0 ? 2 : 1) > 6) {
    toast.error('A draft allows at most six extra earning lines.')
    return
  }
  if (suggestedHolidayPremium.value <= 0 || (hours > 0 && suggestedHolidayOvertime.value <= 0)) {
    toast.error('Set a positive monthly salary for this employee before adding holiday earnings.')
    return
  }
  editor.earnings.push({ type: 'holiday_premium', amount: suggestedHolidayPremium.value,
    note: `WSH/RD premium for ${approvedHours} approved paid hours on ${date}`,
    approvedHours, holidayDate: date })
  if (hours > 0) editor.earnings.push({ type: 'overtime', amount: suggestedHolidayOvertime.value, note: `Approved special-holiday overtime ${hours}h on ${date}` })
  editor.holidayDate = ''
  editor.holidayOvertimeHours = 0
}

function addEarning(type) {
  if (!editingEarnings.value || editingEarnings.value.earnings.length >= 6) return
  editingEarnings.value.earnings.push({ type, amount: '', note: '' })
}

function onEarningTypeChange(earning) {
  if (!earning.wasLegacyHolidayPay) return
  earning.amount = ''
  earning.note = ''
  earning.wasLegacyHolidayPay = false
}

async function saveEarnings() {
  if (!editingEarnings.value || !activeRun.value) return
  busy.value = true
  try {
    const earnings = editingEarnings.value.earnings.map(({ wasLegacyHolidayPay, ...entry }) => entry)
    const line = await updatePayrollManualEarnings(activeRun.value.id, editingEarnings.value.line.id, earnings)
    activeRun.value = { ...activeRun.value, lines: currentLines.value.map((item) => item.id === line.id ? line : item) }
    editingEarnings.value = null
    toast.success('Manual earnings saved to this draft. Compare the result with HR’s workbook before approval.')
  } catch (error) {
    toast.error(error.message || 'Unable to save manual earnings.')
  } finally {
    busy.value = false
  }
}

function beginChargesEdit(line) {
  editingCharges.value = { line, charges: lineCharges(line).map((entry) => ({ ...entry })) }
  selectedPayslip.value = null
}

function addCharge(type = 'cash_advance') {
  if (!editingCharges.value || editingCharges.value.charges.length >= 20) return
  editingCharges.value.charges.push({ type, amount: '', note: '' })
}

async function saveCharges() {
  if (!editingCharges.value || !activeRun.value) return
  if (editingCharges.value.charges.length > 20) {
    toast.error('A payroll cutoff allows at most 20 charge entries per employee.')
    return
  }
  const charges = editingCharges.value.charges.map((entry) => ({ ...entry, amount: Number(entry.amount) }))
  if (charges.some((entry) => !Number.isFinite(entry.amount) || (entry.type === 'basic_pay_adjustment' ? entry.amount === 0 : entry.amount <= 0))) {
    toast.error('Enter a non-zero signed adjustment or a positive amount for each charge or earning.')
    return
  }
  busy.value = true
  try {
    const result = await updatePayrollCharges(activeRun.value.id, editingCharges.value.line.id, charges)
    const line = result.line || result
    activeRun.value = { ...activeRun.value, lines: currentLines.value.map((item) => String(item.id) === String(line.id) ? line : item) }
    editingCharges.value = null
    toast.success('Payroll charges saved to this draft.')
  } catch (error) {
    toast.error(error.message || 'Unable to save payroll charges.')
  } finally {
    busy.value = false
  }
}

function beginFirstCutoffEdit(line) {
  editingFirstCutoff.value = { line,
    firstCutoffPay: Number(line.details?.sssAssessment?.firstCutoffPay ?? Number(line.monthly_basic_salary || 0) / 2),
    reason: '',
  }
  selectedPayslip.value = null
}

async function saveFirstCutoff() {
  const editor = editingFirstCutoff.value
  if (!editor || !activeRun.value) return
  const value = Number(editor.firstCutoffPay)
  if (editor.firstCutoffPay === '' || editor.firstCutoffPay == null ||
      !Number.isFinite(value) || value < 0 || value > 10000000 ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.000001 ||
      String(editor.reason || '').trim().length < 3) {
    toast.error('Enter a valid 15th payroll amount and a reason of at least three characters.')
    return
  }
  busy.value = true
  try {
    const result = await updatePayrollFirstCutoffPay(activeRun.value.id, editor.line.id, value, editor.reason.trim())
    const line = result.line || result
    activeRun.value = { ...activeRun.value, lines: currentLines.value.map((item) => String(item.id) === String(line.id) ? line : item) }
    editingFirstCutoff.value = null
    toast.success('First-cutoff amount saved with an audit reason; SSS and net pay were recalculated.')
  } catch (error) {
    toast.error(error.message || 'Unable to save first-cutoff amount.')
  } finally { busy.value = false }
}

async function payslipPdf(download = false) {
  const selected = selectedPayslip.value
  if (!selected) return
  const tab = download ? null : window.open('', '_blank')
  if (tab) tab.document.title = 'Loading payslip…'
  try {
    const pdf = selected.pdfBase64
      ? new Blob([Uint8Array.from(atob(selected.pdfBase64), (character) => character.charCodeAt(0))], { type: 'application/pdf' })
      : await getPayrollPayslipPdf(canManage.value ? selected.run.id : null, selected.line.id)
    const url = URL.createObjectURL(pdf)
    if (download || !tab) {
      const link = document.createElement('a')
      link.href = url
      link.download = `payslip-${String(selected.line.employee_code || selected.line.id).replace(/[^a-zA-Z0-9_-]/g, '_')}-${String(selected.run.payday || '').slice(0, 10)}.pdf`
      link.click()
      if (!download) toast.success('The PDF was saved because the browser blocked the print tab. Open the file to print it.')
    } else tab.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 300000)
  } catch (error) {
    if (tab) tab.close()
    toast.error(error.message || 'Unable to load payslip PDF.')
  }
}

async function onTestFileChange(event) {
  testFile.value = event.target.files?.[0] || null
  testCsvInfo.value = null
  testPersonId.value = ''
  testResult.value = null
  if (!testFile.value) return
  busy.value = true
  try {
    testCsvInfo.value = await inspectPayrollTestCsv(testFile.value)
    toast.success(`${testCsvInfo.value.people.length} biometric IDs found. Select your employee and biometric ID to test.`)
  } catch (error) {
    toast.error(error.message || 'Unable to read biometric CSV.')
  } finally { busy.value = false }
}

async function runEmployeeTest() {
  if (!testFile.value || !testEmployeeId.value || !testPersonId.value) {
    toast.error('Choose a biometric CSV, employee, and matching Person ID.')
    return
  }
  if (testValidationError.value) {
    toast.error(testValidationError.value)
    return
  }
  busy.value = true
  testResult.value = null
  try {
    testResult.value = await previewEmployeePayTest(testFile.value, {
      employeeId: testEmployeeId.value, biometricPersonId: testPersonId.value,
      monthlyBasicSalary: testMonthlySalary.value, monthlyCola: testMonthlyCola.value, firstCutoffPay: testFirstCutoffPay.value,
      workedSpecialHolidayHours: testWorkedHolidayHours.value,
      specialHolidayOvertimeHours: testHolidayOvertimeHours.value, periodStart: testCutoffStart.value,
      periodEnd: testCutoffEnd.value, payday: testPayDate.value, cutoff: testCutoffType.value,
    })
    toast.success('No-save pay test is ready. Compare the payslip with your actual HR record.')
  } catch (error) {
    toast.error(error.message || 'Unable to calculate test payslip.')
  } finally { busy.value = false }
}

async function emailPayslip(line = selectedPayslip.value?.line) {
  if (!line || !activeRun.value || !payrollFinalizationEnabled) return
  busy.value = true
  try {
    const result = await sendPayrollPayslip(activeRun.value.id, line.id)
    toast.success(result.status === 'already_sent' ? 'This payslip was already emailed.' : 'Payslip emailed to the employee’s account address.')
  } catch (error) {
    toast.error(error.message || 'Unable to email payslip.')
  } finally {
    busy.value = false
  }
}

async function emailAllPayslips() {
  if (!activeRun.value || !['approved', 'locked'].includes(activeRun.value.status) || !payrollFinalizationEnabled) return
  if (!window.confirm(`Email ${currentLines.value.length} approved payslips to employee account addresses?`)) return
  busy.value = true
  let sent = 0
  let skipped = 0
  let failed = 0
  for (const [index, line] of currentLines.value.entries()) {
    sendProgress.value = `${index + 1} of ${currentLines.value.length}`
    try {
      const result = await sendPayrollPayslip(activeRun.value.id, line.id)
      if (result.status === 'sent') sent += 1
      else skipped += 1
    } catch { failed += 1 }
  }
  busy.value = false
  sendProgress.value = ''
  toast[failed ? 'error' : 'success'](`${sent} emailed, ${skipped} already sent, ${failed} failed. Review missing employee emails if needed.`)
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader :title="isEmployee ? 'My payslips' : 'Pay'" :description="isEmployee ? 'View and save your approved payslips.' : 'Prepare payroll runs, verify earnings, and review payslips before release.'" eyebrow="People operations" />

    <div v-if="loading" class="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400" role="status">Loading payroll workspace…</div>

    <template v-else-if="isEmployee">
      <section class="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="mb-4"><h2 class="font-semibold text-gray-100">My payslips</h2><p class="mt-1 text-sm text-gray-400">Only your payroll results are shown here.</p></div>
        <EmptyState v-if="!myLines.length" title="No payslips yet" description="Your approved payroll results will appear here after HR completes a payroll run." />
        <div v-else class="space-y-3">
          <article v-for="line in myLines" :key="line.id || `${line.period_start}-${line.pay_date}`" class="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold text-gray-100">Payday {{ line.payday || line.pay_date || '—' }}</h3><p class="mt-1 text-xs text-gray-500">Attendance cutoff {{ line.period_end }} · weekends excluded</p></div><p class="text-xl font-semibold text-emerald-300">{{ money(line.net_pay) }}</p></div>
            <dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5"><div><dt class="text-xs text-gray-500">Gross salary</dt><dd class="mt-1 text-gray-200">{{ money(line.gross_salary ?? line.grossSalary ?? line.basic_pay) }}</dd></div><div><dt class="text-xs text-gray-500">SSS</dt><dd class="mt-1 text-gray-200">{{ money(line.employee_sss ?? line.sss_employee ?? line.sss_deduction) }}</dd></div><div><dt class="text-xs text-gray-500">PhilHealth</dt><dd class="mt-1 text-gray-200">{{ money(line.employee_philhealth ?? line.phic_employee ?? line.phic_deduction) }}</dd></div><div><dt class="text-xs text-gray-500">Pag-IBIG</dt><dd class="mt-1 text-gray-200">{{ money(line.employee_pagibig ?? line.pagibig_employee ?? line.pagibig_deduction) }}</dd></div><div><dt class="text-xs text-gray-500">13th-month accrual</dt><dd class="mt-1 text-gray-200">{{ money(line.thirteenth_month_accrual ?? line.thirteenthMonthAccrual) }}</dd></div></dl>
            <dl class="mt-3 grid grid-cols-2 gap-3 border-t border-gray-800 pt-3 text-sm sm:grid-cols-3"><div><dt class="text-xs text-gray-500">Absence deduction</dt><dd class="mt-1 text-gray-200">{{ money(line.absence_deduction) }}</dd></div><div><dt class="text-xs text-gray-500">Late deduction ({{ Number(line.late_minutes || 0) }} min)</dt><dd class="mt-1 text-gray-200">{{ money(line.late_deduction) }}</dd></div><div><dt class="text-xs text-gray-500">Undertime deduction ({{ Number(line.undertime_minutes || 0) }} min)</dt><dd class="mt-1 text-gray-200">{{ money(line.undertime_deduction) }}</dd></div></dl>
            <div class="mt-3 flex items-center justify-between border-t border-gray-800 pt-3"><p v-if="line.status" class="text-xs text-gray-500">Status: {{ line.status }}</p><AppButton size="sm" variant="secondary" @click="openPayslip(line, line)">View payslip</AppButton></div>
          </article>
        </div>
      </section>
    </template>

    <template v-else-if="canManage">
        <section class="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5" aria-label="Current payroll period">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div><p class="text-xs font-semibold uppercase tracking-wider text-primary-400">{{ workflowStep === 4 && activeRun ? 'Reviewing saved payroll' : 'Payroll preparation' }}</p><h2 class="mt-1 text-lg font-semibold text-gray-100">{{ workflowStep === 4 && activeRun ? `Payday ${activeRun.payday || activeRun.pay_date}` : `${cutoffType === 'first' ? '15th payday' : 'Month-end payday'} · ${payrollMonth}` }}</h2><p class="mt-1 text-sm text-gray-400">{{ workflowStep === 4 && activeRun ? `${currentLines.length} employees · ${activeRun.status || 'draft'}` : `Attendance cutoff ${cutoffEnd} · Pay date ${payDate}` }}</p></div>
            <div class="flex flex-wrap gap-2"><AppButton size="sm" variant="secondary" @click="workflowStep = 5">Test one employee</AppButton><AppButton size="sm" variant="secondary" @click="workflowStep = 6">Past runs</AppButton></div>
          </div>
          <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-gray-800 pt-3 text-xs text-gray-400"><span :class="profileIssueCount || !profiles.length ? 'text-amber-300' : 'text-emerald-300'">{{ profiles.length ? `${profiles.length - profileIssueCount}/${profiles.length} salary + biometric IDs entered` : 'No pay profiles loaded' }}</span><span :class="runAttendanceBatch ? 'text-emerald-300' : 'text-gray-500'">{{ runAttendanceBatch ? `Attendance batch ${runAttendanceBatch}` : 'Attendance not imported' }}</span><span :class="unresolvedScanCount ? 'text-amber-300' : 'text-gray-500'">{{ unresolvedScanCount }} scan exceptions</span><span v-if="activeRun" class="text-primary-300">Open run: {{ activeRun.status || 'draft' }}</span></div>
        </section>

        <p v-if="!payrollFinalizationEnabled" class="rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">Review mode: attendance confirmation, draft calculation, and payslip preview are available. Actual approval, payment recording, and payslip release are currently disabled while HR verifies employee salaries and payroll.</p>

        <nav class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Payroll preparation steps">
          <button v-for="step in workflowSteps" :key="step.id" type="button" class="rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400" :class="workflowStep === step.id ? 'border-primary-500 bg-primary-950/30 text-white' : 'border-gray-800 bg-gray-900 text-gray-300 hover:border-gray-600 hover:bg-gray-800'" :aria-current="workflowStep === step.id ? 'step' : undefined" @click="workflowStep = step.id"><span class="flex items-center gap-2"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">{{ step.id }}</span><strong class="text-sm">{{ step.label }}</strong></span><span class="mt-1 block pl-8 text-xs opacity-70">{{ step.detail }}</span></button>
        </nav>

        <div v-if="workflowStep === 5 || workflowStep === 6" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950/50 px-4 py-3 text-sm text-gray-400"><p>{{ workflowStep === 5 ? 'Sandbox: this calculation does not change payroll data.' : 'History: open a saved run to review its payslips.' }}</p><AppButton size="sm" variant="secondary" @click="workflowStep = 1">Back to payroll flow</AppButton></div>

        <section v-if="workflowStep === 5" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div class="mb-5"><h2 class="font-semibold text-gray-100">Test one employee’s pay</h2><p class="mt-1 text-sm text-gray-400">This preview reads a biometric CSV and calculates one payslip. It does not save a pay profile, attendance batch, or payroll run.</p></div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label class="text-xs text-gray-400">Payroll month<input v-model="testPayrollMonth" type="month" class="form-control mt-1"></label>
            <label class="text-xs text-gray-400">Payday<select v-model="testCutoffType" class="form-control mt-1"><option value="first">15th (previous 26th–10th)</option><option value="second">30th / month end (11th–25th)</option></select></label>
            <label class="text-xs text-gray-400">Employee<select v-model="testEmployeeId" class="form-control mt-1"><option value="">Select employee</option><option v-for="profile in profiles" :key="profile.employee_id" :value="profile.employee_id">{{ displayName(profile) }} · {{ profile.employee_code }}</option></select></label>
            <label class="text-xs text-gray-400">Biometric CSV<input type="file" accept=".csv,text/csv" class="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold" @change="onTestFileChange"></label>
            <label class="text-xs text-gray-400">CSV person / biometric ID<select v-model="testPersonId" class="form-control mt-1" :disabled="!testCsvInfo"><option value="">Select matching person</option><option v-for="person in testCsvInfo?.people || []" :key="`${person.identifierType}:${person.personId}`" :value="person.personId">{{ person.name || 'Unnamed' }} · {{ person.personId }} ({{ person.scans }} scans)</option></select></label>
            <label class="text-xs text-gray-400">Monthly basic salary (₱)<input v-model.number="testMonthlySalary" type="number" min="0" step="0.01" class="form-control mt-1"></label>
            <label class="text-xs text-gray-400">Monthly COLA (₱)<input v-model.number="testMonthlyCola" type="number" min="0" step="0.01" class="form-control mt-1"><span class="mt-1 block text-[11px] text-gray-500">Optional; half is included on each payday as non-taxable pay.</span></label>
            <label v-if="testCutoffType === 'second'" class="text-xs text-gray-400">15th cutoff SSS-eligible pay (₱)<input v-model="testFirstCutoffPay" type="number" min="0" step="0.01" :placeholder="String(Number(testMonthlySalary || 0) / 2)" class="form-control mt-1"><span class="mt-1 block text-[11px] text-gray-500">Leave blank to assume half the monthly basic.</span></label>
            <label class="text-xs text-gray-400">Approved special-holiday paid hours<input v-model.number="testWorkedHolidayHours" type="number" min="0" :max="testScheduledWeekdayCount * 8" step="0.25" class="form-control mt-1" aria-describedby="special-holiday-rule"><span class="mt-1 block text-[11px] text-gray-500">7 hours = 0.875 of an 8-hour day.</span></label>
            <label class="text-xs text-gray-400">Overtime hours on that holiday<input v-model.number="testHolidayOvertimeHours" type="number" min="0" step="0.25" class="form-control mt-1" aria-describedby="special-holiday-rule"></label>
            <div id="special-holiday-rule" class="self-end rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-100"><p>Extra earnings: <strong>{{ money(testHolidayPremium) }}</strong> WSH/RD premium + <strong>{{ money(testHolidayOvertimePay) }}</strong> holiday overtime.</p><p class="mt-1 text-amber-200/80">The basic already includes the regular day. WSH/RD extra = approved hours ÷ 8 × daily rate × 30%. Holiday OT = hourly rate × 130% × 130% × approved OT hours.</p></div>
          </div>
          <p v-if="testValidationError" class="mt-3 text-xs text-amber-300" role="alert">{{ testValidationError }}</p>
          <p class="mt-3 text-xs text-gray-500">Attendance cutoff {{ testCutoffEnd }} · Pay date {{ testPayDate }}. Weekends and fare are excluded. Overtime comes from the approved form, not late scans.</p>
          <p v-if="testCsvInfo" class="mt-2 text-xs text-gray-400">CSV dates: {{ testCsvInfo.firstDate }} to {{ testCsvInfo.lastDate }} · {{ testCsvInfo.people.length }} people. Match the name and biometric ID carefully.</p>
          <div class="mt-5"><AppButton :loading="busy" :disabled="!testFile || !testEmployeeId || !testPersonId || Boolean(testValidationError)" @click="runEmployeeTest">Calculate test payslip</AppButton></div>

          <div v-if="testResult" class="mt-6 rounded-lg border border-gray-700 bg-gray-950/50 p-4">
            <div class="flex flex-wrap items-end justify-between gap-3"><div><h3 class="font-semibold text-gray-100">{{ testResult.line.employee_name }} · Pay date {{ testResult.run.payday }}</h3><p class="mt-1 text-xs text-gray-400">Attendance cutoff {{ testResult.run.period_end }} · Not saved</p></div><strong class="text-xl text-emerald-300">{{ money(testResult.line.net_pay) }}</strong></div>
            <p v-if="testResult.identityWarning" class="mt-3 rounded-md border border-red-800/40 bg-red-950/20 p-3 text-xs text-red-200">{{ testResult.identityWarning }}</p>
            <p v-if="testResult.warnings.length" class="mt-3 rounded-md border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">{{ testResult.warnings.length }} workday(s) have missing or incomplete scans. This net pay is provisional: those days are not deducted until HR confirms absence, leave, or offsite work.</p>
            <p v-else class="mt-3 text-xs text-emerald-300">All scheduled workdays have a time-in and time-out scan.</p>
            <div class="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3"><span>Basic {{ money(testResult.line.gross_salary) }}</span><span>COLA (non-taxable) {{ money(testResult.line.cola_pay ?? testResult.line.colaPay ?? 0) }}</span><span>WSH/RD premium {{ money(testResult.specialHoliday.holidayPremium) }}</span><span>Special-holiday OT {{ money(testResult.specialHoliday.overtimePay) }}</span><span>Late {{ money(testResult.line.late_deduction) }}</span><span>Undertime {{ money(testResult.line.undertime_deduction) }}</span><span>Contributions {{ money(Number(testResult.line.employee_sss) + Number(testResult.line.employee_philhealth) + Number(testResult.line.employee_pagibig)) }}</span></div>
            <p v-if="testResult.sssAssessment" class="mt-3 text-xs text-gray-400">SSS basis: {{ money(testResult.sssAssessment.firstCutoffPay) }} first cutoff + {{ money(testResult.sssAssessment.secondCutoffNetBasic) }} second cutoff net basic + {{ money(testResult.sssAssessment.overtimePay) }} overtime = {{ money(testResult.sssAssessment.monthlyCompensation) }}. WSH/RD premium is excluded, matching the workbook’s Remittance lookup.<span v-if="testResult.sssAssessment.firstCutoffSource === 'assumed-half-basic'" class="text-amber-300"> First cutoff is assumed; enter its actual eligible pay above if different.</span></p>
            <div class="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-800 pt-4"><label class="text-xs text-gray-400">Actual net received (optional)<input v-model.number="actualNetReceived" type="number" min="0" step="0.01" class="form-control mt-1 max-w-48" placeholder="Enter bank amount"></label><p v-if="actualNetReceived !== '' && Number.isFinite(Number(actualNetReceived))" class="pb-2 text-sm" :class="Math.abs(Number(testResult.line.net_pay) - Number(actualNetReceived)) < 0.01 ? 'text-emerald-300' : 'text-amber-300'">{{ Math.abs(Number(testResult.line.net_pay) - Number(actualNetReceived)) < 0.01 ? 'Matches your received amount' : `Difference: ${money(Number(testResult.line.net_pay) - Number(actualNetReceived))} (calculated minus received)` }}</p></div>
            <div class="mt-4 flex flex-wrap gap-2"><AppButton size="sm" variant="secondary" @click="openPayslip(testResult.line, testResult.run, testResult.pdfBase64)">View / print test payslip</AppButton></div>
            <details class="mt-4"><summary class="cursor-pointer text-xs text-gray-400">Review attendance records</summary><div class="mt-2 max-h-72 overflow-auto rounded-md border border-gray-800"><table class="w-full min-w-[550px] text-left text-xs"><thead><tr class="border-b border-gray-800 text-gray-500"><th class="p-2">Date</th><th class="p-2">Status</th><th class="p-2">Time in</th><th class="p-2">Time out</th><th class="p-2">Late</th><th class="p-2">Undertime</th></tr></thead><tbody><tr v-for="day in testResult.days" :key="day.date" class="border-b border-gray-800/70"><td class="p-2">{{ day.date }}</td><td class="p-2">{{ day.status }}</td><td class="p-2">{{ timeValue(day.firstScanAt) || '—' }}</td><td class="p-2">{{ timeValue(day.lastScanAt) || '—' }}</td><td class="p-2">{{ day.lateMinutes }}</td><td class="p-2">{{ day.undertimeMinutes }}</td></tr></tbody></table></div></details>
          </div>
        </section>

        <section v-if="workflowStep === 1" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 class="font-semibold text-gray-100">1. Set up the pay period</h2><p class="mt-1 text-sm text-gray-400">Choose the payroll schedule, then verify salary and biometric mapping for each employee.</p></div><span class="text-xs text-gray-500">{{ profiles.length }} employees</span></div>
          <div class="mb-5 grid gap-3 rounded-lg border border-gray-800 bg-gray-950/40 p-4 sm:grid-cols-3">
            <label class="block text-xs font-medium text-gray-400">Payroll month<input v-model="payrollMonth" type="month" class="form-control mt-1.5"></label>
            <label class="block text-xs font-medium text-gray-400">Payday<select v-model="cutoffType" class="form-control mt-1.5"><option value="first">15th payday</option><option value="second">Month-end payday</option></select></label>
            <label class="block text-xs font-medium text-gray-400">Pay date<input v-model="payDate" type="date" class="form-control mt-1.5"><span class="mt-1 block font-normal" :class="payDateError ? 'text-amber-300' : 'text-gray-500'">{{ payDateError ? 'Pay date must be after the cutoff.' : 'Suggested date; HR can adjust it.' }}</span></label>
          </div>
          <p v-if="profileIssueCount" class="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">{{ profileIssueCount }} profile(s) are missing a positive salary or biometric ID. Review them before importing scans; unmatched IDs create exceptions.</p>
          <div class="rounded-lg border border-gray-800 p-4 text-sm text-gray-300"><p>Employee compensation, Attendance IDs, schedules, and effective history are managed in People.</p><RouterLink to="/compensation" class="mt-2 inline-block font-semibold text-primary-300 underline">Open Pay &amp; schedules</RouterLink><RouterLink to="/employees" class="ml-4 text-primary-300 underline">Employee records</RouterLink></div>
          <div class="mt-5 text-right"><AppButton @click="workflowStep = 2">Continue to timekeeping</AppButton></div>
        </section>

        <section v-if="workflowStep === 2" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 class="font-semibold text-gray-100">2. Select confirmed attendance</h2>
          <p class="mt-2 text-sm text-gray-400">HR previews the CSV and verifies missing records, undertime, and official leave in Attendance. Only confirmed reviews can be used for payroll.</p>
          <RouterLink to="/attendance" class="mt-3 inline-block font-semibold text-primary-300 underline">Open Attendance workspace</RouterLink>
          <label class="mt-5 block text-sm text-gray-300">Confirmed review for {{ cutoffStart }} – {{ cutoffEnd }}
            <select :value="runAttendanceBatch" class="form-control mt-2" @change="chooseAttendance($event.target.value)">
              <option value="">Choose a confirmed review</option>
              <option v-for="b in eligibleReviews" :key="b.id" :value="b.id">Review {{ b.id }} · {{ b.period_start }} – {{ b.period_end }} · {{ b.file_name }}</option>
            </select>
          </label>
          <p v-if="!eligibleReviews.length" class="mt-3 text-sm text-amber-300">No confirmed review covers this cutoff. Finish Attendance review first.</p>
          <div v-if="attendanceResult" class="mt-4 rounded-lg border border-gray-700 p-4 text-sm text-gray-300">
            Review {{ attendanceResult.id }} · {{ attendanceResult.review_state }} · {{ attendanceResult.daily?.length || 0 }} reviewed employee-days
            <RouterLink :to="{path:'/attendance',query:{batch:attendanceResult.id}}" class="ml-3 text-primary-300 underline">Inspect records and HR decisions</RouterLink>
          </div>
          <div class="mt-5 flex justify-between"><AppButton variant="secondary" @click="workflowStep = 1">Back to setup</AppButton><AppButton :disabled="!runAttendanceBatch || attendanceResult?.review_state !== 'confirmed'" @click="workflowStep = 3">Continue to calculation</AppButton></div>
        </section>

        <section v-if="workflowStep === 3" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div class="mb-4"><h2 class="font-semibold text-gray-100">3. Calculate a payroll draft</h2><p class="mt-1 text-sm text-gray-400">The system combines employee pay and reviewed attendance into a saved draft for every active employee.</p></div>
          <dl class="grid gap-3 rounded-lg border border-gray-800 bg-gray-950/50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt class="text-xs text-gray-500">Attendance cutoff</dt><dd class="mt-1 font-medium text-gray-200">{{ cutoffEnd }}</dd></div><div><dt class="text-xs text-gray-500">Pay date</dt><dd class="mt-1 font-medium text-gray-200">{{ payDate }}</dd></div><div><dt class="text-xs text-gray-500">Attendance source</dt><dd class="mt-1 font-medium text-gray-200">{{ runAttendanceBatch ? `Batch ${runAttendanceBatch}` : 'Missing batch' }}</dd></div><div><dt class="text-xs text-gray-500">Statutory deductions</dt><dd class="mt-1 font-medium text-gray-200">{{ cutoffType === 'second' ? 'SSS, PhilHealth, Pag-IBIG' : 'None on 15th payroll' }}</dd></div></dl>
          <p class="mt-4 text-xs leading-5 text-gray-400">Perfect attendance keeps the full half-month basic pay (₱7,500 for a ₱15,000 monthly salary), regardless of how many Monday–Friday dates fall in the cutoff. Only missed scheduled weekdays, lateness, and undertime reduce salary. SSS, PhilHealth, and Pag-IBIG are deducted on the month-end payroll; weekends and fare are excluded.</p>
          <p v-if="unresolvedScanCount || attendanceResult?.errors?.length" class="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">Review {{ unresolvedScanCount }} unresolved scan day(s) and {{ attendanceResult?.errors?.length || 0 }} import error(s). Payroll requires a confirmed attendance review with every issue resolved.</p>
          <p class="mt-3 text-xs text-gray-500">Creating this draft saves a payroll run in the connected database. It does not approve, email, or pay employees. Use “Test one employee” for a no-save calculation.</p>
          <div class="mt-5 flex justify-between"><AppButton variant="secondary" @click="workflowStep = 2">Back to timekeeping</AppButton><AppButton :loading="busy" :disabled="!runAttendanceBatch || attendanceResult?.review_state !== 'confirmed' || payDateError" @click="createPreview">Create saved draft</AppButton></div>
        </section>

        <section v-if="workflowStep === 6" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 class="font-semibold text-gray-100">Saved payroll runs</h2><p class="mt-1 text-sm text-gray-400">Open a run to inspect its employee register and payslips.</p></div><AppButton size="sm" @click="workflowStep = 1">Prepare payroll</AppButton></div>
            <EmptyState v-if="!runs.length" compact title="No payroll runs yet" description="Create a saved draft after pay profiles and attendance are ready, or use the no-save employee test." />
            <div v-else class="space-y-2"><article v-for="run in runs" :key="run.id" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3"><div><p class="font-medium text-gray-100">Payday {{ run.payday || run.pay_date || '—' }}</p><p class="mt-1 text-xs text-gray-500">Attendance cutoff {{ run.period_end || run.periodEnd }} · {{ run.employee_count ?? run.lines?.length ?? 0 }} employees · {{ money(run.totals?.net_pay ?? run.total_net_pay) }} net</p></div><div class="flex items-center gap-2"><span class="rounded-full bg-gray-800 px-2.5 py-1 text-xs font-semibold capitalize text-gray-300">{{ run.status || 'draft' }}</span><AppButton size="sm" variant="secondary" :loading="loadingRun" @click="selectRun(run)">Open register</AppButton></div></article></div>
        </section>

        <template v-if="workflowStep === 4">
          <section v-if="!activeRun" class="rounded-xl border border-gray-800 bg-gray-900 p-5"><h2 class="font-semibold text-gray-100">4. Review employee pay</h2><p class="mt-2 text-sm text-gray-400">No draft is open. Create one from the reviewed attendance batch, or open a saved run.</p><div class="mt-4 flex flex-wrap gap-2"><AppButton size="sm" :disabled="!runAttendanceBatch" @click="workflowStep = 3">Calculate draft</AppButton><AppButton size="sm" variant="secondary" @click="workflowStep = 6">Open saved runs</AppButton></div></section>
          <section v-if="activeRun" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div class="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 class="font-semibold text-gray-100">4. Review employee pay</h2><p class="mt-1 text-sm text-gray-400">Payday {{ activeRun.payday || activeRun.pay_date }} · Attendance cutoff {{ activeRun.period_end }} · {{ activeRun.status || 'preview' }}</p><p v-if="activeRun.status === 'draft'" class="mt-1 text-xs text-amber-300">Check overtime and holiday earnings against approved HR forms. Draft payslips are watermarked; email is disabled.</p></div><div class="flex flex-wrap items-center gap-2"><p class="mr-2 text-lg font-semibold text-emerald-300">{{ money(totalNet) }} net total</p><AppButton v-if="payrollFinalizationEnabled && ['draft', 'preview', 'pending_review'].includes(String(activeRun.status || 'draft').toLowerCase())" size="sm" variant="success" :loading="busy" :disabled="Boolean(reviewExceptionCount || reviewImportErrorCount || legacyHolidayLineCount || unverifiedFirstCutoffCount || currentLines.some(l => l.details?.payBasisReview?.required && !l.details?.payBasisReview?.verifiedReason))" @click="changeRunState('approve', activeRun)">Approve</AppButton><AppButton v-if="activeRun.status === 'approved' || activeRun.status === 'locked'" size="sm" variant="secondary" :loading="busy" @click="exportPayment('payment')">Payment register CSV</AppButton><AppButton v-if="payrollFinalizationEnabled && activeRun.status === 'approved' && !activeRun.payment" size="sm" :loading="busy" @click="beginPayment">Record actual payment</AppButton><AppButton v-if="payrollFinalizationEnabled && activeRun.status === 'approved' && activeRun.payment" size="sm" variant="secondary" :loading="busy" @click="changeRunState('lock', activeRun)">Close payroll &amp; release payslips</AppButton><AppButton v-if="payrollFinalizationEnabled && activeRun.status === 'locked' && activeRun.payment" size="sm" :loading="busy" @click="emailAllPayslips">{{ sendProgress ? `Sending ${sendProgress}` : 'Email all payslips' }}</AppButton></div></div>
            <div class="mb-4 flex flex-wrap gap-3 text-sm"><button class="text-primary-300 underline" :disabled="busy" @click="exportPayment('register')">Export payroll register</button><button class="text-primary-300 underline" :disabled="busy" @click="exportPayment('remittance')">Export contribution report</button><span v-if="activeRun.payment" class="text-gray-400">Payment recorded: {{activeRun.payment.reference}} · {{activeRun.payment.paid_on}}</span></div>
            <p v-if="reviewExceptionCount || reviewImportErrorCount" class="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">Approval is blocked: {{ reviewExceptionCount }} unresolved scan day(s), {{ reviewImportErrorCount }} import error(s). Correct the timekeeping batch and recalculate this draft.</p>
            <div v-if="activeRun.status==='draft' && currentLines.some(l=>l.details?.payBasisReview?.required && !l.details?.payBasisReview?.verifiedReason)" class="mb-4 rounded-lg border border-amber-800/40 p-3 text-sm text-amber-200">
              Employment or compensation changed within this cutoff. Review basic pay and COLA against company policy, enter any needed adjustments under Charges, and verify each affected employee.
              <button v-for="l in currentLines.filter(l=>l.details?.payBasisReview?.required && !l.details?.payBasisReview?.verifiedReason)" :key="l.id" class="ml-3 underline" @click="payBasisForm={line:l,reason:''}">Verify {{displayName(l)}}</button>
            </div>
            <p v-if="legacyHolidayLineCount" class="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">{{ legacyHolidayLineCount }} old full-holiday-pay line(s) need HR review. Open each employee's Earnings, remove the old line, and add only the 30% WSH/RD premium. Existing drafts are not changed automatically.</p>
            <p v-if="unverifiedFirstCutoffCount" class="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">{{ unverifiedFirstCutoffCount }} employee(s) have no approved 15th payroll linked. Their SSS amount is provisional. Enter an HR-confirmed first-cutoff amount and reason before approval.</p>
            <dl class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7"><div v-for="summary in [{ label: 'Basic pay', value: registerTotals.basic }, { label: 'Extra earnings', value: registerTotals.extras }, { label: 'Charge earnings', value: registerTotals.chargeEarnings }, { label: 'Charges', value: registerTotals.charges }, { label: 'Time deductions', value: registerTotals.time }, { label: 'Contributions', value: registerTotals.statutory }, { label: 'Net pay', value: registerTotals.net }]" :key="summary.label" class="rounded-lg border border-gray-800 bg-gray-950/40 p-3"><dt class="text-xs text-gray-500">{{ summary.label }}</dt><dd class="mt-1 text-sm font-semibold text-gray-200">{{ money(summary.value) }}</dd></div></dl>
            <div v-if="loadingRun" class="rounded-lg border border-gray-800 p-4 text-sm text-gray-400" role="status">Loading run details...</div>
            <div v-else-if="!currentLines.length" class="rounded-lg border border-gray-800 p-4 text-sm text-gray-500">No employee line items are available.</div>
            <div v-else class="overflow-x-auto rounded-lg border border-gray-800">
              <table class="w-full min-w-[1020px] text-left text-sm">
                <thead class="border-b border-gray-800 bg-gray-950/40 text-xs uppercase text-gray-500"><tr><th class="px-3 py-2">Employee</th><th class="px-3 py-2 text-right">Basic</th><th class="px-3 py-2 text-right">Extra / charge earnings</th><th class="px-3 py-2 text-right">Charges</th><th class="px-3 py-2 text-right">Time deductions</th><th class="px-3 py-2 text-right">Contributions</th><th class="px-3 py-2 text-right">Net pay</th><th class="px-3 py-2">Review</th></tr></thead>
                <tbody class="divide-y divide-gray-800">
                  <tr v-for="line in currentLines" :key="line.employee_id ?? line.id">
                    <td class="px-3 py-3 font-medium text-gray-100">{{ displayName(line) }}<span v-if="activeRun.cutoff === 'second' && activeRun.include_contributions" class="mt-1 block text-[11px] font-normal" :class="line.details?.sssAssessment?.firstCutoffSource === 'assumed-half-basic' ? 'text-amber-300' : 'text-gray-500'">{{ line.details?.sssAssessment?.firstCutoffSource === 'hr-override' ? '15th pay: HR override' : line.details?.sssAssessment?.firstCutoffSource?.startsWith('saved-first-cutoff-') ? '15th pay: approved run' : '15th pay: unverified estimate' }}</span></td>
                    <td class="px-3 py-3 text-right">{{ money(line.gross_salary) }}</td>
                    <td class="px-3 py-3 text-right">{{ money(extraEarnings(line) + lineColaPay(line) + chargeEarnings(line)) }}</td>
                    <td class="px-3 py-3 text-right">{{ money(chargeDeductions(line)) }}</td>
                    <td class="px-3 py-3 text-right">{{ money(timeDeductions(line)) }}</td>
                    <td class="px-3 py-3 text-right">{{ money(statutoryDeductions(line)) }}</td>
                    <td class="px-3 py-3 text-right font-semibold text-emerald-300">{{ money(line.net_pay) }}</td>
                    <td class="px-3 py-3"><div class="flex flex-wrap gap-2"><AppButton size="sm" variant="secondary" @click="openPayslip(line)">Payslip</AppButton><AppButton v-if="activeRun.status === 'draft'" size="sm" variant="secondary" @click="beginEarningsEdit(line)">Earnings</AppButton><AppButton v-if="activeRun.status === 'draft'" size="sm" variant="secondary" @click="beginChargesEdit(line)">Charges</AppButton><AppButton v-if="activeRun.status === 'draft' && activeRun.cutoff === 'second' && activeRun.include_contributions" size="sm" variant="secondary" @click="beginFirstCutoffEdit(line)">15th pay</AppButton></div></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-xs text-gray-500">Open a payslip for the full absence, late, undertime, SSS, PhilHealth and Pag-IBIG breakdown.</p>
            <details v-if="activeRun.cutoff === 'second' && activeRun.include_contributions" class="mt-5 rounded-lg border border-gray-800 p-4">
              <summary class="cursor-pointer text-sm font-semibold text-gray-100">Remittance preview · employee and employer shares</summary>
              <p class="mt-2 text-xs text-gray-400">Calculated from this payroll run. This is a review report, not proof that contributions have been remitted. Automatic tax is not enabled. Enter verified withholding through HR-approved charges.</p>
              <div class="mt-3 overflow-x-auto"><table class="w-full min-w-[850px] text-right text-xs">
                <thead class="border-b border-gray-700 text-gray-400"><tr><th class="p-2 text-left">Employee</th><th class="p-2">SSS employee</th><th class="p-2">SSS employer</th><th class="p-2">EC employer</th><th class="p-2">PHIC employee</th><th class="p-2">PHIC employer</th><th class="p-2">Pag-IBIG employee</th><th class="p-2">Pag-IBIG employer</th></tr></thead>
                <tbody class="divide-y divide-gray-800"><tr v-for="line in currentLines" :key="`remit-${line.id}`"><th class="p-2 text-left font-medium text-gray-200">{{ displayName(line) }}</th><td class="p-2">{{ money(line.employee_sss) }}</td><td class="p-2">{{ money(line.employer_sss) }}</td><td class="p-2">{{ money(line.employer_ec) }}</td><td class="p-2">{{ money(line.employee_philhealth) }}</td><td class="p-2">{{ money(line.employer_philhealth) }}</td><td class="p-2">{{ money(line.employee_pagibig) }}</td><td class="p-2">{{ money(line.employer_pagibig) }}</td></tr></tbody>
                <tfoot class="border-t border-gray-600 font-semibold text-gray-100"><tr><th class="p-2 text-left">Total</th><td class="p-2">{{ money(remittanceTotals.employee_sss) }}</td><td class="p-2">{{ money(remittanceTotals.employer_sss) }}</td><td class="p-2">{{ money(remittanceTotals.employer_ec) }}</td><td class="p-2">{{ money(remittanceTotals.employee_philhealth) }}</td><td class="p-2">{{ money(remittanceTotals.employer_philhealth) }}</td><td class="p-2">{{ money(remittanceTotals.employee_pagibig) }}</td><td class="p-2">{{ money(remittanceTotals.employer_pagibig) }}</td></tr></tfoot>
              </table></div>
            </details>
          </section>
          <div><AppButton variant="secondary" @click="workflowStep = 6">View saved runs</AppButton></div>
        </template>
      <PayrollAttendanceAdjustmentModal :show="Boolean(editingAttendanceDay)" :day="editingAttendanceDay" :saving="Boolean(savingAttendanceDay)" @close="editingAttendanceDay = null" @save="saveAttendanceAdjustment" />
    </template>
    <div v-if="editingFirstCutoff" class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Confirm 15th payroll amount" @click.self="editingFirstCutoff = null">
      <div class="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
        <h2 class="font-semibold text-gray-100">Confirm 15th payroll · {{ displayName(editingFirstCutoff.line) }}</h2>
        <p class="mt-2 text-xs text-gray-400">The system uses an approved 15th run when available. Use this correction only when HR confirms a different amount or the earlier run is not saved. This affects the SSS bracket and net pay, not the current cutoff's basic salary.</p>
        <label class="mt-4 block text-xs text-gray-300">15th SSS-eligible pay (₱)<input v-model.number="editingFirstCutoff.firstCutoffPay" type="number" min="0" max="10000000" step="0.01" class="form-control mt-1"></label>
        <label class="mt-3 block text-xs text-gray-300">HR confirmation / reason<textarea v-model="editingFirstCutoff.reason" rows="3" maxlength="500" class="form-control mt-1" placeholder="State the source of the confirmed 15th amount"></textarea></label>
        <div class="mt-5 flex justify-end gap-2"><AppButton variant="secondary" @click="editingFirstCutoff = null">Cancel</AppButton><AppButton :loading="busy" @click="saveFirstCutoff">Save confirmed amount</AppButton></div>
      </div>
    </div>
    <div v-if="editingEarnings" class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Edit manual earnings" @click.self="editingEarnings = null">
      <div class="w-full max-w-2xl rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
        <div class="flex items-start justify-between gap-3"><div><h2 class="font-semibold text-gray-100">Approved extra earnings · {{ displayName(editingEarnings.line) }}</h2><p class="mt-1 text-xs text-gray-400">Use the signed HR form. Biometric time after 6 PM never creates overtime automatically.</p></div><button type="button" class="text-sm text-gray-400 hover:text-white" @click="editingEarnings = null">Close</button></div>
        <div class="mt-4 rounded-lg border border-primary-800/50 bg-primary-950/20 p-4"><h3 class="text-sm font-semibold text-gray-100">Worked special holiday</h3><p class="mt-1 text-xs text-gray-400">Enter HR-approved paid hours, excluding the 1–2 PM lunch. Seven hours becomes 0.875 day; basic salary already includes the regular day.</p><div class="mt-3 grid gap-3 sm:grid-cols-3"><label class="text-xs text-gray-400">Holiday date<input v-model="editingEarnings.holidayDate" type="date" :min="String(activeRun?.period_start || '').slice(0, 10)" :max="String(activeRun?.period_end || '').slice(0, 10)" class="form-control mt-1"></label><label class="text-xs text-gray-400">Approved paid hours<input v-model.number="editingEarnings.holidayApprovedHours" type="number" min="0.01" max="8" step="0.25" class="form-control mt-1"></label><label class="text-xs text-gray-400">Approved overtime hours<input v-model.number="editingEarnings.holidayOvertimeHours" type="number" min="0" max="24" step="0.25" class="form-control mt-1"></label></div><p class="mt-3 text-xs text-gray-300">{{ Number(editingEarnings.holidayApprovedHours || 0) / 8 }} day × 30% = {{ money(suggestedHolidayPremium) }} premium + {{ money(suggestedHolidayOvertime) }} overtime.</p><div class="mt-3"><AppButton size="sm" variant="secondary" :disabled="editingEarnings.earnings.length + (Number(editingEarnings.holidayOvertimeHours) > 0 ? 2 : 1) > 6" @click="addCalculatedHoliday">Add calculated earnings</AppButton></div></div>
        <p v-if="editingEarnings.earnings.some((entry) => entry.type === 'special_holiday_pay')" class="mt-4 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">This draft has an old full-holiday-pay line. Remove it before saving the corrected 30% premium. Do not add the premium on top of the old line.</p>
        <h3 class="mt-5 text-sm font-semibold text-gray-200">Earning lines in this draft</h3>
        <div v-for="(earning, index) in editingEarnings.earnings" :key="index" class="mt-3 grid gap-2 rounded-lg border border-gray-700 p-3 sm:grid-cols-[145px_120px_1fr_auto]">
          <label class="text-xs text-gray-400">Type<select v-model="earning.type" class="form-control mt-1" @change="onEarningTypeChange(earning)"><option value="overtime">Overtime</option><option value="night_differential">HR-approved night differential</option><option value="special_holiday_pay" disabled>Legacy full holiday pay - review</option><option value="holiday_premium">WSH/RD premium (30%)</option><option value="other">Other earning</option></select></label>
          <label class="text-xs text-gray-400">Amount (₱)<input v-model.number="earning.amount" type="number" min="0.01" step="0.01" class="form-control mt-1" :readonly="earning.type === 'holiday_premium' && earning.approvedHours != null"><span v-if="earning.approvedHours != null" class="mt-1 block text-[11px] text-gray-500">{{ earning.approvedHours }} approved hours; calculated again when saved.</span></label>
          <label class="text-xs text-gray-400">Reason / date<input v-model="earning.note" type="text" maxlength="200" class="form-control mt-1" placeholder="e.g. approved OT, Sep 22"></label>
          <button type="button" class="self-end rounded-md px-2 py-2 text-xs text-red-300 hover:bg-red-950/30" @click="editingEarnings.earnings.splice(index, 1)">Remove</button>
        </div>
        <div class="mt-4 flex flex-wrap gap-2"><AppButton size="sm" variant="secondary" :disabled="editingEarnings.earnings.length >= 6" @click="addEarning('overtime')">Add other approved overtime</AppButton><AppButton size="sm" variant="secondary" :disabled="editingEarnings.earnings.length >= 6" @click="addEarning('other')">Add other earning</AppButton></div>
        <div class="mt-6 flex justify-end gap-2"><AppButton variant="secondary" @click="editingEarnings = null">Cancel</AppButton><AppButton :loading="busy" :disabled="editingEarnings.earnings.some((entry) => entry.type === 'special_holiday_pay')" @click="saveEarnings">Save earnings</AppButton></div>
      </div>
    </div>
    <div v-if="editingCharges" class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Edit payroll charges" @click.self="editingCharges = null">
      <div class="w-full max-w-2xl rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
        <div class="flex items-start justify-between gap-3"><div><h2 class="font-semibold text-gray-100">CHARGES · {{ displayName(editingCharges.line) }}</h2><p class="mt-1 text-xs text-gray-400">Entries apply to this payroll cutoff only; they do not recur automatically. Monthly COLA is split equally across both paydays and remains non-taxable. Up to 20 entries per employee.</p></div><button type="button" class="text-sm text-gray-400 hover:text-white" @click="editingCharges = null">Close</button></div>
        <div v-for="(charge, index) in editingCharges.charges" :key="index" class="mt-3 grid gap-2 rounded-lg border border-gray-700 p-3 sm:grid-cols-[1.4fr_120px_1fr_auto]">
          <label class="text-xs text-gray-400">Type<select v-model="charge.type" class="form-control mt-1"><option v-for="type in chargeTypes" :key="type.value" :value="type.value">{{ type.label }}</option></select></label>
          <label class="text-xs text-gray-400">Amount<input v-model.number="charge.amount" type="number" :min="charge.type === 'basic_pay_adjustment' ? undefined : '0.01'" step="0.01" class="form-control mt-1"></label>
          <label class="text-xs text-gray-400">Reference / note<input v-model="charge.note" type="text" maxlength="200" class="form-control mt-1" placeholder="e.g. loan installment"></label>
          <button type="button" class="self-end rounded-md px-2 py-2 text-xs text-red-300 hover:bg-red-950/30" @click="editingCharges.charges.splice(index, 1)">Remove</button>
          <p class="sm:col-span-4 text-[11px] text-gray-500">{{ chargeTypes.find((type) => type.value === charge.type)?.kind === 'earning' ? 'Non-taxable earning' : charge.type === 'basic_pay_adjustment' ? 'Positive adds to pay; negative deducts from pay.' : 'Deduction from net pay.' }}</p>
        </div>
        <div class="mt-4 flex flex-wrap gap-2"><AppButton size="sm" variant="secondary" :disabled="editingCharges.charges.length >= 20" @click="addCharge('cash_advance')">Add deduction</AppButton><AppButton size="sm" variant="secondary" :disabled="editingCharges.charges.length >= 20" @click="addCharge('other_non_taxable_earning')">Add non-taxable earning</AppButton><AppButton size="sm" variant="secondary" :disabled="editingCharges.charges.length >= 20" @click="addCharge('basic_pay_adjustment')">Add basic adjustment</AppButton></div>
        <div class="mt-6 flex justify-end gap-2"><AppButton variant="secondary" @click="editingCharges = null">Cancel</AppButton><AppButton :loading="busy" @click="saveCharges">Save charges</AppButton></div>
      </div>
    </div>
    <AppModal :show="Boolean(payBasisForm)" title="Verify cutoff pay basis" @close="payBasisForm=null">
      <div v-if="payBasisForm" class="space-y-4"><p>{{displayName(payBasisForm.line)}} · Basic {{money(payBasisForm.line.gross_salary)}} · COLA {{money(payBasisForm.line.cola_pay)}}</p><p class="text-sm text-gray-400">Confirm the company's treatment for this hire, departure, or mid-cutoff salary change. Save any required adjustments under Charges first.</p><label class="block text-sm">Policy / calculation reference<textarea v-model="payBasisForm.reason" maxlength="500" rows="3" class="form-control mt-1" /></label></div>
      <template #footer><AppButton variant="secondary" @click="payBasisForm=null">Cancel</AppButton><AppButton :loading="busy" :disabled="payBasisForm?.reason.trim().length<3" @click="savePayBasis">Verify cutoff pay</AppButton></template>
    </AppModal>
    <AppModal :show="Boolean(paymentForm)" title="Record actual payroll payment" @close="paymentForm = null">
      <div v-if="paymentForm" class="space-y-4">
        <p class="text-sm text-gray-400">Record payment only after the company has actually paid employees. This records evidence; it does not transfer money. Approved net total: {{ money(totalNet) }}.</p>
        <label class="block text-sm">Bank / payment reference<input v-model="paymentForm.reference" class="form-control mt-1" minlength="3" maxlength="200"></label>
        <label class="block text-sm">Actual payment date<input v-model="paymentForm.paidOn" type="date" class="form-control mt-1"></label>
      </div>
      <template #footer><AppButton variant="secondary" @click="paymentForm = null">Cancel</AppButton><AppButton :loading="busy" :disabled="!paymentForm?.paidOn || paymentForm?.reference.trim().length < 3" @click="savePayment">Confirm actual payment</AppButton></template>
    </AppModal>
    <PayrollPayslipPreview v-if="selectedPayslip" :line="selectedPayslip.line" :run="selectedPayslip.run" :busy="busy" :can-edit="canManage && Boolean(selectedPayslip.line.id) && selectedPayslip.run.status === 'draft'" :can-email="canManage && payrollFinalizationEnabled && selectedPayslip.run.status === 'locked' && Boolean(selectedPayslip.run.payment)" @close="selectedPayslip = null" @print="payslipPdf(false)" @download="payslipPdf(true)" @send="emailPayslip()" @edit="beginEarningsEdit(selectedPayslip.line)" @edit-charges="beginChargesEdit(selectedPayslip.line)" />
  </div>
</template>
