import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/authStore'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// Initialize Firebase Auth listener (must run after Pinia is installed)
const authStore = useAuthStore()
authStore.initAuthListener()

app.mount('#app')
