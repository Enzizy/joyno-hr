import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'

const app = createApp(App)
app.use(createPinia())
app.use(router)

const authStore = useAuthStore()
const themeStore = useThemeStore()
themeStore.initTheme()
authStore.initAuth().finally(() => {
  app.mount('#app')
})
