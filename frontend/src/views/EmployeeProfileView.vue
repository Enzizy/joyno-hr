<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createUser, deleteEmployee, getAuditLogs, getEmployee, getPayrollProfiles, getUsers, setEmployeeAwol, updateEmployee } from '@/services/api'
import { payrollEnabled } from '@/config/features'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppConfirmModal from '@/components/ui/AppConfirmModal.vue'
import AppModal from '@/components/ui/AppModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import MoreMenu from '@/components/ui/MoreMenu.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { auditAction, auditActor, auditChanges } from '@/utils/auditLog'
import EmployeePaySetup from '@/components/employees/EmployeePaySetup.vue'

// One page per employee: details, schedule & pay, leave, login and history in one place.
const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const id = computed(() => Number(route.params.id))
const employee = ref(null)
const profile = ref(null)
const account = ref(null)
const activities = ref([])
const loading = ref(true)
const loadError = ref('')
const departmentOptions = ['Marketing', 'IT', 'Sales', 'Admin']
const sections = computed(() => [
  { key: 'details', label: 'Details' },
  ...(payrollEnabled ? [{ key: 'pay', label: 'Schedule & pay' }] : []),
  { key: 'leave', label: 'Leave' },
  { key: 'login', label: 'Login' },
  { key: 'history', label: 'History' },
])
const fullName = computed(() => `${employee.value?.first_name || ''} ${employee.value?.last_name || ''}`.trim())
const returnTo = computed(() => String(route.query.returnTo || ''))
const formatDate = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not recorded'
const stamp = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : ''

async function load() {
  loading.value = true; loadError.value = ''
  try {
    const [person, profiles, users, logs] = await Promise.all([
      getEmployee(id.value),
      payrollEnabled ? getPayrollProfiles().catch(() => []) : [],
      getUsers().catch(() => []),
      getAuditLogs({ employee_id: id.value, limit: 30 }).catch(() => ({ items: [] })),
    ])
    employee.value = person
    profile.value = (profiles || []).find(p => Number(p.employee_id) === id.value) || null
    account.value = (users || []).find(u => Number(u.employee_id) === id.value) || null
    activities.value = logs?.items || []
    resetDetails()
  } catch (error) { loadError.value = error.message || 'Unable to load this employee.' }
  finally { loading.value = false }
}

// Details
const details = ref({})
const savingDetails = ref(false)
function resetDetails() {
  const e = employee.value || {}
  details.value = { employee_code: e.employee_code, first_name: e.first_name, last_name: e.last_name, department: e.department || '', position: e.position,
    date_hired: e.date_hired?.slice(0, 10) || '', last_working_date: e.last_working_date?.slice(0, 10) || '', status: e.status || 'active' }
}
async function saveDetails() {
  savingDetails.value = true
  try {
    await updateEmployee(id.value, { ...details.value, shift: employee.value.shift || 'day' })
    toast.success('Details saved')
    await load()
  } catch (error) { toast.error(error.message || 'Unable to save details.') }
  finally { savingDetails.value = false }
}

// Leave
const leaveBalances = computed(() => employee.value?.leave_balance_breakdown?.balances || [])
const fixed = value => Number(value || 0).toFixed(2)

// Login
const newAccount = ref({ email: '', password: '', role: 'employee' })
const creatingAccount = ref(false)
async function createAccount() {
  if (!newAccount.value.email || !newAccount.value.password) { toast.warning('Enter an email and a temporary password.'); return }
  creatingAccount.value = true
  try {
    await createUser({ ...newAccount.value, employee_id: id.value })
    toast.success('Login created. Share the temporary password with the employee.')
    newAccount.value = { email: '', password: '', role: 'employee' }
    await load()
  } catch (error) { toast.error(error.message || 'Unable to create the login.') }
  finally { creatingAccount.value = false }
}

// AWOL and delete
const awolForm = ref(null)
const savingAwol = ref(false)
async function saveAwol() {
  if (!awolForm.value.start_date || !awolForm.value.end_date) { toast.warning('Start and end dates are required.'); return }
  savingAwol.value = true
  try { await setEmployeeAwol(id.value, awolForm.value); toast.success('AWOL recorded.'); awolForm.value = null; await load() }
  catch (error) { toast.error(error.message || 'Unable to record AWOL.') }
  finally { savingAwol.value = false }
}
const confirmDelete = ref(false)
const deleting = ref(false)
async function removeEmployee() {
  deleting.value = true
  try { await deleteEmployee(id.value); toast.success('Employee deleted.'); router.push('/employees') }
  catch (error) { toast.error(error.message || 'Unable to delete.') }
  finally { deleting.value = false; confirmDelete.value = false }
}
const moreItems = computed(() => [
  { label: 'Record AWOL', onSelect: () => { awolForm.value = { start_date: '', end_date: '', reason: '' } } },
  { label: 'Delete employee', onSelect: () => { confirmDelete.value = true } },
])

