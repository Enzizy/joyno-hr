<script setup>
import { ref, onMounted, computed } from 'vue'
import { useEmployeeStore } from '@/stores/employeeStore'
import { useToastStore } from '@/stores/toastStore'
import AppButton from '@/components/ui/AppButton.vue'
import AppTable from '@/components/ui/AppTable.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppInput from '@/components/ui/AppInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const employeeStore = useEmployeeStore()
const toast = useToastStore()
const showModal = ref(false)
const editingId = ref(null)
const grantModal = ref(false)
const grantTarget = ref(null)
const grantAmount = ref('')
const granting = ref(false)
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
  leave_credits: '0',
  date_hired: '',
  status: 'active',
})

onMounted(() => employeeStore.fetchList())

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

function openCreate() {
  editingId.value = null
  form.value = {
    employee_code: '',
    first_name: '',
    last_name: '',
    department: '',
    position: '',
    shift: 'day',
    leave_credits: '0',
    date_hired: '',
    status: 'active',
  }
  showModal.value = true
}

function openEdit(row) {
  editingId.value = row.id
  form.value = {
    employee_code: row.employee_code,
    first_name: row.first_name,
    last_name: row.last_name,
    department: row.department,
    position: row.position,
    shift: row.shift || 'day',
    leave_credits: row.leave_credits ?? 0,
    date_hired: row.date_hired?.slice(0, 10) ?? '',
    status: row.status,
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

async function remove(row) {
  if (!confirm(`Delete employee ${row.first_name} ${row.last_name}?`)) return
  try {
    await employeeStore.remove(row.id)
    toast.success('Employee deleted.')
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to delete.')
  }
}

function openGrantModal(row) {
  grantTarget.value = row
  grantAmount.value = ''
  grantModal.value = true
}

function closeGrantModal() {
  grantModal.value = false
  grantTarget.value = null
  grantAmount.value = ''
}

async function submitGrantCredits() {
  if (!grantTarget.value) return
  const amount = Number(grantAmount.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    toast.warning('Enter a valid amount greater than 0.')
    return
  }
  granting.value = true
  try {
    await employeeStore.grantCredits(grantTarget.value.id, amount)
    toast.success('Leave credits granted.')
    closeGrantModal()
  } catch (err) {
    toast.error(err.response?.data?.message || 'Failed to grant credits.')
  } finally {
    granting.value = false
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
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Leave credits</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Position</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Status</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in filteredEmployees" :key="row.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm font-medium text-primary-200">{{ row.employee_code }}</td>
          <td class="px-4 py-3 text-sm text-primary-200">{{ row.first_name }} {{ row.last_name }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.department }}</td>
          <td class="px-4 py-3 text-sm text-gray-300 capitalize">{{ row.shift || 'day' }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ Number(row.leave_credits || 0).toFixed(2) }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.position }}</td>
          <td class="px-4 py-3">
            <StatusBadge :status="row.status" />
          </td>
          <td class="px-4 py-3 text-right">
            <AppButton variant="secondary" size="sm" @click="openGrantModal(row)">Grant</AppButton>
            <AppButton variant="ghost" size="sm" class="ml-1" @click="openEdit(row)">Edit</AppButton>
            <AppButton variant="danger" size="sm" class="ml-1" @click="remove(row)">Delete</AppButton>
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
        <AppInput v-model="form.leave_credits" type="number" label="Leave credits" />
        <AppInput v-model="form.date_hired" type="date" label="Date hired" required />
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

    <AppModal :show="grantModal" title="Grant leave credits" @close="closeGrantModal">
      <div class="space-y-4">
        <p class="text-sm text-gray-300">
          Add credits to
          <span class="font-semibold text-primary-200">
            {{ grantTarget?.first_name }} {{ grantTarget?.last_name }}
          </span>
          .
        </p>
        <AppInput
          v-model="grantAmount"
          type="number"
          label="Credits to add"
          placeholder="e.g. 2"
          required
        />
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="closeGrantModal">Cancel</AppButton>
        <AppButton :loading="granting" @click="submitGrantCredits">Grant credits</AppButton>
      </template>
    </AppModal>
  </div>
</template>


