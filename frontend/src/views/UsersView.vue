<script setup>
import { computed, ref, onMounted } from 'vue'
import { getUsers, getEmployees, createUser as createUserApi, deleteUser as deleteUserApi } from '@/services/backendService'
import { useToastStore } from '@/stores/toastStore'
import AppTable from '@/components/ui/AppTable.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppConfirmModal from '@/components/ui/AppConfirmModal.vue'
import AppInput from '@/components/ui/AppInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { usePersistentFilters } from '@/composables/usePersistentFilters'
import PageHeader from '@/components/ui/PageHeader.vue'
import UserAccountDrawer from '@/components/employees/UserAccountDrawer.vue'
import { getRolePresentation } from '@/utils/rolePresentation'

const list = ref([])
const employees = ref([])
const loading = ref(false)
const toast = useToastStore()
const showModal = ref(false)
const showDeleteModal = ref(false)
const deletingUser = ref(null)
const deletingUserLoading = ref(false)
const submitting = ref(false)
const selectedUser = ref(null)
const drawerOpen = ref(false)
const searchQuery = ref('')
const roleFilter = ref('all')
const employeeQuery = ref('')
usePersistentFilters('users', { searchQuery, roleFilter })
const form = ref({
  email: '',
  password: '',
  role: 'employee',
  employee_id: '',
})

const filteredUsers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return list.value.filter((user) => {
    if (roleFilter.value !== 'all' && user.role !== roleFilter.value) return false
    if (!query) return true
    const employeeName = [user.first_name, user.last_name].filter(Boolean).join(' ')
    return [user.email, user.role, user.employee_code, employeeName]
      .some((value) => String(value || '').toLowerCase().includes(query))
  })
})

const availableEmployees = computed(() => {
  const linkedIds = new Set(list.value.map((user) => Number(user.employee_id)).filter(Boolean))
  const query = employeeQuery.value.trim().toLowerCase()
  return employees.value.filter((employee) => {
    if (linkedIds.has(Number(employee.id))) return false
    if (!query) return true
    const name = [employee.first_name, employee.last_name].filter(Boolean).join(' ')
    return [employee.employee_code, name]
      .some((value) => String(value || '').toLowerCase().includes(query))
  })
})
const selectedEmployee = computed(() => employees.value.find((employee) => Number(employee.id) === Number(selectedUser.value?.employee_id)) || null)

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
  employeeQuery.value = ''
  showModal.value = true
}

function openDetails(user) {
  selectedUser.value = user
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  selectedUser.value = null
}