function scrollTo(key) { document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
onMounted(async () => { await load(); if (route.query.section) { await nextTick(); scrollTo(String(route.query.section)) } })
watch(id, load)
</script>

<template>
  <div class="space-y-6">
    <nav class="text-sm text-gray-500" aria-label="Breadcrumb">
      <RouterLink to="/employees" class="font-medium text-gray-400 hover:text-primary-300">Employees</RouterLink> › {{ fullName || 'Employee' }}
    </nav>
    <div v-if="loading && !employee" class="rounded-xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400" role="status">Loading employee…</div>
    <EmptyState v-else-if="loadError" title="Employee not found" :description="loadError"><template #actions><RouterLink to="/employees" class="text-sm font-semibold text-primary-300 hover:underline">Back to Employees</RouterLink></template></EmptyState>
    <template v-else-if="employee">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-center gap-4">
          <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary-500 text-lg font-semibold text-gray-100">{{ employee.first_name?.[0] }}{{ employee.last_name?.[0] }}</span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2"><h1 class="truncate text-2xl font-semibold text-gray-100">{{ fullName }}</h1><StatusBadge :status="employee.status" /></div>
            <p class="mt-1 text-sm text-gray-400">Employee {{ employee.employee_code }} · {{ employee.position || 'Position not set' }} · {{ employee.department || 'No department' }} · {{ String(employee.shift).toLowerCase() === 'night' ? 'Night' : 'Day' }} shift</p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <AppButton v-if="returnTo.startsWith('/payroll')" variant="outline" @click="router.push(returnTo)">{{ returnTo === '/payroll' ? 'Back to Payroll' : 'Back to pay run' }} →</AppButton>
          <MoreMenu label="More" :items="moreItems" />
        </div>
      </header>

      <nav class="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-gray-800 bg-gray-950/95 py-1 backdrop-blur" aria-label="Employee sections">
        <button v-for="section in sections" :key="section.key" type="button" class="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:bg-gray-900 hover:text-gray-100" @click="scrollTo(section.key)">{{ section.label }}</button>
      </nav>

      <section id="section-details" class="scroll-mt-16 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="mb-4 font-semibold text-gray-100">Details</h2>
        <form class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" @submit.prevent="saveDetails">
          <label class="text-xs font-medium text-gray-400">Employee ID<input v-model="details.employee_code" required class="form-control mt-1.5"></label>
          <label class="text-xs font-medium text-gray-400">First name<input v-model="details.first_name" required class="form-control mt-1.5"></label>
          <label class="text-xs font-medium text-gray-400">Last name<input v-model="details.last_name" required class="form-control mt-1.5"></label>
          <label class="text-xs font-medium text-gray-400">Department<select v-model="details.department" required class="form-control mt-1.5"><option value="">Select department</option><option v-for="dept in departmentOptions" :key="dept" :value="dept">{{ dept }}</option></select></label>
          <label class="text-xs font-medium text-gray-400">Position<input v-model="details.position" required class="form-control mt-1.5"></label>
          <label class="text-xs font-medium text-gray-400">Status<select v-model="details.status" class="form-control mt-1.5"><option value="active">Active</option><option value="inactive">Inactive</option><option value="resigned">Resigned</option></select></label>
          <label class="text-xs font-medium text-gray-400">Date hired<input v-model="details.date_hired" type="date" required class="form-control mt-1.5"></label>
          <label class="text-xs font-medium text-gray-400">Last working date <span class="text-gray-600">(when leaving)</span><input v-model="details.last_working_date" type="date" :min="details.date_hired" class="form-control mt-1.5"></label>
          <div class="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-3"><AppButton type="button" variant="outline" :disabled="savingDetails" @click="resetDetails">Undo changes</AppButton><AppButton type="submit" :loading="savingDetails">Save details</AppButton></div>
        </form>
      </section>

      <section v-if="payrollEnabled" id="section-pay" class="scroll-mt-16 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="mb-4 font-semibold text-gray-100">Schedule & pay</h2>
        <EmployeePaySetup v-if="profile" :employee="employee" :profile="profile" @saved="load" />
        <p v-else class="text-sm text-gray-400">Not paid through payroll (for example the CEO, or an inactive employee).</p>
      </section>

      <section id="section-leave" class="scroll-mt-16 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div class="mb-4 flex items-center justify-between gap-3"><h2 class="font-semibold text-gray-100">Leave</h2><span v-if="employee.leave_balance_breakdown?.year" class="text-xs text-gray-500">{{ employee.leave_balance_breakdown.year }}</span></div>
        <div v-if="leaveBalances.length" class="grid gap-3 sm:grid-cols-3">
          <article v-for="item in leaveBalances" :key="item.id" class="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
            <p class="text-sm font-medium text-gray-200">{{ item.name }}</p>
            <p class="mt-2 text-xl font-semibold text-gray-100">{{ item.eligible ? `${fixed(item.remaining)} days left` : 'Not eligible yet' }}</p>
            <p class="mt-1 text-xs text-gray-500">{{ item.eligible ? `${fixed(item.used)} used of ${fixed(item.annual_allowance)}` : `Available after ${item.min_months_employed} months` }}</p>
          </article>
        </div>
        <p v-else class="text-sm text-gray-400">Available leave credits: <span class="font-semibold text-gray-100">{{ fixed(employee.leave_credits) }}</span></p>
        <p class="mt-3 text-xs text-gray-500">Hired {{ formatDate(employee.date_hired) }}<span v-if="employee.last_working_date"> · last working day {{ formatDate(employee.last_working_date) }}</span></p>
      </section>

      <section id="section-login" class="scroll-mt-16 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="mb-4 font-semibold text-gray-100">Login</h2>
        <div v-if="account" class="flex flex-wrap items-center justify-between gap-3">
          <div><p class="text-sm font-medium text-gray-100">{{ account.email }}</p><p class="mt-1 text-xs capitalize text-gray-500">{{ account.role }} access</p></div>
          <RouterLink to="/users" class="text-sm font-semibold text-primary-300 hover:underline">Manage in Settings → Accounts</RouterLink>
        </div>
        <form v-else class="grid gap-4 sm:grid-cols-3" @submit.prevent="createAccount">
          <p class="text-sm text-gray-400 sm:col-span-3">No login yet. Create one so this employee can file leave and see their payslips.</p>
          <label class="text-xs font-medium text-gray-400">Email<input v-model="newAccount.email" type="email" required class="form-control mt-1.5"></label>
          <label class="text-xs font-medium text-gray-400">Temporary password<input v-model="newAccount.password" type="text" required minlength="8" class="form-control mt-1.5"></label>
          <label class="text-xs font-medium text-gray-400">Access<select v-model="newAccount.role" class="form-control mt-1.5"><option value="employee">Employee</option><option value="hr">HR</option><option value="admin">Admin</option></select></label>
          <div class="flex justify-end sm:col-span-3"><AppButton type="submit" :loading="creatingAccount">Create login</AppButton></div>
        </form>
      </section>

      <section id="section-history" class="scroll-mt-16 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 class="mb-4 font-semibold text-gray-100">History</h2>
        <ol v-if="activities.length" class="space-y-3">
          <li v-for="item in activities" :key="item.id" class="flex gap-3 text-sm"><span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" /><span class="min-w-0"><span class="text-gray-200">{{ auditAction(item) }}</span><span class="block text-xs text-gray-500">{{ stamp(item.created_at) }} · {{ auditActor(item) }}</span><span v-for="change in auditChanges(item)" :key="change" class="block text-xs text-gray-400">{{ change }}</span></span></li>
        </ol>
        <p v-else class="text-sm text-gray-400">No recorded changes yet.</p>
        <RouterLink :to="{ path: '/audit-logs' }" class="mt-3 inline-block text-xs font-semibold text-primary-300 hover:underline">Full audit log →</RouterLink>
      </section>
    </template>

    <AppModal :show="Boolean(awolForm)" title="Record AWOL absence" @close="awolForm = null">
      <div v-if="awolForm" class="grid gap-4 sm:grid-cols-2">
        <label class="text-xs font-medium text-gray-400">From<input v-model="awolForm.start_date" type="date" class="form-control mt-1.5"></label>
        <label class="text-xs font-medium text-gray-400">To<input v-model="awolForm.end_date" type="date" :min="awolForm.start_date" class="form-control mt-1.5"></label>
        <label class="text-xs font-medium text-gray-400 sm:col-span-2">Reason<textarea v-model="awolForm.reason" rows="3" class="form-control mt-1.5" /></label>
      </div>
      <template #footer><AppButton variant="secondary" @click="awolForm = null">Cancel</AppButton><AppButton :loading="savingAwol" @click="saveAwol">Record AWOL</AppButton></template>
    </AppModal>
    <AppConfirmModal :show="confirmDelete" title="Delete employee?" :message="`${fullName} and their employee record will be removed. This cannot be undone.`" confirm-text="Delete employee" :loading="deleting" @close="confirmDelete = false" @confirm="removeEmployee" />
  </div>
</template>
