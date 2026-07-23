<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useEmployeeStore } from '@/stores/employeeStore'
import { useToastStore } from '@/stores/toastStore'
import { getAuditLogs, getEmployee, getUsers, setEmployeeAwol as setEmployeeAwolApi } from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppTable from '@/components/ui/AppTable.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppConfirmModal from '@/components/ui/AppConfirmModal.vue'
import AppInput from '@/components/ui/AppInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { usePersistentFilters } from '@/composables/usePersistentFilters'
import EmployeeDetailsDrawer from '@/components/employees/EmployeeDetailsDrawer.vue'
import { getDepartmentPresentation, getShiftPresentation } from '@/utils/employeePresentation'

const employeeStore = useEmployeeStore()
const toast = useToastStore()
const router = useRouter()
const showModal = ref(false)
const showDeleteModal = ref(false)
const deletingEmployee = ref(null)
const deletingEmployeeLoading = ref(false)
const editingId = ref(null)
const openActionMenuId = ref(null)
const awolModal = ref(false)
const awolSubmitting = ref(false)
const awolTarget = ref(null)
const awolForm = ref({ start_date: '', end_date: '', reason: '' })
const departmentFilter = ref('all')
const statusFilter = ref('all')
const shiftFilter = ref('all')
const searchQuery = ref('')
const page = ref(1)
const pageSize = ref(10)
const selectedEmployee = ref(null)
const drawerOpen = ref(false)
const drawerLoading = ref(false)
const users = ref([])
const employeeActivities = ref([])
usePersistentFilters('employees', { departmentFilter, statusFilter, shiftFilter, searchQuery, pageSize })
const departmentOptions = ['Marketing', 'IT', 'Sales', 'Admin']
const shiftOptions = ['day', 'night']
const form = ref({
  employee_code: '',
  first_name: '',
  last_name: '',
  department: '',
  position: '',
  shift: 'day',
  date_hired: '',
  status: 'active',
})

onMounted(async () => {
  await Promise.all([employeeStore.fetchList(), getUsers().then((rows) => { users.value = rows }).catch(() => {})])
  document.addEventListener('click', closeActionMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeActionMenu)
})

