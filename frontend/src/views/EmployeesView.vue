<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useEmployeeStore } from '@/stores/employeeStore'
import { useToastStore } from '@/stores/toastStore'
import { setEmployeeAwol as setEmployeeAwolApi } from '@/services/backendService'
import AppButton from '@/components/ui/AppButton.vue'
import AppTable from '@/components/ui/AppTable.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppConfirmModal from '@/components/ui/AppConfirmModal.vue'
import AppInput from '@/components/ui/AppInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const employeeStore = useEmployeeStore()
const toast = useToastStore()
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

onMounted(() => {
  employeeStore.fetchList()
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
    <div>
      <h1 class="text-2xl font-bold text-primary-200">Employee Management</h1>
      <p class="mt-1 text-sm text-gray-400">Create, edit, and manage employees.</p>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div class="grid gap-3 xl:grid-cols-[minmax(220px,1.6fr)_repeat(3,minmax(160px,1fr))_auto_auto] xl:items-end">
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
        <AppButton class="xl:mb-0" @click="openCreate">Add employee</AppButton>
      </div>
      <p class="mt-3 text-xs text-gray-400">Showing {{ visibleEmployees }} of {{ totalEmployees }} employees</p>
    </div>
    <AppTable :loading="employeeStore.loading">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Code</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Name</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Department</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Shift</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Leave Credits</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Position</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Status</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr
          v-for="row in filteredEmployees"
          :key="row.id"
          class="cursor-pointer transition hover:bg-gray-950"
          @click="openEdit(row)"
        >
          <td class="px-4 py-3 text-sm font-medium text-primary-200">{{ row.employee_code }}</td>
          <td class="px-4 py-3 text-sm text-primary-200">{{ row.first_name }} {{ row.last_name }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.department }}</td>
          <td class="px-4 py-3 text-sm text-gray-300 capitalize">{{ row.shift || 'day' }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ Number(row.leave_credits || 0).toFixed(2) }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.position }}</td>
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
          <td colspan="8" class="px-4 py-8 text-center text-sm text-gray-400">No employees yet.</td>
        </tr>
      </tbody>
    </AppTable>

    <AppModal :show="showModal" :title="editingId ? 'Edit employee' : 'Add employee'" @close="showModal = false">
      <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="save">
        <AppInput v-model="form.employee_code" label="Employee code" required />
        <AppInput v-model="form.first_name" label="First name" required />
        <AppInput v-model="form.last_name" label="Last name" required />
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Department</label>
          <select
            v-model="form.department"
            required
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
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
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
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
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="active" class="bg-gray-900 text-primary-200">Active</option>
            <option value="inactive" class="bg-gray-900 text-primary-200">Inactive</option>
            <option value="resigned" class="bg-gray-900 text-primary-200">Resigned</option>
          </select>
        </div>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showModal = false">Cancel</AppButton>
        <AppButton @click="save">{{ editingId ? 'Update' : 'Create' }}</AppButton>
      </template>
    </AppModal>

    <AppModal :show="awolModal" title="Set Employee AWOL" @close="closeAwol">
      <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="submitAwol">
        <p class="sm:col-span-2 text-sm text-gray-300">
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
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 placeholder:text-gray-500 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="AWOL details"
          />
        </div>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="closeAwol">Cancel</AppButton>
        <AppButton :loading="awolSubmitting" @click="submitAwol">Set AWOL</AppButton>
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


