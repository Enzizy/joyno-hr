# HR System Frontend

Vue 3 (Composition API, `<script setup>`) + Vite + Vue Router + Pinia + Axios + Tailwind CSS. Sprout-inspired internal HR admin UI.

## Tech stack

- **Vue 3** – Composition API, `<script setup>`
- **Vite** – Build and dev server
- **Vue Router** – Routing with auth and role guards
- **Pinia** – State (auth, employee, attendance, leave, payroll, toast)
- **Axios** – API client with JWT and 401/403 handling
- **Tailwind CSS** – Styling

## Setup

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`. API calls go to `/api` and are proxied to `http://localhost:3000` (see `vite.config.js`). Set `VITE_API_URL` in `.env` if the backend is elsewhere.

## Scripts

- `npm run dev` – Dev server
- `npm run build` – Production build
- `npm run preview` – Preview production build

## Folder structure

```
src/
  components/
    layout/     # AppSidebar, AppTopbar
    ui/         # AppButton, AppModal, AppTable, AppInput, AppDatePicker, StatusBadge, AppToast
  layouts/
    AppLayout.vue
  router/
    index.js    # Routes + auth/role guards
    navConfig.js
  services/
    api.js      # Axios instance + API modules
  stores/
    authStore.js
    employeeStore.js
    attendanceStore.js
    leaveStore.js
    payrollStore.js
    toastStore.js
  views/        # Page components
  App.vue
  main.js
  style.css
```

## Auth and roles

- **Login** – JWT stored in localStorage; token sent via `Authorization: Bearer` on all requests.
- **Guards** – `router.beforeEach`: unauthenticated → `/login`; `meta.roles` → redirect to Dashboard if role not allowed.
- **Sidebar** – Menu items filtered by `getNavForRole(role)` (admin, hr, employee).

## API integration

- **Base** – `src/services/api.js` exports `api` (Axios instance) and namespaced helpers: `authApi`, `employeesApi`, `attendanceApi`, `leaveApi`, `payrollApi`, `usersApi`, `auditApi`, `reportsApi`.
- **401** – Response interceptor clears auth and redirects to `/login`.
- **403** – Logged; optional redirect or message can be added.

## Best practices

- Use Pinia for shared state; avoid prop drilling.
- Use `useToastStore()` for success/error messages.
- Use `AppTable`, `AppButton`, `AppModal`, `StatusBadge`, `AppInput`, `AppDatePicker` for consistency.
- Keep views thin; move reusable logic to composables or stores.
- Lazy-load views with `() => import('@/views/...')` for code splitting.
