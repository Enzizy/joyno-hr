<script setup>
import { ref, onMounted } from 'vue'
import { getUsers, getEmployees, createUser as createUserApi, deleteUser as deleteUserApi } from '@/services/backendService'
import { useToastStore } from '@/stores/toastStore'
import AppTable from '@/components/ui/AppTable.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppInput from '@/components/ui/AppInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const list = ref([])
const employees = ref([])
const loading = ref(false)
const toast = useToastStore()
const showModal = ref(false)
const submitting = ref(false)
const form = ref({
  email: '',
  password: '',
  role: 'employee',
  employee_id: '',
})

onMounted(() => {
  load()
  loadEmployees()
})

async function load() {
  loading.value = true
  try {
    list.value = await getUsers()
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

async function loadEmployees() {
  try {
    employees.value = await getEmployees()
  } catch {
    employees.value = []
  }
}

function openAdd() {
  form.value = { email: '', password: '', role: 'employee', employee_id: '' }
  showModal.value = true
}

async function createUser() {
  if (!form.value.email || !form.value.password) {
    toast.warning('Email and password are required.')
    return
  }
  if (!form.value.employee_id) {
    toast.warning('Please link this account to an employee.')
    return
  }
  submitting.value = true
  try {
    await createUserApi({
      email: form.value.email,
      password: form.value.password,
      role: form.value.role,
      employee_id: Number(form.value.employee_id),
    })
    toast.success('User created.')
    showModal.value = false
    load()
  } catch (err) {
    toast.error(err.message || err.details?.message || 'Failed to create user.')
  } finally {
    submitting.value = false
  }
}

async function removeUser(row) {
  if (!confirm(`Delete user ${row.email}?`)) return
  try {
    await deleteUserApi(row.id)
    toast.success('User deleted.')
    load()
  } catch (err) {
    toast.error(err.response?.data?.message || err.message || 'Failed to delete user.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-primary-200">User Management</h1>
        <p class="mt-1 text-sm text-gray-400">Manage system users (Admin).</p>
      </div>
      <AppButton @click="openAdd">Add user</AppButton>
    </div>
    <AppTable :loading="loading">
      <thead class="bg-gray-950">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Email</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Role</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-primary-300">Employee ID</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-primary-300">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in list" :key="row.id" class="hover:bg-gray-950">
          <td class="px-4 py-3 text-sm font-medium text-primary-200">{{ row.email }}</td>
          <td class="px-4 py-3">
            <StatusBadge :status="row.role" />
          </td>
          <td class="px-4 py-3 text-sm text-gray-300">{{ row.employee_code ?? row.employee_id ?? '-' }}</td>
          <td class="px-4 py-3 text-right">
            <AppButton variant="danger" size="sm" @click="removeUser(row)">Delete</AppButton>
          </td>
        </tr>
        <tr v-if="!list.length && !loading">
          <td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">No users.</td>
        </tr>
      </tbody>
    </AppTable>

    <AppModal :show="showModal" title="Add user" @close="showModal = false">
      <form class="space-y-4" @submit.prevent="createUser">
        <AppInput v-model="form.email" type="email" label="Email" required placeholder="user@company.com" />
        <AppInput v-model="form.password" type="password" label="Password" required placeholder="******" />
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Role</label>
          <select
            v-model="form.role"
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="employee" class="bg-gray-900 text-primary-200">Employee</option>
            <option value="hr" class="bg-gray-900 text-primary-200">HR</option>
            <option value="admin" class="bg-gray-900 text-primary-200">Admin</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-200">Link to employee *</label>
          <select
            v-model="form.employee_id"
            required
            class="block w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-base text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="">Select employee</option>
            <option v-for="e in employees" :key="e.id" :value="e.id" class="bg-gray-900 text-primary-200">
              {{ e.employee_code }} - {{ e.first_name }} {{ e.last_name }}
            </option>
          </select>
          <p class="mt-1 text-xs text-gray-400">Required for role-based leave and task assignment.</p>
        </div>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showModal = false">Cancel</AppButton>
        <AppButton :loading="submitting" @click="createUser">Create user</AppButton>
      </template>
    </AppModal>
  </div>
</template>

