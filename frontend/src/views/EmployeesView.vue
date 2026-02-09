<script setup>
import { ref, onMounted } from 'vue'
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
const form = ref({
  employee_code: '',
  first_name: '',
  last_name: '',
  department: '',
  position: '',
  salary_type: 'monthly',
  salary_amount: '',
  date_hired: '',
  status: 'active',
})

onMounted(() => employeeStore.fetchList())

function openCreate() {
  editingId.value = null
  form.value = {
    employee_code: '',
    first_name: '',
    last_name: '',
    department: '',
    position: '',
    salary_type: 'monthly',
    salary_amount: '',
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
    salary_type: row.salary_type,
    salary_amount: row.salary_amount,
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-primary-200">Employee Management</h1>
        <p class="mt-1 text-sm text-gray-400">Create, edit, and manage employees.</p>
      </div>
      <AppButton @click="openCreate">Add employee</AppButton>
    </div>
    <AppTable :loading="employeeStore.loading">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Code</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Name</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Department</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Position</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Status</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in employeeStore.list" :key="row.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm font-medium text-primary-200">{{ row.employee_code }}</td>
          <td class="px-4 py-3 text-sm text-primary-200">{{ row.first_name }} {{ row.last_name }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.department }}</td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.position }}</td>
          <td class="px-4 py-3">
            <StatusBadge :status="row.status" />
          </td>
          <td class="px-4 py-3 text-right">
            <AppButton variant="ghost" size="sm" @click="openEdit(row)">Edit</AppButton>
            <AppButton variant="danger" size="sm" class="ml-1" @click="remove(row)">Delete</AppButton>
          </td>
        </tr>
        <tr v-if="!employeeStore.list.length && !employeeStore.loading">
          <td colspan="6" class="px-4 py-8 text-center text-sm text-gray-400">No employees yet.</td>
        </tr>
      </tbody>
    </AppTable>

    <AppModal :show="showModal" :title="editingId ? 'Edit employee' : 'Add employee'" @close="showModal = false">
      <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="save">
        <AppInput v-model="form.employee_code" label="Employee code" required />
        <AppInput v-model="form.first_name" label="First name" required />
        <AppInput v-model="form.last_name" label="Last name" required />
        <AppInput v-model="form.department" label="Department" required />
        <AppInput v-model="form.position" label="Position" required />
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Salary type</label>
          <select
            v-model="form.salary_type"
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="monthly" class="bg-gray-900 text-primary-200">Monthly</option>
            <option value="hourly" class="bg-gray-900 text-primary-200">Hourly</option>
          </select>
        </div>
        <AppInput v-model="form.salary_amount" type="number" label="Salary amount" required />
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
  </div>
</template>


