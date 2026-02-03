import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import AppLayout from '@/layouts/AppLayout.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/DashboardView.vue'),
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/ProfileView.vue'),
      },
      {
        path: 'leave-request',
        name: 'LeaveRequest',
        component: () => import('@/views/LeaveRequestView.vue'),
        meta: { roles: ['admin', 'hr', 'employee'] },
      },
      // HR
      {
        path: 'employees',
        name: 'Employees',
        component: () => import('@/views/EmployeesView.vue'),
        meta: { roles: ['admin', 'hr'] },
      },
      {
        path: 'leave-approvals',
        name: 'LeaveApprovals',
        component: () => import('@/views/LeaveApprovalsView.vue'),
        meta: { roles: ['admin', 'hr'] },
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('@/views/ReportsView.vue'),
        meta: { roles: ['admin', 'hr'] },
      },
      // Admin
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/UsersView.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'audit-logs',
        name: 'AuditLogs',
        component: () => import('@/views/AuditLogsView.vue'),
        meta: { roles: ['admin'] },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  await authStore.waitForAuth()

  if (to.meta.public) {
    if (authStore.isAuthenticated) {
      next({ name: 'Dashboard' })
    } else {
      next()
    }
    return
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  const allowedRoles = to.meta.roles
  if (allowedRoles && allowedRoles.length && !allowedRoles.includes(authStore.role)) {
    next({ name: 'Dashboard' })
    return
  }

  next()
})

export default router