function resetFilters() {
  searchQuery.value = ''
  roleFilter.value = 'all'
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

function requestRemoveUser(row) {
  closeDrawer()
  deletingUser.value = row
  showDeleteModal.value = true
}

async function removeUser() {
  if (!deletingUser.value) return
  deletingUserLoading.value = true
  try {
    await deleteUserApi(deletingUser.value.id)
    toast.success('User deleted.')
    load()
    showDeleteModal.value = false
    deletingUser.value = null
  } catch (err) {
    toast.error(err.response?.data?.message || err.message || 'Failed to delete user.')
  } finally {
    deletingUserLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="User Accounts" description="Manage access, roles, and employee account connections." eyebrow="People">
      <template #actions><AppButton @click="openAdd">Add user</AppButton></template>
    </PageHeader>
    <section class="filter-panel" aria-label="User filters">
      <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-end">
        <AppInput
          v-model="searchQuery"
          type="search"
          label="Search users"
          placeholder="Search email, employee name, or code"
        />
        <div>
          <label for="user-role-filter" class="mb-1 block text-sm font-medium text-gray-200">Role</label>
          <select id="user-role-filter" v-model="roleFilter" class="form-control">
            <option value="all">All roles</option>
            <option value="employee">Employee</option>
            <option value="hr">HR</option>
            <option value="admin">Admin</option>
            <option value="ceo">CEO</option>
          </select>
        </div>
        <AppButton variant="secondary" :disabled="!searchQuery && roleFilter === 'all'" @click="resetFilters">Clear</AppButton>
      </div>
      <p class="mt-3 text-xs text-gray-400">
        Showing <span class="font-semibold text-gray-200">{{ filteredUsers.length }}</span> of {{ list.length }} users
      </p>
    </section>
    <div class="space-y-3 md:hidden">
      <div v-if="loading" class="space-y-3"><div v-for="item in 3" :key="item" class="h-36 animate-pulse rounded-xl bg-gray-800" /></div>
      <EmptyState v-else-if="!filteredUsers.length" compact :title="list.length ? 'No matching users' : 'No users yet'" :description="list.length ? 'Try another name, email, code, or role.' : 'Add a user to give an employee system access.'" />
      <article v-for="row in filteredUsers" v-else :key="row.id" class="rounded-xl border border-gray-800 bg-gray-900 p-4" @click="openDetails(row)">
        <div class="flex items-start gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-semibold uppercase" :class="getRolePresentation(row.role).avatarClass">{{ row.email?.[0] }}</span><div class="min-w-0 flex-1"><p class="break-all text-sm font-semibold text-gray-100">{{ row.email }}</p><p class="mt-1 text-xs text-gray-500">Account #{{ row.id }}</p></div><StatusBadge class="shrink-0" :status="row.role" :variant="getRolePresentation(row.role).variant">{{ getRolePresentation(row.role).label }}</StatusBadge></div>
        <div class="mt-4 rounded-lg border border-gray-800 bg-gray-950/45 p-3"><p class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Linked employee</p><template v-if="row.employee_id"><p class="mt-1.5 text-sm font-medium text-gray-200">{{ [row.first_name, row.last_name].filter(Boolean).join(' ') || '-' }}</p><p class="mt-1 text-xs text-gray-500">{{ row.employee_code || '-' }} · {{ row.department || 'Unassigned' }}</p></template><p v-else class="mt-1.5 text-sm text-gray-500">No employee linked</p></div>
        <AppButton class="mt-3 w-full" variant="secondary" size="sm" @click.stop="openDetails(row)">View details</AppButton>
      </article>
    </div>
    <AppTable :loading="loading" class="hidden md:block">
      <thead class="bg-gray-950">
        <tr>
          <th class="table-heading">Account</th>
          <th class="table-heading">Role</th>
          <th class="table-heading">Linked employee</th>
          <th class="table-heading text-right">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800 bg-gray-900">
        <tr v-for="row in filteredUsers" :key="row.id" class="group cursor-pointer transition-colors hover:bg-gray-950" :class="Number(selectedUser?.id) === Number(row.id) && drawerOpen ? 'bg-primary-950/15 ring-1 ring-inset ring-primary-600/35' : ''" @click="openDetails(row)">
          <td class="px-4 py-3.5"><div class="flex items-center gap-3"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold uppercase transition-transform group-hover:scale-105" :class="getRolePresentation(row.role).avatarClass">{{ row.email?.[0] }}</span><span class="min-w-0"><span class="block truncate text-sm font-semibold text-gray-100">{{ row.email }}</span><span class="mt-0.5 block text-xs text-gray-500">Account #{{ row.id }}</span></span></div></td>
          <td class="px-4 py-3">
            <StatusBadge :status="row.role" :variant="getRolePresentation(row.role).variant">{{ getRolePresentation(row.role).label }}</StatusBadge>
          </td>
          <td class="px-4 py-3 text-sm text-gray-300">
            <span v-if="row.employee_id" class="flex items-start gap-2"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"></span><span><span class="block font-medium text-gray-200">{{ [row.first_name, row.last_name].filter(Boolean).join(' ') || '-' }}</span><span class="mt-0.5 block text-xs text-gray-500">{{ row.employee_code || '-' }} · {{ row.department || 'Unassigned' }}</span></span></span>
            <span v-else>-</span>
          </td>
          <td class="px-4 py-3 text-right" @click.stop>
            <AppButton variant="ghost" size="sm" @click="openDetails(row)">View details</AppButton>
          </td>
        </tr>
        <tr v-if="!filteredUsers.length && !loading">
          <td colspan="4" class="p-4">
            <EmptyState
              compact
              :title="list.length ? 'No matching users' : 'No users yet'"
              :description="list.length ? 'Try another employee name, email, code, or role.' : 'Add a user to give an employee system access.'"
            />
          </td>
        </tr>
      </tbody>
    </AppTable>

    <UserAccountDrawer :show="drawerOpen" :user="selectedUser" :employee="selectedEmployee" @close="closeDrawer" @delete="requestRemoveUser(selectedUser)" />

    <AppModal :show="showModal" title="Add user" @close="showModal = false">
      <form class="space-y-4" @submit.prevent="createUser">
        <AppInput v-model="form.email" type="email" label="Email" required placeholder="user@company.com" />
        <AppInput v-model="form.password" type="password" label="Password" required placeholder="******" />
        <div>
          <label for="new-user-role" class="mb-1 block text-sm font-medium text-gray-200">Role</label>
          <select
            id="new-user-role"
            v-model="form.role"
            class="form-control"
          >
            <option value="employee" class="bg-gray-900 text-primary-200">Employee</option>
            <option value="hr" class="bg-gray-900 text-primary-200">HR</option>
            <option value="admin" class="bg-gray-900 text-primary-200">Admin</option>
          </select>
        </div>
        <div>
          <p class="mb-2 text-sm font-medium text-gray-200">Link to employee *</p>
          <AppInput
            v-model="employeeQuery"
            type="search"
            label="Search available employees"
            placeholder="Search employee name or code"
          />
          <label for="new-user-employee" class="sr-only">Select employee</label>
          <select
            id="new-user-employee"
            v-model="form.employee_id"
            required
            class="form-control mt-3"
          >
            <option value="">{{ availableEmployees.length ? 'Select employee' : 'No available employees' }}</option>
            <option v-for="e in availableEmployees" :key="e.id" :value="e.id" class="bg-gray-900 text-primary-200">
              {{ e.employee_code }} - {{ e.first_name }} {{ e.last_name }}
            </option>
          </select>
          <p class="mt-1 text-xs text-gray-400">Employees who already have an account are excluded.</p>
        </div>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showModal = false">Cancel</AppButton>
        <AppButton :loading="submitting" @click="createUser">Create user</AppButton>
      </template>
    </AppModal>

    <AppConfirmModal
      :show="showDeleteModal"
      title="Delete user"
      :message="`Delete user ${deletingUser?.email || ''}? This cannot be undone.`"
      confirm-text="Delete"
      :loading="deletingUserLoading"
      @close="
        () => {
          showDeleteModal = false
          deletingUser = null
        }
      "
      @confirm="removeUser"
    />
  </div>
</template>

