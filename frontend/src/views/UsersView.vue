<script setup>
import { ref, onMounted } from 'vue'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getUsers, getEmployees } from '@/services/firestore'
import app from '@/firebase'
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
  submitting.value = true
  try {
    const functions = getFunctions(app)
    const createUserFn = httpsCallable(functions, 'createUser')
    await createUserFn({
      email: form.value.email,
      password: form.value.password,
      role: form.value.role,
      employeeId: form.value.employee_id || null,
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">User Management</h1>
        <p class="mt-1 text-sm text-gray-500">Manage system users (Admin).</p>
      </div>
      <AppButton @click="openAdd">Add user</AppButton>
    </div>
    <AppTable :loading="loading">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Email</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Role</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">Employee ID</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200 bg-white">
        <tr v-for="row in list" :key="row.id" class="hover:bg-gray-50">
          <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ row.email }}</td>
          <td class="px-4 py-3">
            <StatusBadge :status="row.role" />
          </td>
          <td class="px-4 py-3 text-sm text-gray-600">{{ row.employeeId ?? '—' }}</td>
        </tr>
        <tr v-if="!list.length && !loading">
          <td colspan="3" class="px-4 py-8 text-center text-sm text-gray-500">No users.</td>
        </tr>
      </tbody>
    </AppTable>

    <AppModal :show="showModal" title="Add user" @close="showModal = false">
      <form class="space-y-4" @submit.prevent="createUser">
        <AppInput v-model="form.email" type="email" label="Email" required placeholder="user@company.com" />
        <AppInput v-model="form.password" type="password" label="Password" required placeholder="••••••" />
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Role</label>
          <select
            v-model="form.role"
            class="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
          >
            <option value="employee">Employee</option>
            <option value="hr">HR</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Link to employee (optional)</label>
          <select
            v-model="form.employee_id"
            class="block w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
          >
            <option value="">— No employee —</option>
            <option v-for="e in employees" :key="e.id" :value="e.id">
              {{ e.employee_code }} – {{ e.first_name }} {{ e.last_name }}
            </option>
          </select>
          <p class="mt-1 text-xs text-gray-500">Link this account to an employee so they can use Leave requests.</p>
        </div>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showModal = false">Cancel</AppButton>
        <AppButton :loading="submitting" @click="createUser">Create user</AppButton>
      </template>
    </AppModal>
  </div>
</template>