const filteredEmployees = computed(() => {
  let rows = employeeStore.list
  if (departmentFilter.value !== 'all') {
    rows = rows.filter((e) => (e.department || '') === departmentFilter.value)
  }
  if (statusFilter.value !== 'all') {
    rows = rows.filter((e) => (e.status || '') === statusFilter.value)
  }
  if (shiftFilter.value !== 'all') {
    rows = rows.filter((e) => (e.shift || 'day') === shiftFilter.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter((e) => {
      const name = `${e.first_name || ''} ${e.last_name || ''}`.trim().toLowerCase()
      const code = String(e.employee_code || '').toLowerCase()
      const dept = String(e.department || '').toLowerCase()
      return name.includes(q) || code.includes(q) || dept.includes(q)
    })
  }
  return rows
})
const totalEmployees = computed(() => employeeStore.list.length)
const visibleEmployees = computed(() => filteredEmployees.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(visibleEmployees.value / pageSize.value)))
const pagedEmployees = computed(() => filteredEmployees.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const selectedUser = computed(() => users.value.find((user) => Number(user.employee_id) === Number(selectedEmployee.value?.id)) || null)
watch([departmentFilter, statusFilter, shiftFilter, searchQuery, pageSize], () => { page.value = 1 })
watch(totalPages, (total) => { if (page.value > total) page.value = total })

function monthsEmployed(dateValue) {
  if (!dateValue) return 0
  const hired = new Date(dateValue)
  if (Number.isNaN(hired.getTime())) return 0
  const today = new Date()
  let months = (today.getFullYear() - hired.getFullYear()) * 12 + (today.getMonth() - hired.getMonth())
  if (today.getDate() < hired.getDate()) months -= 1
  return Math.max(0, months)
}

function creditsByTenure(dateValue) {
  const months = monthsEmployed(dateValue)
  if (months >= 12) return 15
  if (months >= 6) return 3
  return 0
}

const computedFormCredits = computed(() => creditsByTenure(form.value.date_hired))

function openCreate() {
  openActionMenuId.value = null
  editingId.value = null
  form.value = {
    employee_code: '',
    first_name: '',
    last_name: '',
    department: '',
    position: '',
    shift: 'day',
    date_hired: '',
    status: 'active',
  }
  showModal.value = true
}

async function openEdit(row) {
  openActionMenuId.value = null
  editingId.value = row.id
  let source = row
  try {
    source = await employeeStore.fetchOne(row.id)
  } catch (err) {
    toast.warning('Using cached employee data. Refresh if leave credits look outdated.')
  }
  form.value = {
    employee_code: source.employee_code,
    first_name: source.first_name,
    last_name: source.last_name,
    department: source.department,
    position: source.position,
    shift: source.shift || 'day',
    date_hired: source.date_hired?.slice(0, 10) ?? '',
    status: source.status,
  }
  showModal.value = true
}

async function openDetails(row) {
  openActionMenuId.value = null
  selectedEmployee.value = row
  employeeActivities.value = []
  drawerOpen.value = true
  drawerLoading.value = true
  const [employee, logs] = await Promise.all([
    getEmployee(row.id).catch(() => row),
    getAuditLogs({ limit: 50 }).catch(() => []),
  ])
  selectedEmployee.value = employee
  employeeActivities.value = logs.filter((item) => item.target_table === 'employees' && Number(item.target_id) === Number(row.id))
  drawerLoading.value = false
}

function closeDrawer() {
  drawerOpen.value = false
  selectedEmployee.value = null
  employeeActivities.value = []
}

function editSelected() {
  const employee = selectedEmployee.value
  closeDrawer()
  if (employee) openEdit(employee)
}

function awolSelected() {
  const employee = selectedEmployee.value
  closeDrawer()
  if (employee) openAwol(employee)
}

async function save() {
  try {
    if (editingId.value) {
      await employeeStore.update(editingId.value, form.value)
      toast.success('Employee updated.')
    } else {
      await employeeStore.create(form.value)
      toast.success('Employee created.')
    }
    showModal.value = false
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to save.')
  }
}

function requestRemove(row) {
  openActionMenuId.value = null
  deletingEmployee.value = row
  showDeleteModal.value = true
}

async function confirmRemove() {
  if (!deletingEmployee.value) return
  deletingEmployeeLoading.value = true
  try {
    await employeeStore.remove(deletingEmployee.value.id)
    if (Number(selectedEmployee.value?.id) === Number(deletingEmployee.value.id)) closeDrawer()
    toast.success('Employee deleted.')
    showDeleteModal.value = false
    deletingEmployee.value = null
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to delete.')
  } finally {
    deletingEmployeeLoading.value = false
  }
}

function openAwol(row) {
  openActionMenuId.value = null
  awolTarget.value = row
  awolForm.value = { start_date: '', end_date: '', reason: '' }
  awolModal.value = true
}

function toggleActionMenu(rowId) {
  openActionMenuId.value = openActionMenuId.value === rowId ? null : rowId
}

function closeActionMenu() {
  openActionMenuId.value = null
}

function closeAwol() {
  awolModal.value = false
  awolTarget.value = null
}

async function submitAwol() {
  if (!awolTarget.value) return
  if (!awolForm.value.start_date || !awolForm.value.end_date) {
    toast.warning('Start date and end date are required.')
    return
  }
  awolSubmitting.value = true
  try {
    await setEmployeeAwolApi(awolTarget.value.id, awolForm.value)
    await employeeStore.fetchList()
    toast.success('Employee marked as AWOL.')
    closeAwol()
  } catch (err) {
    toast.error(err.response?.data?.message || err.message || 'Failed to set AWOL.')
  } finally {
    awolSubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Employee Management" description="Search your workforce, update employee records, and manage employment status." eyebrow="Management">
      <template #actions><AppButton @click="openCreate">Add employee</AppButton></template>
    </PageHeader>
    <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div class="grid gap-3 xl:grid-cols-[minmax(220px,1.6fr)_repeat(4,minmax(100px,1fr))_auto] xl:items-end">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-400">Search</label>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Name, code, department"
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-400">Rows</label>
          <select v-model.number="pageSize" class="form-control"><option :value="10">10</option><option :value="20">20</option><option :value="50">50</option></select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-400">Department</label>
          <select
            v-model="departmentFilter"
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="all">All</option>
            <option v-for="dept in departmentOptions" :key="dept" :value="dept">{{ dept }}</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-400">Shift</label>
          <select
            v-model="shiftFilter"
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="all">All</option>
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-400">Status</label>
          <select
            v-model="statusFilter"
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="resigned">Resigned</option>
            <option value="on_leave">On leave</option>
          </select>
        </div>
        <AppButton
          variant="secondary"
          class="xl:mb-0"
          @click="
            () => {
              departmentFilter = 'all'
              shiftFilter = 'all'
              statusFilter = 'all'
              searchQuery = ''
            }
          "
        >
          Reset
        </AppButton>
      </div>
      <p class="mt-3 text-xs text-gray-400">Showing {{ visibleEmployees ? (page - 1) * pageSize + 1 : 0 }}–{{ Math.min(page * pageSize, visibleEmployees) }} of {{ visibleEmployees }} matching employees ({{ totalEmployees }} total)</p>
    </div>
    <div class="space-y-3 md:hidden">
      <div v-if="employeeStore.loading" class="space-y-3"><div v-for="item in 3" :key="item" class="h-40 animate-pulse rounded-xl bg-gray-800" /></div>
      <EmptyState v-else-if="!pagedEmployees.length" compact title="No employees found" description="Try clearing the filters or add an employee." />
      <article v-for="row in pagedEmployees" v-else :key="row.id" class="rounded-xl border border-gray-800 bg-gray-900 p-4" @click="openDetails(row)">
        <div class="flex items-start justify-between gap-3"><div class="min-w-0"><h3 class="truncate font-semibold text-gray-100">{{ row.first_name }} {{ row.last_name }}</h3><p class="mt-1 text-xs text-primary-300">Employee {{ row.employee_code }}</p></div><StatusBadge :status="row.status" /></div>
        <dl class="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt class="text-gray-500">Department</dt><dd class="mt-1"><StatusBadge :status="row.department" :variant="getDepartmentPresentation(row.department).variant">{{ getDepartmentPresentation(row.department).label }}</StatusBadge></dd></div><div><dt class="text-gray-500">Position</dt><dd class="mt-1 text-gray-300">{{ row.position || '-' }}</dd></div><div><dt class="text-gray-500">Shift</dt><dd class="mt-1"><StatusBadge :status="row.shift" :variant="getShiftPresentation(row.shift).variant">{{ getShiftPresentation(row.shift).label }}</StatusBadge></dd></div><div><dt class="text-gray-500">Leave credits</dt><dd class="mt-1 text-gray-300">{{ Number(row.leave_credits || 0).toFixed(2) }}</dd></div></dl>
        <div class="mt-4 flex flex-wrap gap-2" @click.stop><AppButton variant="secondary" size="sm" @click="openDetails(row)">View details</AppButton><AppButton variant="secondary" size="sm" @click="openEdit(row)">Edit</AppButton></div>
      </article>
    </div>
    <AppTable :loading="employeeStore.loading" class="hidden md:block">
      <thead class="bg-gray-950">
        <tr>
          <th class="table-heading">Employee</th>
          <th class="table-heading">Department</th>
          <th class="table-heading">Shift</th>
          <th class="table-heading">Employment status</th>
          <th class="table-heading text-right">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr
          v-for="row in pagedEmployees"
          :key="row.id"
          class="cursor-pointer transition hover:bg-gray-950"
          :class="Number(selectedEmployee?.id) === Number(row.id) && drawerOpen ? 'bg-primary-950/15 ring-1 ring-inset ring-primary-600/35' : ''"
          @click="openDetails(row)"
        >
          <td class="px-4 py-3.5"><div class="flex items-center gap-3"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-950 text-xs font-semibold text-gray-300">{{ row.first_name?.[0] }}{{ row.last_name?.[0] }}</span><span class="min-w-0"><span class="block truncate text-sm font-semibold text-gray-100">{{ row.first_name }} {{ row.last_name }}</span><span class="mt-0.5 block truncate text-xs text-gray-500">{{ row.employee_code }} · {{ row.position || 'Position not set' }}</span></span></div></td>
          <td class="px-4 py-3"><StatusBadge :status="row.department" :variant="getDepartmentPresentation(row.department).variant">{{ getDepartmentPresentation(row.department).label }}</StatusBadge></td>
          <td class="px-4 py-3"><StatusBadge :status="row.shift" :variant="getShiftPresentation(row.shift).variant">{{ getShiftPresentation(row.shift).label }}</StatusBadge></td>
          <td class="px-4 py-3">
            <StatusBadge :status="row.status" />
          </td>
          <td class="px-4 py-3 text-right" @click.stop>
            <div class="relative inline-flex justify-end">
              <button
                type="button"
                class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-xl leading-none text-gray-200 transition hover:border-primary-500 hover:text-primary-200"
                aria-label="Open employee actions"
                @click.stop="toggleActionMenu(row.id)"
              >
                ⋮
              </button>
              <div
                v-if="openActionMenuId === row.id"
                class="absolute right-0 top-11 z-20 min-w-[10rem] rounded-xl border border-gray-700 bg-gray-900 p-2 shadow-2xl"
              >
                <button
                  type="button"
                  class="flex w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 transition hover:bg-gray-800"
                  @click.stop="openEdit(row)"
                >
                  Edit employee
                </button>
                <button
                  type="button"
                  class="flex w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 transition hover:bg-gray-800"
                  @click.stop="openAwol(row)"
                >
                  Set AWOL
                </button>
                <button
                  type="button"
                  class="flex w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
                  @click.stop="requestRemove(row)"
                >
                  Delete employee
                </button>
              </div>
            </div>
          </td>
        </tr>
        <tr v-if="!filteredEmployees.length && !employeeStore.loading">
          <td colspan="5" class="p-4"><EmptyState title="No employees found" description="Try clearing the filters or add the first employee record." /></td>
        </tr>
      </tbody>
    </AppTable>
    <div v-if="visibleEmployees > pageSize" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-400">
      <span>Page {{ page }} of {{ totalPages }}</span>
      <div class="flex gap-2"><AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="page -= 1">Previous</AppButton><AppButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="page += 1">Next</AppButton></div>
    </div>

    <EmployeeDetailsDrawer :show="drawerOpen" :employee="selectedEmployee" :user="selectedUser" :activities="employeeActivities" :loading="drawerLoading" @close="closeDrawer" @edit="editSelected" @awol="awolSelected" @manage-account="router.push('/users')" />

    <AppModal :show="showModal" :title="editingId ? 'Edit employee' : 'Add employee'" size="lg" @close="showModal = false">
      <form id="employee-form" class="grid gap-4 sm:grid-cols-2" @submit.prevent="save">
        <div class="sm:col-span-2 rounded-lg border border-gray-800 bg-gray-950/40 px-4 py-3"><p class="text-sm font-semibold text-gray-200">Employment profile</p><p class="mt-1 text-xs text-gray-500">Identity, assignment, and tenure information used throughout the workspace.</p></div>
        <AppInput v-model="form.employee_code" label="Employee code" placeholder="e.g. EMP-001" required />
        <AppInput v-model="form.first_name" label="First name" required />
        <AppInput v-model="form.last_name" label="Last name" required />
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Department</label>
          <select
            v-model="form.department"
            required
            class="form-control"
          >
            <option value="" class="bg-gray-900 text-primary-200">Select department</option>
            <option v-for="dept in departmentOptions" :key="dept" :value="dept" class="bg-gray-900 text-primary-200">
              {{ dept }}
            </option>
          </select>
        </div>
        <AppInput v-model="form.position" label="Position" required />
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Shift</label>
          <select
            v-model="form.shift"
            class="form-control"
          >
            <option v-for="shift in shiftOptions" :key="shift" :value="shift" class="bg-gray-900 text-primary-200">
              {{ shift.charAt(0).toUpperCase() + shift.slice(1) }}
            </option>
          </select>
        </div>
        <AppInput v-model="form.date_hired" type="date" label="Date hired" required />
        <div class="rounded-lg border border-gray-800 bg-gray-950/70 px-4 py-3">
          <p class="text-sm font-medium text-gray-200">Auto leave credits</p>
          <p class="mt-1 text-2xl font-bold text-primary-200">{{ computedFormCredits.toFixed(2) }}</p>
          <p class="mt-1 text-xs text-gray-400">Based on date hired: below 6 months = 0, 6-11 months = 3, 12+ months = 15.</p>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Status</label>
          <select
            v-model="form.status"
            class="form-control"
          >
            <option value="active" class="bg-gray-900 text-primary-200">Active</option>
            <option value="inactive" class="bg-gray-900 text-primary-200">Inactive</option>
            <option value="resigned" class="bg-gray-900 text-primary-200">Resigned</option>
          </select>
        </div>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showModal = false">Cancel</AppButton>
        <AppButton type="submit" form="employee-form">{{ editingId ? 'Update employee' : 'Create employee' }}</AppButton>
      </template>
    </AppModal>

    <AppModal :show="awolModal" title="Record AWOL absence" @close="closeAwol">
      <form id="awol-form" class="grid gap-4 sm:grid-cols-2" @submit.prevent="submitAwol">
        <p class="sm:col-span-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-sm leading-6 text-gray-300">
          Mark
          <span class="font-semibold text-primary-200">
            {{ awolTarget?.first_name }} {{ awolTarget?.last_name }}
          </span>
          as Absent Without Official Leave.
        </p>
        <AppInput v-model="awolForm.start_date" type="date" label="Start date" required />
        <AppInput v-model="awolForm.end_date" type="date" label="End date" required />
        <div class="sm:col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-200">Reason (optional)</label>
          <textarea
            v-model="awolForm.reason"
            rows="3"
            class="form-control resize-y"
            placeholder="AWOL details"
          />
        </div>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="closeAwol">Cancel</AppButton>
        <AppButton type="submit" form="awol-form" :loading="awolSubmitting">Record AWOL</AppButton>
      </template>
    </AppModal>

    <AppConfirmModal
      :show="showDeleteModal"
      title="Delete employee"
      :message="`Delete employee ${deletingEmployee?.first_name || ''} ${deletingEmployee?.last_name || ''}? This cannot be undone.`"
      confirm-text="Delete"
      :loading="deletingEmployeeLoading"
      @close="
        () => {
          showDeleteModal = false
          deletingEmployee = null
        }
      "
      @confirm="confirmRemove"
    />
  </div>
</template>


