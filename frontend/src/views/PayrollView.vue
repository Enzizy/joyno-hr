<script setup>
import PayrollShiftTabs from '@/components/payroll/PayrollShiftTabs.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import {payrollShift,reviewScope,runScope,shiftLabel} from '@/utils/payrollScope'
import { effectiveEarnings, needsNightReview } from '@/utils/payrollEarnings'
import { clockTime } from '@/utils/clockTime'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { standardPeriod, formatWorkDate, formatWorkRange, coversWorkDates, matchingAttendanceReviews } from '@/utils/payrollPeriods'
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
import PayRunNextStep from '@/components/payroll/PayRunNextStep.vue'
import PayrollAdjustPanel from '@/components/payroll/PayrollAdjustPanel.vue'
import PayrollPayslipsDesk from '@/components/payroll/PayrollPayslipsDesk.vue'
import EmployeePayslips from '@/components/payroll/EmployeePayslips.vue'
import { AGENCY_FOR_DEDUCTION, lineAdjustments } from '@/utils/payrollAdjustments'
import MoreMenu from '@/components/ui/MoreMenu.vue'
import { isManagementRole } from '@/utils/roles'
import { payrollFinalizationEnabled } from '@/config/features'

// Embedded inside a pay run, `stage` picks which part of the register workflow is shown:
// review (draft register), approve (approve, payment, close), payslips, or test (no-save calculator).
const props = defineProps({ embedded: Boolean, stage: { type: String, default: '' } })
const emit = defineEmits(['changed', 'navigate'])
const auth = useAuthStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()
const shift = ref(payrollShift(route.query.shift))
const practiceMode=ref(route.query.practice==='true')
const isPracticeRun=computed(()=>activeRun.value?.rule_snapshot?.isTest===true)
const canFinalizeRun=computed(()=>isPracticeRun.value || payrollFinalizationEnabled)
watch(practiceMode,()=>{router.replace({query:{...route.query,practice:String(practiceMode.value),attendanceBatch:undefined}})})
watch(()=>route.query.shift,value=>{if(value!==undefined)shift.value=payrollShift(value)})
const shiftName = computed(()=>shiftLabel(shift.value))
const attendanceReviews = ref([])
const shiftReviews = computed(()=>attendanceReviews.value.filter(b=>reviewScope(b)===shift.value && Boolean(b.is_test)===practiceMode.value))
const shiftRuns = computed(()=>runs.value.filter(run=>runScope(run)===shift.value && Boolean(run.rule_snapshot?.isTest)===practiceMode.value))
const legacyRuns = computed(()=>runs.value.filter(run=>runScope(run)==='all'))
let workspaceRequest = 0
watch(shift, async value=>{
  attendanceRequest++
  attendanceLoading.value=false
  workspaceInitialized.value=false
  attendanceReviews.value=[];profiles.value=[];runAttendanceBatch.value='';attendanceResult.value=null
  activeRun.value=null;preview.value=null;testResult.value=null;testEmployeeId.value='';testPersonId.value=''
  selectedPayslip.value=null;adjusting.value=null;editingFirstCutoff.value=null
  workflowStep.value=1
  const query={...route.query,shift:value};delete query.attendanceBatch
  await router.replace({query});await loadWorkspace();workspaceInitialized.value=true
})
const eligibleReviews = computed(() => matchingAttendanceReviews(shiftReviews.value, cutoffStart.value, cutoffEnd.value))
const unfinishedReview = computed(() => matchingAttendanceReviews(shiftReviews.value, cutoffStart.value, cutoffEnd.value, false)[0])
const attendanceTarget = computed(() => ({path:'/attendance',query:{shift:shift.value,practice:String(practiceMode.value),payrollMonth:payrollMonth.value,cutoff:cutoffType.value,...(unfinishedReview.value && !runAttendanceBatch.value ? {batch:unfinishedReview.value.id} : runAttendanceBatch.value ? {batch:runAttendanceBatch.value} : {})}}))
const attendanceLoading = ref(false)
const workspaceInitialized = ref(false)
// Set when HR pressed "Calculate pay" on confirmed attendance; cleared from the URL so a reload does not recalculate.
const calculateRequested = ref(props.embedded && route.query.calculate === '1')
if (route.query.calculate) router.replace({ query: { ...route.query, calculate: undefined } })
let attendanceRequest = 0
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
const adjusting = ref(null)
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

watch([payrollMonth, cutoffType], () => {
  applyStandardPeriod()
  if (workspaceInitialized.value) {
    const query = {...route.query, payrollMonth:payrollMonth.value, cutoff:cutoffType.value}
    delete query.attendanceBatch
    router.replace({query})
  }
}, { immediate: true })
watch([testPayrollMonth, testCutoffType], applyTestPeriod, { immediate: true })
watch([cutoffStart, cutoffEnd], () => {
  attendanceRequest += 1
  attendanceLoading.value = false
  attendanceResult.value = null
  runAttendanceBatch.value = ''
  expandedEmployeeId.value = null
})
watch(eligibleReviews, reviews => {
  if (!reviews.some(b => String(b.id) === String(runAttendanceBatch.value))) chooseAttendance(reviews[0]?.id)
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
  if (standardPeriod(String(route.query.payrollMonth || ''), String(route.query.cutoff || ''))) {
    payrollMonth.value = String(route.query.payrollMonth)
    cutoffType.value = String(route.query.cutoff)
    await nextTick()
  }
  await loadWorkspace()
  if (canManage.value && route.query.attendanceBatch) {
    try {
      const b = await getAttendanceReview(route.query.attendanceBatch)
      if (!route.query.payrollMonth) {
        payrollMonth.value = b.period_end.slice(0, 7)
        cutoffType.value = b.period_end.endsWith('-10') ? 'first' : 'second'
      }
      await nextTick()
      await chooseAttendance(b.id)
      workflowStep.value = 1
    } catch (error) { toast.error(error.message) }
  }
  if (props.embedded && props.stage !== 'test' && canManage.value) await openPeriodRun()
  workspaceInitialized.value = true
})

// Calculate once this pay run's confirmed attendance is loaded, unless a draft already exists.
watch(() => [workspaceInitialized.value, attendanceLoading.value, runAttendanceBatch.value, attendanceResult.value?.review_state], () => {
  if (!calculateRequested.value || !workspaceInitialized.value || attendanceLoading.value) return
  calculateRequested.value = false
  if (activeRun.value || !runAttendanceBatch.value || attendanceResult.value?.review_state !== 'confirmed') return
  createPreview()
})

// A pay run shows its own saved draft: the newest run for these work dates, shift and practice setting.
async function openPeriodRun() {
  const periodRuns = shiftRuns.value
    .filter(run => String(run.period_start).slice(0, 10) === cutoffStart.value && String(run.period_end).slice(0, 10) === cutoffEnd.value)
    .sort((a, b) => Number(b.id) - Number(a.id))
  // A practice run belongs to the attendance it was calculated from; a newer practice upload gets its own run.
  const latestConfirmed = eligibleReviews.value[0]
  const match = route.query.run ? { id: route.query.run } : practiceMode.value
    ? periodRuns.find(run => !run.attendance_batch_id || !latestConfirmed || String(run.attendance_batch_id) === String(latestConfirmed.id))
    : periodRuns[0]
  if (match) await selectRun(match)
  workflowStep.value = 4
}

async function chooseAttendance(id) {
  const request = ++attendanceRequest
  runAttendanceBatch.value = ''
  attendanceResult.value = null
  if (!id) { attendanceLoading.value = false; return }
  attendanceLoading.value = true
  try {
    const result = await getAttendanceReview(id)
    if (request !== attendanceRequest) return
    if(Boolean(result?.isTest)!==practiceMode.value)throw Error('Select attendance for the current Practice payroll setting.')
    if (reviewScope(result)!==shift.value || result?.review_state !== 'confirmed' || !coversWorkDates(result, cutoffStart.value, cutoffEnd.value)) throw Error('This attendance review does not cover the selected work dates. Choose the matching payroll cutoff.')
    if(result.scopeNeedsRefresh){
      attendanceReviews.value=attendanceReviews.value.map(b=>String(b.id)===String(id)?{...b,scope_needs_refresh:true}:b)
      throw Error('Employee setup or leave changed since attendance was confirmed. Upload and confirm a replacement review.')
    }
    attendanceResult.value = result
    runAttendanceBatch.value = id
  } catch (error) { if (request === attendanceRequest) toast.error(error.message) }
  finally { if (request === attendanceRequest) attendanceLoading.value = false }
}

function beginPayment() {
  // The money usually goes out on the payday; if that is still ahead, today. Practice references are labelled by the server.
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const payday = String(activeRun.value?.payday || activeRun.value?.pay_date || '').slice(0, 10)
  paymentForm.value = { reference: '', paidOn: payday && payday < today ? payday : today }
}
async function savePayment() {
  busy.value = true
  try {
    const updated = await recordPayrollPayment(activeRun.value.id, { ...paymentForm.value, expectedTotal: totalNet.value })
    activeRun.value = updated; preview.value = updated; paymentForm.value = null
    toast.success(isPracticeRun.value?'Marked as paid. Finish the practice run next.':'Marked as paid. Close payroll next to release the payslips.')
    await refreshRuns()
    emit('changed')
  } catch (error) { toast.error(error.message) } finally { busy.value = false }
}
async function exportPayment(type='payment') {
  busy.value = true
  try {
    const url = URL.createObjectURL(type==='payment'?await getPayrollPaymentExport(activeRun.value.id):await getPayrollRegisterExport(activeRun.value.id,type))
    const link = document.createElement('a'); link.href = url; link.download = `${isPracticeRun.value?'TEST-ONLY-':''}payroll-${runScope(activeRun.value)}-${type}-${activeRun.value.id}-${activeRun.value.status}.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) { toast.error(error.message) } finally { busy.value = false }
}

async function loadWorkspace() {
  const request=++workspaceRequest
  const selectedShift=shift.value
  loading.value = true
  const tasks = []
  if (canManage.value) {
    tasks.push(listAttendanceReviews(selectedShift).then(data => { if(request===workspaceRequest)attendanceReviews.value = data }))
    tasks.push(getPayrollProfiles(selectedShift).then((data) => { if(request===workspaceRequest)profiles.value = listFrom(data, 'items') }))
    tasks.push(getPayrollRuns().then((data) => { if(request===workspaceRequest)runs.value = listFrom(data, 'items') }))
  }
  if (isEmployee.value) tasks.push(getMyPayrollLines().then((data) => { myLines.value = listFrom(data, 'items') }))
  const results = await Promise.allSettled(tasks)
  if(request!==workspaceRequest)return
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
      shift: shift.value,
    })
    preview.value = result.run || result
    activeRun.value = preview.value
    workflowStep.value = 4
    toast.success(isPracticeRun.value?'Practice payroll saved. Review the test amounts before simulated approval.':'Draft payroll saved. Review every employee and amount before any release.')
    await refreshRuns()
    emit('changed')
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
    toast.success(isPracticeRun.value ? (action==='approve'?'Practice payroll approved.':'Practice complete. No employee payslips released.') : action === 'approve' ? 'Payroll approved.' : 'Payroll locked.')
    await refreshRuns()
    emit('changed')
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
  return effectiveEarnings(line.details).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
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
const payDateForm = ref(null)
const payDateFormError = computed(() => !payDateForm.value || payDateForm.value <= cutoffEnd.value)
async function savePayDate() {
  payDate.value = payDateForm.value
  payDateForm.value = null
  await createPreview()
}
const downloadItems = computed(() => [
  { label: 'Payroll register (CSV)', onSelect: () => exportPayment('register') },
  { label: 'Contribution report (CSV)', onSelect: () => exportPayment('remittance') },
  ...(['approved', 'locked'].includes(activeRun.value?.status) ? [{ label: 'Payment register (CSV)', onSelect: () => exportPayment('payment') }] : []),
])
const unverifiedFirstCutoffCount = computed(() => activeRun.value?.cutoff === 'second' && activeRun.value?.include_contributions
  ? currentLines.value.filter((line) => !['saved-first-cutoff-approved', 'saved-first-cutoff-locked', 'hr-override']
    .includes(line.details?.sssAssessment?.firstCutoffSource)).length : 0)
const reviewExceptionCount = computed(() => currentLines.value.reduce((count, line) => count +
  (line.details?.attendance || []).filter((day) => day.status === 'exception').length, 0))
const reviewImportErrorCount = computed(() => Number(currentLines.value[0]?.details?.attendanceImportErrors || 0))
const legacyHolidayLineCount = computed(() => currentLines.value.reduce((count, line) => count +
  (line.details?.manualEarnings || []).filter((entry) => entry.type === 'special_holiday_pay').length, 0))
const unverifiedPayBasisCount = computed(() => currentLines.value.filter(l => l.details?.payBasisReview?.required && !l.details?.payBasisReview?.verifiedReason).length)
const approvalBlockers = computed(() => [
  currentLines.value.some(needsNightReview) && 'Night differential needs HR verification for holiday work or work without punches',
  reviewExceptionCount.value && `${reviewExceptionCount.value} unresolved scan day(s) in the attendance used by this draft`,
  reviewImportErrorCount.value && `${reviewImportErrorCount.value} attendance import error(s)`,
  legacyHolidayLineCount.value && `${legacyHolidayLineCount.value} old full-holiday-pay line(s) to replace with the 30% premium`,
  unverifiedPayBasisCount.value && `${unverifiedPayBasisCount.value} employee(s) with mid-cutoff changes need pay verification`,
].filter(Boolean))
// Approve & pay: what leaves the company, what to check first, and who gets what.
const paySummary = computed(() => {
  const totals = remittanceTotals.value
  const agencyLoans = { sss: 0, pagibig: 0, bir: 0 }
  for (const line of currentLines.value) {
    for (const entry of lineAdjustments(line)) if (AGENCY_FOR_DEDUCTION[entry.type]) agencyLoans[AGENCY_FOR_DEDUCTION[entry.type]] += Math.abs(entry.amount)
  }
  const agencies = [
    { name: 'SSS', amount: totals.employee_sss + totals.employer_sss + totals.employer_ec + agencyLoans.sss, loans: agencyLoans.sss },
    { name: 'PhilHealth', amount: totals.employee_philhealth + totals.employer_philhealth, loans: 0 },
    { name: 'Pag-IBIG', amount: totals.employee_pagibig + totals.employer_pagibig + agencyLoans.pagibig, loans: agencyLoans.pagibig },
    { name: 'BIR (tax)', amount: agencyLoans.bir, loans: 0 },
  ].filter(agency => agency.amount > 0)
  return { agencies, remit: agencies.reduce((sum, agency) => sum + agency.amount, 0) }
})
const previousPayRun = computed(() => {
  const run = activeRun.value
  if (!run) return null
  return runs.value.filter(other => String(other.id) !== String(run.id) && runScope(other) === runScope(run) &&
      Boolean(other.rule_snapshot?.isTest) === isPracticeRun.value && ['approved', 'locked'].includes(other.status) &&
      String(other.period_end).slice(0, 10) < String(run.period_start).slice(0, 10))
    .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)) || Number(b.id) - Number(a.id))[0] || null
})
// ok: fine · warn: worth a look, approval still allowed · block: must be fixed first.
const approvalChecks = computed(() => {
  const lines = currentLines.value
  const nameList = list => list.map(displayName).slice(0, 3).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '')
  const checks = [{ state: 'ok', text: `Attendance confirmed for ${lines.length} ${lines.length === 1 ? 'employee' : 'employees'}` }]
  const unpaid = lines.filter(line => Number(line.net_pay) <= 0)
  checks.push(unpaid.length
    ? { state: 'warn', text: `${nameList(unpaid)} ${unpaid.length === 1 ? 'has' : 'have'} zero or negative net pay`, detail: 'Check their deductions in Review pay before approving.' }
    : { state: 'ok', text: 'Everyone has a positive net pay' })
  const assumed = lines.filter(line => line.details?.sssAssessment?.firstCutoffSource === 'assumed-half-basic')
  if (assumed.length) checks.push({ state: 'warn', text: `SSS assumes half the salary as the 15th pay for ${assumed.length} ${assumed.length === 1 ? 'employee' : 'employees'}`, detail: 'The 15th payroll is not in the system. If anyone was absent or had overtime before the 15th, change their 15th pay in Review pay.' })
  const adjusted = lines.map(line => ({ line, items: lineAdjustments(line) })).filter(entry => entry.items.length)
  checks.push(adjusted.length
    ? { state: 'ok', text: `${adjusted.length} ${adjusted.length === 1 ? 'employee has' : 'employees have'} pay adjustments`, adjustments: adjusted }
    : { state: 'ok', text: 'No manual pay adjustments' })
  for (const blocker of approvalBlockers.value) checks.push({ state: 'block', text: blocker })
  return checks
})
const paidLines = computed(() => [...currentLines.value].sort((a, b) => displayName(a).localeCompare(displayName(b))))
const formatStamp = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : ''

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

function beginAdjust(line) {
  adjusting.value = line
  selectedPayslip.value = null
}

// The panel's adjustments are stored as the draft's manual earnings and charges.
async function saveAdjustments({ earnings, charges, earningsChanged, chargesChanged }) {
  if (!adjusting.value || !activeRun.value) return
  const runId = activeRun.value.id, lineId = adjusting.value.id
  const apply = (line) => { activeRun.value = { ...activeRun.value, lines: currentLines.value.map((item) => String(item.id) === String(line.id) ? line : item) } }
  busy.value = true
  try {
    if (earningsChanged) apply(await updatePayrollManualEarnings(runId, lineId, earnings))
    if (chargesChanged) { const result = await updatePayrollCharges(runId, lineId, charges); apply(result.line || result) }
    adjusting.value = null
    toast.success('Pay adjustments saved to this draft.')
  } catch (error) {
    toast.error(error.message || 'Unable to save pay adjustments.')
  } finally {
    busy.value = false
  }
}

// Month-end SSS uses the whole month's pay: the approved 15th payroll when one exists,
// otherwise half the monthly salary. HR can change it when the 15th had absences or overtime.
function firstCutoffAmount(line) {
  return Math.round(Number(line.details?.sssAssessment?.firstCutoffPay ?? Number(line.monthly_basic_salary || 0) / 2) * 100) / 100
}
function firstCutoffLabel(line) {
  const source = line.details?.sssAssessment?.firstCutoffSource
  return source === 'hr-override' ? 'set by HR' : source?.startsWith('saved-first-cutoff-') ? 'from the 15th payroll' : 'half of monthly salary'
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
      Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    toast.error('Enter a valid 15th payroll amount in pesos and centavos.')
    return
  }
  busy.value = true
  try {
    const result = await updatePayrollFirstCutoffPay(activeRun.value.id, editor.line.id, value, String(editor.reason || '').trim())
    const line = result.line || result
    activeRun.value = { ...activeRun.value, lines: currentLines.value.map((item) => String(item.id) === String(line.id) ? line : item) }
    editingFirstCutoff.value = null
    toast.success('15th pay amount saved; SSS and net pay were recalculated.')
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
      : await getPayrollPayslipPdf(canManage.value ? selected.run.id : null, selected.line.id, { copies: canManage.value ? 2 : 1 })
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
      employeeId: testEmployeeId.value,
      shift:shift.value, biometricPersonId: testPersonId.value,
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

async function emailAllPayslips() {
  if (!activeRun.value || !['approved', 'locked'].includes(activeRun.value.status) || !payrollFinalizationEnabled || isPracticeRun.value) return
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
    <PageHeader v-if="embedded && stage === 'test'" title="Test a calculation" description="Calculate one employee's payslip from a biometric CSV. Nothing is saved."><template #actions><RouterLink to="/payroll" class="text-sm font-semibold text-primary-300 hover:underline">Back to Payroll</RouterLink></template></PageHeader>
    <PageHeader v-if="!embedded" :title="isEmployee ? 'My payslips' : 'Payroll'" :description="isEmployee ? 'What you earned and what was deducted, for every payday.' : ''">
      
    </PageHeader>
    <div v-if="canManage && (!embedded || stage === 'test')" class="flex flex-wrap items-center justify-between gap-3"><PayrollShiftTabs v-model="shift" :disabled="busy||loadingRun" /><span class="text-sm text-gray-400">{{profiles.length}} {{shiftName.toLowerCase()}} {{profiles.length===1?'employee':'employees'}}</span></div>
    <label v-if="canManage && !embedded" class="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-800 px-5 py-4 text-sm font-semibold"><input v-model="practiceMode" type="checkbox" class="h-4 w-4" :disabled="busy||loadingRun">Practice payroll with selected employees</label>
    <p v-if="canManage && practiceMode && !embedded" class="rounded-xl border border-sky-700/40 bg-sky-950/20 p-4 text-sm leading-6 text-sky-200"><strong>TEST ONLY</strong> · Select configured employees when importing attendance. Current salaries are used as test values. You can approve, record simulated payment, and finish a practice run. Employee payslips and emails stay off.</p>

    <div v-if="loading" class="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400" role="status">Loading payroll workspace…</div>

    <template v-else-if="isEmployee">
      <EmployeePayslips :lines="myLines" @view="(line) => openPayslip(line, line)" />
    </template>

    <template v-else-if="canManage">
        <nav v-if="!embedded" class="flex flex-wrap items-center gap-1 border-b border-gray-800" aria-label="Payroll workspace">
          <button class="border-b-2 px-4 py-3 text-sm font-semibold" :class="[1,2,3].includes(workflowStep)?'border-primary-500 text-primary-300':'border-transparent text-gray-400 hover:text-gray-100'" :aria-current="[1,2,3].includes(workflowStep)?'page':undefined" @click="workflowStep=1">Prepare payroll</button>
          <button class="border-b-2 px-4 py-3 text-sm font-semibold" :class="workflowStep===6?'border-primary-500 text-primary-300':'border-transparent text-gray-400 hover:text-gray-100'" :aria-current="workflowStep===6?'page':undefined" @click="workflowStep=6">Saved runs <span v-if="shiftRuns.length" class="ml-1 text-xs text-gray-500">{{shiftRuns.length}}</span></button>
          <button v-if="activeRun" class="border-b-2 px-4 py-3 text-sm font-semibold" :class="workflowStep===4?'border-primary-500 text-primary-300':'border-transparent text-gray-400 hover:text-gray-100'" @click="workflowStep=4">Open {{activeRun.status||'draft'}}</button>
        </nav>
        <p v-if="!embedded && !payrollFinalizationEnabled && !practiceMode" class="text-xs text-gray-500">Real payroll stays in draft mode. Enable Practice payroll above to test the complete flow.</p>

        <section v-if="embedded ? stage === 'test' : workflowStep === 5" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
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
            <p v-if="testResult.line.details?.nightDifferential?.reviewRequired" class="mt-3 rounded-md border border-amber-800/40 p-3 text-xs text-amber-200">Night differential is provisional. {{testResult.line.details.nightDifferential.review.map(item=>`${item.date}: ${item.reason}`).join('; ')}}</p>
            <p v-if="testResult.warnings.length" class="mt-3 rounded-md border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">{{ testResult.warnings.length }} workday(s) have missing or incomplete scans. This net pay is provisional: those days are not deducted until HR confirms absence, leave, or offsite work.</p>
            <p v-else class="mt-3 text-xs text-emerald-300">All scheduled workdays have a time-in and time-out scan.</p>
            <div class="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3"><span>Basic {{ money(testResult.line.gross_salary) }}</span><span>COLA (non-taxable) {{ money(testResult.line.cola_pay ?? testResult.line.colaPay ?? 0) }}</span><span>Night differential {{money(testResult.line.details?.nightDifferential?.amount || 0)}}</span><span>WSH/RD premium {{ money(testResult.specialHoliday.holidayPremium) }}</span><span>Special-holiday OT {{ money(testResult.specialHoliday.overtimePay) }}</span><span>Late {{ money(testResult.line.late_deduction) }}</span><span>Undertime {{ money(testResult.line.undertime_deduction) }}</span><span>Contributions {{ money(Number(testResult.line.employee_sss) + Number(testResult.line.employee_philhealth) + Number(testResult.line.employee_pagibig)) }}</span></div>
            <p v-if="testResult.sssAssessment" class="mt-3 text-xs text-gray-400">SSS basis: {{ money(testResult.sssAssessment.firstCutoffPay) }} first cutoff + {{ money(testResult.sssAssessment.secondCutoffNetBasic) }} second cutoff net basic + {{ money(testResult.sssAssessment.overtimePay) }} overtime + {{money(testResult.sssAssessment.nightDifferentialPay || 0)}} night differential = {{ money(testResult.sssAssessment.monthlyCompensation) }}. WSH/RD premium is excluded, matching the workbook’s Remittance lookup.<span v-if="testResult.sssAssessment.firstCutoffSource === 'assumed-half-basic'" class="text-amber-300"> First cutoff is assumed; enter its actual eligible pay above if different.</span></p>
            <div class="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-800 pt-4"><label class="text-xs text-gray-400">Actual net received (optional)<input v-model.number="actualNetReceived" type="number" min="0" step="0.01" class="form-control mt-1 max-w-48" placeholder="Enter bank amount"></label><p v-if="actualNetReceived !== '' && Number.isFinite(Number(actualNetReceived))" class="pb-2 text-sm" :class="Math.abs(Number(testResult.line.net_pay) - Number(actualNetReceived)) < 0.01 ? 'text-emerald-300' : 'text-amber-300'">{{ Math.abs(Number(testResult.line.net_pay) - Number(actualNetReceived)) < 0.01 ? 'Matches your received amount' : `Difference: ${money(Number(testResult.line.net_pay) - Number(actualNetReceived))} (calculated minus received)` }}</p></div>
            <div class="mt-4 flex flex-wrap gap-2"><AppButton size="sm" variant="secondary" @click="openPayslip(testResult.line, testResult.run, testResult.pdfBase64)">View / print test payslip</AppButton></div>
            <details class="mt-4"><summary class="cursor-pointer text-xs text-gray-400">Review attendance records</summary><div class="mt-2 max-h-72 overflow-auto rounded-md border border-gray-800"><table class="w-full min-w-[550px] text-left text-xs"><thead><tr class="border-b border-gray-800 text-gray-500"><th class="p-2">Date</th><th class="p-2">Status</th><th class="p-2">Time in</th><th class="p-2">Time out</th><th class="p-2">Late</th><th class="p-2">Undertime</th></tr></thead><tbody><tr v-for="day in testResult.days" :key="day.date" class="border-b border-gray-800/70"><td class="p-2">{{ day.date }}</td><td class="p-2">{{ day.status }}</td><td class="p-2">{{ clockTime(day.firstScanAt) || '—' }}</td><td class="p-2">{{ clockTime(day.lastScanAt) || '—' }}</td><td class="p-2">{{ day.lateMinutes }}</td><td class="p-2">{{ day.undertimeMinutes }}</td></tr></tbody></table></div></details>
          </div>
        </section>

        <section v-if="!embedded && [1,2,3].includes(workflowStep)" class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          <div class="border-b border-gray-800 px-5 py-4"><h2 class="font-semibold text-gray-100">Prepare {{shiftName.toLowerCase()}} payroll</h2></div>
          <div class="grid lg:grid-cols-2">
            <div class="space-y-5 p-5 lg:border-r lg:border-gray-800">
              <h3 class="text-sm font-semibold text-gray-100">1. Choose the payday</h3>
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="text-sm text-gray-300">Payroll month<input v-model="payrollMonth" type="month" class="form-control mt-2"></label>
                <label class="text-sm text-gray-300">Payday<select v-model="cutoffType" class="form-control mt-2"><option value="first">15th payday</option><option value="second">Month-end payday</option></select></label>
              </div>
              <div class="rounded-lg border border-primary-800/40 bg-primary-950/20 p-4"><p class="text-xs font-semibold uppercase tracking-wide text-primary-300">Work dates included</p><p class="mt-2 font-semibold text-gray-100">{{formatWorkRange(cutoffStart,cutoffEnd)}}</p><p class="mt-2 text-xs leading-5 text-gray-400">Attendance, leave and deductions are checked for these work dates.</p></div>
              <label class="block text-sm text-gray-300">Payment date<input v-model="payDate" type="date" class="form-control mt-2"><span class="mt-2 block text-xs" :class="payDateError?'text-amber-300':'text-gray-500'">{{payDateError?'Choose a payment date after the work dates above.':'When employees are scheduled to receive this payroll.'}}</span></label>
              <p class="text-xs text-gray-500">{{cutoffType==='second'?'Month-end payroll includes SSS, PhilHealth and Pag-IBIG.':'Government contributions are included in the month-end payroll.'}}</p>
            </div>
            <div class="space-y-5 border-t border-gray-800 p-5 lg:border-t-0">
              <div class="flex items-start justify-between gap-4"><div><h3 class="text-sm font-semibold text-gray-100">Employee salaries &amp; IDs</h3><p class="mt-1 text-sm text-gray-400">{{practiceMode?`${profiles.length-profileIssueCount} configured employees available for testing`:`${profiles.length-profileIssueCount} of ${profiles.length} ready`}}<span v-if="profileIssueCount && !practiceMode" class="ml-2 text-amber-300"> · {{profileIssueCount}} need setup</span></p><p v-if="practiceMode" class="mt-1 text-xs text-gray-500">Choose who to include when importing attendance. Others can be set up later.</p></div><RouterLink :to="{path:'/compensation',query:{shift}}" class="shrink-0 text-sm font-semibold text-primary-300 hover:underline">{{practiceMode?'Pay & schedules':profileIssueCount?'Complete setup':'View profiles'}} →</RouterLink></div>
              <div class="border-t border-gray-800 pt-5">
                <div class="flex items-center justify-between gap-3"><h3 class="text-sm font-semibold text-gray-100">2. Check attendance</h3><StatusBadge :status="attendanceLoading?'Loading':runAttendanceBatch?'Confirmed':unfinishedReview?'Needs review':'Not uploaded'" :variant="runAttendanceBatch?'success':unfinishedReview?'warning':'neutral'" /></div>
                <div v-if="attendanceLoading" class="mt-3 text-sm text-gray-400" role="status">Finding attendance for these work dates…</div>
                <template v-else-if="runAttendanceBatch && attendanceResult">
                  <p class="mt-3 text-sm text-gray-300">{{attendanceResult.file_name}}</p><p class="mt-1 text-xs text-gray-500">{{attendanceResult.daily?.length||0}} reviewed employee-days · {{shiftName}} file selected.</p>
                  <RouterLink :to="attendanceTarget" class="mt-3 inline-block text-sm font-semibold text-primary-300 hover:underline">View verified attendance →</RouterLink>
                  <details v-if="eligibleReviews.length>1" class="mt-3 text-xs text-gray-400"><summary class="cursor-pointer">Use a different confirmed file</summary><label class="mt-2 block">Confirmed attendance file<select :value="runAttendanceBatch" class="form-control mt-2" @change="chooseAttendance($event.target.value)"><option v-for="b in eligibleReviews" :key="b.id" :value="b.id">{{b.file_name}} · Review {{b.id}}</option></select></label></details>
                </template>
                <template v-else>
                  <p class="mt-3 text-sm leading-6 text-gray-400">{{unfinishedReview?.needs_reimport?'An older import covers these dates. Upload its original CSV once to review it.':unfinishedReview?`${unfinishedReview.pending_days} employee-days still need HR verification. Continue where you left off.`:'Upload the biometric export for the work dates shown. HR checks missing scans, undertime and leave before calculating pay.'}}</p>
                  <AppButton class="mt-4" :disabled="!cutoffStart||!cutoffEnd" @click="router.push(attendanceTarget)">{{unfinishedReview?.needs_reimport?'Re-upload attendance CSV':unfinishedReview?'Continue attendance review':'Upload attendance CSV'}} →</AppButton>
                  <p class="mt-2 text-xs text-gray-500">Your shift and work dates carry over to Attendance.</p>
                </template>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-4 border-t border-gray-800 bg-gray-950/30 px-5 py-4"><p class="max-w-md text-xs leading-5 text-gray-400">{{runAttendanceBatch?'Creates a saved draft for HR to review. Employees are not paid or notified.':'Confirm attendance for these work dates to unlock payroll calculation.'}}</p><AppButton :loading="busy||attendanceLoading" :disabled="!runAttendanceBatch||attendanceResult?.review_state!=='confirmed'||payDateError" @click="createPreview">{{practiceMode?'3. Calculate practice payroll →':'3. Calculate draft →'}}</AppButton></div>
        </section>

        <section v-if="!embedded && workflowStep === 6" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 class="font-semibold text-gray-100">Saved payroll runs</h2><p class="mt-1 text-sm text-gray-400">Open a run to inspect its employee register and payslips.</p></div><AppButton size="sm" @click="workflowStep = 1">Prepare payroll</AppButton></div>
            <EmptyState v-if="!shiftRuns.length" compact title="No payroll runs yet" description="Create a saved draft after pay profiles and attendance are ready, or use the no-save employee test." />
            <div v-else class="space-y-2"><article v-for="run in shiftRuns" :key="run.id" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3"><div><p class="font-medium text-gray-100">Payday {{ formatWorkDate(run.payday || run.pay_date) }}</p><p class="mt-1 text-xs text-gray-500">{{shiftName}} · {{ formatWorkRange(run.period_start || run.periodStart, run.period_end || run.periodEnd) }} · {{ run.employee_count ?? run.lines?.length ?? 0 }} employees · {{ money(run.totals?.net_pay ?? run.total_net_pay) }} net</p></div><div class="flex items-center gap-2"><StatusBadge :status="run.status || 'draft'" /><AppButton size="sm" variant="secondary" :loading="loadingRun" @click="selectRun(run)">Open register</AppButton></div></article></div>
          <details v-if="legacyRuns.length" class="mt-4 border-t border-gray-800 pt-4"><summary class="cursor-pointer text-sm text-gray-400">Earlier combined-shift runs ({{legacyRuns.length}})</summary><div class="mt-3 space-y-2"><div v-for="run in legacyRuns" :key="run.id" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800 p-3"><span class="text-sm text-gray-300">{{formatWorkRange(run.period_start,run.period_end)}} · {{run.status}}</span><AppButton size="sm" variant="secondary" @click="selectRun(run)">Open older run</AppButton></div></div></details>
        </section>

        <template v-if="embedded ? ['review','approve','payslips'].includes(stage) : workflowStep === 4">
          <div v-if="embedded && !activeRun && stage === 'review' && (calculateRequested || busy)" class="rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-300" role="status">Calculating pay from the confirmed attendance…</div>
          <div v-else-if="embedded && !activeRun && (loadingRun || attendanceLoading)" class="rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-400" role="status">Loading this pay run…</div>
          <section v-else-if="embedded && !activeRun && stage === 'review' && runAttendanceBatch && attendanceResult?.review_state === 'confirmed'" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 class="font-semibold text-gray-100">Pay hasn't been calculated yet</h2>
            <p class="mt-2 text-sm text-gray-400">It will use the confirmed attendance <span class="text-gray-200">{{attendanceResult.file_name}}</span>{{cutoffType === 'second' ? ', with SSS, PhilHealth and Pag-IBIG' : ''}}. Calculating saves a draft you can check and recalculate. Nobody is paid or notified.</p>
            <details v-if="eligibleReviews.length > 1" class="mt-3 text-xs text-gray-400"><summary class="cursor-pointer">Use a different confirmed file</summary><label class="mt-2 block">Confirmed attendance file<select :value="runAttendanceBatch" class="form-control mt-2" @change="chooseAttendance($event.target.value)"><option v-for="b in eligibleReviews" :key="b.id" :value="b.id">{{b.file_name}} · Review {{b.id}}</option></select></label></details>
          </section>
          <section v-if="embedded && activeRun && stage === 'approve'" class="space-y-5">
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div><h2 class="font-semibold text-gray-100">{{isPracticeRun ? 'Approve and finish the practice run' : 'Approve and pay'}}</h2><p class="mt-1 text-sm text-gray-400">{{formatWorkRange(activeRun.period_start, activeRun.period_end)}} · payday {{formatWorkDate(activeRun.payday || activeRun.pay_date)}}</p></div>
                <MoreMenu label="Download" :items="downloadItems" />
              </div>
              <ol class="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Approval progress">
                <li v-for="(item, index) in [
                  { label: isPracticeRun ? 'Approve practice run' : 'Approve payroll', done: activeRun.status !== 'draft', current: activeRun.status === 'draft', detail: activeRun.approved_at ? `Approved ${formatStamp(activeRun.approved_at)}` : 'Freezes every amount' },
                  { label: 'Mark as paid', done: Boolean(activeRun.payment), current: activeRun.status === 'approved' && !activeRun.payment, detail: activeRun.payment ? `Paid ${formatWorkDate(activeRun.payment.paid_on)} · ${activeRun.payment.reference}` : 'After the bank transfer' },
                  { label: isPracticeRun ? 'Finish practice run' : 'Close payroll', done: activeRun.status === 'locked', current: activeRun.status === 'approved' && Boolean(activeRun.payment), detail: activeRun.locked_at ? `Done ${formatStamp(activeRun.locked_at)}` : isPracticeRun ? 'Then send test payslips' : 'Releases payslips' },
                ]" :key="item.label" class="flex items-start gap-3 rounded-lg border px-3 py-2.5" :class="item.current ? 'border-primary-600 bg-primary-950/20' : 'border-gray-800'">
                  <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold" :class="item.done ? 'border-emerald-500 bg-emerald-500 text-gray-950' : item.current ? 'border-primary-500 text-primary-300' : 'border-gray-700 text-gray-500'">{{item.done ? '✓' : index + 1}}</span>
                  <span class="min-w-0"><span class="block text-sm font-semibold" :class="item.done || item.current ? 'text-gray-100' : 'text-gray-500'">{{item.label}}</span><span class="block truncate text-xs text-gray-500">{{item.detail}}</span></span>
                </li>
              </ol>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <div class="rounded-xl border border-emerald-800/50 bg-emerald-950/15 p-5">
                <p class="text-xs font-semibold uppercase tracking-wide text-emerald-300">Transfer to employees</p>
                <p class="mt-1 text-3xl font-semibold text-emerald-200">{{money(totalNet)}}</p>
                <p class="mt-1 text-sm text-gray-400">{{currentLines.length}} {{currentLines.length === 1 ? 'person' : 'people'}}<template v-if="previousPayRun"> · {{Number(totalNet) >= Number(previousPayRun.total_net_pay) ? '+' : '−'}}{{money(Math.abs(Number(totalNet) - Number(previousPayRun.total_net_pay)))}} vs {{formatWorkDate(previousPayRun.payday || previousPayRun.pay_date)}}</template></p>
              </div>
              <div class="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Pay to agencies</p>
                <template v-if="paySummary.agencies.length">
                  <p class="mt-1 text-3xl font-semibold text-gray-100">{{money(paySummary.remit)}}</p>
                  <dl class="mt-2 space-y-1 text-sm">
                    <div v-for="agency in paySummary.agencies" :key="agency.name" class="flex justify-between gap-3"><dt class="text-gray-400">{{agency.name}}<span v-if="agency.loans" class="text-xs text-gray-500"> · incl. {{money(agency.loans)}} loans</span></dt><dd class="font-medium text-gray-200">{{money(agency.amount)}}</dd></div>
                  </dl>
                  <p class="mt-2 text-xs text-gray-500">Employee and employer shares together, paid separately to each agency.</p>
                </template>
                <p v-else class="mt-2 text-sm text-gray-400">Nothing this payday. Contributions are taken on the month-end payday.</p>
              </div>
            </div>

            <div v-if="activeRun.status === 'draft'" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h3 class="font-semibold text-gray-100">Before you approve</h3>
              <ul class="mt-3 space-y-3">
                <li v-for="check in approvalChecks" :key="check.text" class="flex gap-3 text-sm">
                  <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" :class="check.state === 'ok' ? 'bg-emerald-500/20 text-emerald-300' : check.state === 'warn' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'" aria-hidden="true">{{check.state === 'ok' ? '✓' : check.state === 'warn' ? '!' : '✕'}}</span>
                  <div class="min-w-0">
                    <p :class="check.state === 'ok' ? 'text-gray-200' : check.state === 'warn' ? 'text-amber-200' : 'text-red-200'">{{check.text}}</p>
                    <p v-if="check.detail" class="mt-0.5 text-xs text-gray-400">{{check.detail}} <button v-if="check.state !== 'ok'" type="button" class="text-primary-300 hover:underline" @click="emit('navigate', 'review')">Open Review pay</button></p>
                    <ul v-if="check.adjustments" class="mt-1 space-y-0.5 text-xs text-gray-400">
                      <li v-for="entry in check.adjustments" :key="entry.line.id"><span class="text-gray-300">{{displayName(entry.line)}}:</span> {{entry.items.map(item => `${item.label} ${item.amount < 0 ? '−' : '+'}${money(Math.abs(item.amount))}`).join(' · ')}}</li>
                    </ul>
                  </div>
                </li>
              </ul>
            </div>

            <div class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
              <div class="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-3"><h3 class="font-semibold text-gray-100">Who gets paid</h3><span class="text-sm text-gray-400">{{currentLines.length}} {{currentLines.length === 1 ? 'person' : 'people'}}</span></div>
              <div class="max-h-[28rem] overflow-y-auto">
                <table class="w-full text-left text-sm">
                  <thead class="sticky top-0 bg-gray-900 text-xs uppercase text-gray-500"><tr><th class="px-5 py-2">Employee</th><th class="px-5 py-2 text-right">Net pay</th><th class="px-5 py-2"><span class="sr-only">Payslip</span></th></tr></thead>
                  <tbody class="divide-y divide-gray-800">
                    <tr v-for="line in paidLines" :key="line.id"><td class="px-5 py-2 text-gray-200">{{displayName(line)}}</td><td class="px-5 py-2 text-right font-semibold" :class="Number(line.net_pay) > 0 ? 'text-emerald-300' : 'text-red-300'">{{money(line.net_pay)}}</td><td class="px-5 py-2 text-right"><button type="button" class="text-xs font-semibold text-primary-300 hover:underline" @click="openPayslip(line)">Payslip</button></td></tr>
                  </tbody>
                  <tfoot class="border-t border-gray-700"><tr><th class="px-5 py-2 text-gray-300">Total</th><td class="px-5 py-2 text-right font-semibold text-emerald-200">{{money(totalNet)}}</td><td></td></tr></tfoot>
                </table>
              </div>
            </div>
          </section>
          <PayrollPayslipsDesk v-if="embedded && activeRun && stage === 'payslips'" :key="activeRun.id" :run="activeRun" :practice="isPracticeRun" :can-send="payrollFinalizationEnabled || isPracticeRun" @changed="emit('changed')" />
          <section v-if="!embedded && !activeRun"class="rounded-xl border border-gray-800 bg-gray-900 p-5"><h2 class="font-semibold text-gray-100">{{isPracticeRun?'4. Review practice payroll · TEST ONLY':'4. Review employee pay'}}</h2><p v-if="isPracticeRun && activeRun.status==='locked'" class="mt-2 text-sm text-emerald-300">Practice complete: attendance → calculation → approval → simulated payment → finish. No employee payslips released.</p><p class="mt-2 text-sm text-gray-400">No draft is open. Create one from the reviewed attendance batch, or open a saved run.</p><div class="mt-4 flex flex-wrap gap-2"><AppButton size="sm" :disabled="!runAttendanceBatch" @click="workflowStep = 1">Prepare draft</AppButton><AppButton size="sm" variant="secondary" @click="workflowStep = 6">Open saved runs</AppButton></div></section>
          <section v-if="activeRun && !(embedded && ['approve', 'payslips'].includes(stage))" class="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div class="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 class="font-semibold text-gray-100">{{embedded?(stage==='payslips'?'Employee payslips':'Employee pay register'):isPracticeRun?'4. Review practice payroll · TEST ONLY':'4. Review employee pay'}}</h2><p v-if="isPracticeRun && activeRun.status==='locked'" class="mt-2 text-sm text-emerald-300">Practice complete: attendance → calculation → approval → simulated payment → finish. No employee payslips released.</p><p class="mt-1 text-sm text-gray-400">{{shiftLabel(runScope(activeRun))}} · Payday {{ formatWorkDate(activeRun.payday || activeRun.pay_date) }}<button v-if="embedded && activeRun.status === 'draft'" type="button" class="ml-1 text-primary-300 hover:underline" :disabled="busy" @click="payDateForm = String(activeRun.payday || activeRun.pay_date || payDate).slice(0, 10)">Change</button> · {{ formatWorkRange(activeRun.period_start,activeRun.period_end) }} · {{ activeRun.status || 'preview' }}</p><p v-if="activeRun.status === 'draft'" class="mt-1 text-xs text-amber-300">Check overtime and holiday earnings against approved HR forms. Draft payslips are watermarked; email is disabled.</p></div><div class="flex flex-wrap items-center gap-2"><p class="mr-2 text-lg font-semibold text-emerald-300">{{ money(totalNet) }} net total</p><MoreMenu v-if="embedded" label="Download" :items="downloadItems" /><template v-else><AppButton v-if="canFinalizeRun && ['draft', 'preview', 'pending_review'].includes(String(activeRun.status || 'draft').toLowerCase())" size="sm" variant="success" :loading="busy" :disabled="approvalBlockers.length > 0" @click="changeRunState('approve', activeRun)">{{isPracticeRun?'Approve practice run':'Approve'}}</AppButton><AppButton v-if="activeRun.status === 'approved' || activeRun.status === 'locked'" size="sm" variant="secondary" :loading="busy" @click="exportPayment('payment')">Payment register CSV</AppButton><AppButton v-if="canFinalizeRun && activeRun.status === 'approved' && !activeRun.payment" size="sm" :loading="busy" @click="beginPayment">Mark as paid</AppButton><AppButton v-if="canFinalizeRun && activeRun.status === 'approved' && activeRun.payment" size="sm" variant="secondary" :loading="busy" @click="changeRunState('lock', activeRun)">{{isPracticeRun?'Finish practice run':'Close payroll & release payslips'}}</AppButton><AppButton v-if="payrollFinalizationEnabled && !isPracticeRun && activeRun.status === 'locked' && activeRun.payment" size="sm" :loading="busy" @click="emailAllPayslips">{{ sendProgress ? `Sending ${sendProgress}` : 'Email all payslips' }}</AppButton></template></div></div>
            <div class="mb-4 flex flex-wrap gap-3 text-sm"><template v-if="!embedded"><button class="text-primary-300 underline" :disabled="busy" @click="exportPayment('register')">Export payroll register</button><button class="text-primary-300 underline" :disabled="busy" @click="exportPayment('remittance')">Export contribution report</button></template><span v-if="activeRun.payment" class="text-gray-400">Payment recorded: {{activeRun.payment.reference}} · {{activeRun.payment.paid_on}}</span></div>
            <p v-if="reviewExceptionCount || reviewImportErrorCount" class="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">Approval is blocked: {{ reviewExceptionCount }} unresolved scan day(s), {{ reviewImportErrorCount }} import error(s). Correct the timekeeping batch and recalculate this draft.</p>
            <div v-if="currentLines.some(needsNightReview)" class="mb-4 rounded-lg border border-amber-800/40 p-3 text-sm text-amber-200">
              Verify night differential for holiday work or work without actual punches. Enter one total night differential override; it replaces the automatic amount.
              <button v-for="l in currentLines.filter(needsNightReview)" :key="l.id" class="ml-3 underline" @click="beginAdjust(l)">Review {{displayName(l)}}</button>
            </div>
            <div v-if="activeRun.status==='draft' && currentLines.some(l=>l.details?.payBasisReview?.required && !l.details?.payBasisReview?.verifiedReason)" class="mb-4 rounded-lg border border-amber-800/40 p-3 text-sm text-amber-200">
              Someone was hired or left during this cutoff. Review basic pay and COLA against company policy, enter any needed adjustments under Charges, and verify each affected employee.
              <button v-for="l in currentLines.filter(l=>l.details?.payBasisReview?.required && !l.details?.payBasisReview?.verifiedReason)" :key="l.id" class="ml-3 underline" @click="payBasisForm={line:l,reason:''}">Verify {{displayName(l)}}</button>
            </div>
            <p v-if="legacyHolidayLineCount" class="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">{{ legacyHolidayLineCount }} old full-holiday-pay line(s) need HR review. Open Adjust pay for each one, remove the old line, and record the holiday work in Attendance instead.</p>
            <dl class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7"><div v-for="summary in [{ label: 'Basic pay', value: registerTotals.basic }, { label: 'Extra earnings', value: registerTotals.extras }, { label: 'Charge earnings', value: registerTotals.chargeEarnings }, { label: 'Charges', value: registerTotals.charges }, { label: 'Time deductions', value: registerTotals.time }, { label: 'Contributions', value: registerTotals.statutory }, { label: 'Net pay', value: registerTotals.net }]" :key="summary.label" class="rounded-lg border border-gray-800 bg-gray-950/40 p-3"><dt class="text-xs text-gray-500">{{ summary.label }}</dt><dd class="mt-1 text-sm font-semibold text-gray-200">{{ money(summary.value) }}</dd></div></dl>
            <div v-if="loadingRun" class="rounded-lg border border-gray-800 p-4 text-sm text-gray-400" role="status">Loading run details...</div>
            <div v-else-if="!currentLines.length" class="rounded-lg border border-gray-800 p-4 text-sm text-gray-500">No employee line items are available.</div>
            <div v-else class="overflow-x-auto rounded-lg border border-gray-800">
              <table class="w-full min-w-[1020px] text-left text-sm">
                <thead class="border-b border-gray-800 bg-gray-950/40 text-xs uppercase text-gray-500"><tr><th class="px-3 py-2">Employee</th><th class="px-3 py-2 text-right">Basic</th><th class="px-3 py-2 text-right">Extra / charge earnings</th><th class="px-3 py-2 text-right">Charges</th><th class="px-3 py-2 text-right">Time deductions</th><th class="px-3 py-2 text-right">Contributions</th><th class="px-3 py-2 text-right">Net pay</th><th class="px-3 py-2 text-right"><span class="sr-only">Actions</span></th></tr></thead>
                <tbody class="divide-y divide-gray-800">
                  <tr v-for="line in currentLines" :key="line.employee_id ?? line.id">
                    <td class="px-3 py-3 font-medium text-gray-100">{{ displayName(line) }}<span v-if="activeRun.cutoff === 'second' && activeRun.include_contributions" class="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-normal text-gray-500">15th pay {{ money(firstCutoffAmount(line)) }} · {{ firstCutoffLabel(line) }}<button v-if="activeRun.status === 'draft'" type="button" class="text-primary-300 hover:underline" @click="beginFirstCutoffEdit(line)">Change</button></span></td>
                    <td class="px-3 py-3 text-right">{{ money(line.gross_salary) }}</td>
                    <td class="px-3 py-3 text-right">{{ money(extraEarnings(line) + lineColaPay(line) + chargeEarnings(line)) }}</td>
                    <td class="px-3 py-3 text-right">{{ money(chargeDeductions(line)) }}</td>
                    <td class="px-3 py-3 text-right">{{ money(timeDeductions(line)) }}</td>
                    <td class="px-3 py-3 text-right">{{ money(statutoryDeductions(line)) }}</td>
                    <td class="px-3 py-3 text-right font-semibold text-emerald-300">{{ money(line.net_pay) }}</td>
                    <td class="px-3 py-3"><div class="flex items-center justify-end gap-4 whitespace-nowrap text-sm font-semibold"><button type="button" class="text-primary-300 hover:underline" @click="openPayslip(line)">Payslip</button><button v-if="activeRun.status === 'draft'" type="button" class="rounded-lg border border-gray-700 px-3 py-1 text-gray-200 hover:border-primary-500 hover:text-primary-200" @click="beginAdjust(line)">Adjust pay</button></div></td>
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
          <div v-if="!embedded"><AppButton variant="secondary" @click="workflowStep = 6">View saved runs</AppButton></div>
          <template v-if="embedded && !(loadingRun || attendanceLoading)">
            <template v-if="!activeRun && !calculateRequested && !busy">
              <PayRunNextStep v-if="stage !== 'review'" tone="waiting" title="No draft yet" detail="Calculate and check pay first.">
                <AppButton variant="secondary" @click="emit('navigate', 'review')">Go to Review pay</AppButton>
              </PayRunNextStep>
              <PayRunNextStep v-else-if="runAttendanceBatch && attendanceResult?.review_state === 'confirmed'" title="Ready to calculate pay" :detail="`Payday ${formatWorkDate(payDate)} · saves a draft you can check and recalculate`">
                <AppButton :loading="busy" :disabled="payDateError" @click="createPreview">Calculate pay</AppButton>
              </PayRunNextStep>
              <PayRunNextStep v-else tone="waiting" title="Confirm attendance first" detail="Pay is calculated from confirmed attendance for these work dates.">
                <AppButton variant="secondary" @click="emit('navigate', 'attendance')">Go to Attendance</AppButton>
              </PayRunNextStep>
            </template>
            <template v-else-if="stage === 'review'">
              <PayRunNextStep v-if="activeRun.status === 'draft'" :title="`Check the draft · ${money(totalNet)} net for ${currentLines.length} employees`" detail="Use Earnings or Charges to adjust anyone. Recalculate if attendance changed.">
                <AppButton variant="secondary" :loading="busy" :disabled="!runAttendanceBatch || attendanceResult?.review_state !== 'confirmed' || payDateError" title="Rebuild this draft from confirmed attendance; saved earnings and charges are kept" @click="createPreview">Recalculate</AppButton>
                <AppButton @click="emit('navigate', 'approve')">Continue to approval →</AppButton>
              </PayRunNextStep>
              <PayRunNextStep v-else tone="done" :title="activeRun.status === 'locked' ? (isPracticeRun ? '✓ Practice finished' : '✓ Payroll closed') : '✓ Approved'" :detail="`${money(totalNet)} net for ${currentLines.length} employees · amounts are frozen`">
                <AppButton v-if="activeRun.status === 'approved'" @click="emit('navigate', 'approve')">Go to Approve &amp; pay →</AppButton>
                <AppButton v-else-if="!isPracticeRun" @click="emit('navigate', 'payslips')">View payslips →</AppButton>
              </PayRunNextStep>
            </template>
            <template v-else-if="stage === 'approve'">
              <PayRunNextStep v-if="activeRun.status === 'locked'" tone="done" :title="isPracticeRun ? '✓ Practice finished' : '✓ Payroll closed'" :detail="isPracticeRun ? 'Next, send test payslips to the people you choose.' : 'Payslips are available to employees.'">
                <AppButton @click="emit('navigate', 'payslips')">Go to payslips →</AppButton>
              </PayRunNextStep>
              <PayRunNextStep v-else-if="!canFinalizeRun" tone="waiting" title="Approving real payroll is turned off for now" detail="To try approving, paying and closing, start a practice run from the Payroll page." />
              <PayRunNextStep v-else-if="activeRun.status === 'draft' && approvalBlockers.length" tone="waiting" :title="`${approvalBlockers.length} ${approvalBlockers.length === 1 ? 'thing' : 'things'} to fix before approval`" detail="They are marked ✕ under Before you approve.">
                <AppButton variant="secondary" @click="emit('navigate', 'review')">Open Review pay</AppButton>
              </PayRunNextStep>
              <PayRunNextStep v-else-if="activeRun.status === 'draft'" :title="isPracticeRun ? 'Approve the practice run' : 'Approve payroll'" :detail="`${money(totalNet)} net for ${currentLines.length} employees · approving freezes every amount`">
                <AppButton variant="success" :loading="busy" @click="changeRunState('approve', activeRun)">{{isPracticeRun ? 'Approve practice run' : 'Approve payroll'}}</AppButton>
              </PayRunNextStep>
              <PayRunNextStep v-else-if="!activeRun.payment" title="Mark as paid" :detail="`Once ${money(totalNet)} has been sent to the ${currentLines.length} ${currentLines.length === 1 ? 'person' : 'people'} above`">
                <AppButton :loading="busy" @click="beginPayment">Mark as paid</AppButton>
              </PayRunNextStep>
              <PayRunNextStep v-else :title="isPracticeRun ? 'Finish the practice run' : 'Close payroll'" :detail="isPracticeRun ? 'Then you choose who gets a test payslip.' : 'Locks the run and releases payslips to employees.'">
                <AppButton :loading="busy" @click="changeRunState('lock', activeRun)">{{isPracticeRun ? 'Finish practice run' : 'Close payroll & release payslips'}}</AppButton>
              </PayRunNextStep>
            </template>
            <template v-else-if="stage === 'payslips'">
              <PayRunNextStep v-if="activeRun.status !== 'locked'" tone="waiting" :title="isPracticeRun ? 'Test payslips can be sent once the practice run is finished' : 'Payslips are released after payroll is closed'" detail="Approve, mark as paid, then finish.">
                <AppButton variant="secondary" @click="emit('navigate', 'approve')">Go to Approve &amp; pay</AppButton>
              </PayRunNextStep>
              <PayRunNextStep v-else tone="done" :title="isPracticeRun ? '✓ Practice finished' : '✓ Payroll closed'" detail="Tick people above and press Send: each gets their payslip on their page and by email." />
            </template>
          </template>
        </template>
      <PayrollAttendanceAdjustmentModal :show="Boolean(editingAttendanceDay)" :day="editingAttendanceDay" :saving="Boolean(savingAttendanceDay)" @close="editingAttendanceDay = null" @save="saveAttendanceAdjustment" />
    </template>
    <div v-if="editingFirstCutoff" class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Confirm 15th payroll amount" @click.self="editingFirstCutoff = null">
      <div class="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
        <h2 class="font-semibold text-gray-100">Confirm 15th payroll · {{ displayName(editingFirstCutoff.line) }}</h2>
        <p class="mt-2 text-xs text-gray-400">The system uses an approved 15th run when available. Use this correction only when HR confirms a different amount or the earlier run is not saved. This affects the SSS bracket and net pay, not the current cutoff's basic salary.</p>
        <label class="mt-4 block text-xs text-gray-300">15th SSS-eligible pay (₱)<input v-model.number="editingFirstCutoff.firstCutoffPay" type="number" min="0" max="10000000" step="0.01" class="form-control mt-1"></label>
                <div class="mt-5 flex justify-end gap-2"><AppButton variant="secondary" @click="editingFirstCutoff = null">Cancel</AppButton><AppButton :loading="busy" @click="saveFirstCutoff">Save confirmed amount</AppButton></div>
      </div>
    </div>
    <AppModal :show="Boolean(payBasisForm)" title="Verify cutoff pay basis" @close="payBasisForm=null">
      <div v-if="payBasisForm" class="space-y-4"><p>{{displayName(payBasisForm.line)}} · Basic {{money(payBasisForm.line.gross_salary)}} · COLA {{money(payBasisForm.line.cola_pay)}}</p><p class="text-sm text-gray-400">Confirm the company's treatment for this hire, departure, or mid-cutoff salary change. Save any required adjustments under Charges first.</p></div>
      <template #footer><AppButton variant="secondary" @click="payBasisForm=null">Cancel</AppButton><AppButton :loading="busy" @click="savePayBasis">Verify cutoff pay</AppButton></template>
    </AppModal>
    <AppModal :show="Boolean(payDateForm)" title="Change pay date" @close="payDateForm = null">
      <div class="space-y-3"><p class="text-sm text-gray-400">Use this only if employees are paid on a different day, for example before a weekend. Pay is recalculated with the new date; earnings and charges you added are kept.</p>
        <label class="block max-w-xs text-sm text-gray-300">Pay date<input v-model="payDateForm" type="date" class="form-control mt-2"></label>
        <p v-if="payDateFormError" class="text-xs text-amber-300">Choose a date after the last work date ({{ formatWorkDate(cutoffEnd) }}).</p></div>
      <template #footer><AppButton variant="secondary" @click="payDateForm = null">Cancel</AppButton><AppButton :loading="busy" :disabled="payDateFormError" @click="savePayDate">Recalculate with this date</AppButton></template>
    </AppModal>
    <AppModal :show="Boolean(paymentForm)" title="Mark this payroll as paid" @close="paymentForm = null">
      <div v-if="paymentForm" class="space-y-5">
        <div class="rounded-lg border border-emerald-800/50 bg-emerald-950/15 p-4">
          <p class="text-sm text-gray-300">Have you sent this from the bank?</p>
          <p class="mt-1 text-2xl font-semibold text-emerald-200">{{ money(totalNet) }}</p>
          <p class="text-sm text-gray-400">to {{ currentLines.length }} {{ currentLines.length === 1 ? 'employee' : 'employees' }}</p>
        </div>
        <p class="text-sm text-gray-400">{{ isPracticeRun ? 'Practice: nothing is actually paid. This only tries the step.' : 'The system does not move money. This records that you paid, so payroll can be closed.' }}</p>
        <label class="block text-sm text-gray-300">Date you sent it<input v-model="paymentForm.paidOn" type="date" :max="new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)" class="form-control mt-1.5 max-w-xs"></label>
        <label class="block text-sm text-gray-300">Bank reference <span class="text-gray-500">(optional)</span><input v-model="paymentForm.reference" maxlength="200" placeholder="e.g. the transfer or batch number" class="form-control mt-1.5"><span class="mt-1 block text-xs text-gray-500">Helps you find the transfer later. Leave blank if there isn't one.</span></label>
      </div>
      <template #footer><AppButton variant="secondary" @click="paymentForm = null">Cancel</AppButton><AppButton :loading="busy" :disabled="!paymentForm?.paidOn" @click="savePayment">Mark as paid</AppButton></template>
    </AppModal>
    <PayrollPayslipPreview v-if="selectedPayslip" :line="selectedPayslip.line" :run="selectedPayslip.run" :busy="busy" :can-edit="canManage && Boolean(selectedPayslip.line.id) && selectedPayslip.run.status === 'draft'" :managed="canManage" @close="selectedPayslip = null" @print="payslipPdf(false)" @download="payslipPdf(true)" @edit="beginAdjust(selectedPayslip.line)" />
    <PayrollAdjustPanel v-if="adjusting && activeRun" :line="adjusting" :run="activeRun" :busy="busy" @close="adjusting = null" @save="saveAdjustments" />
  </div>
</template>
