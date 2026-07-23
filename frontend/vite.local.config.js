import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const localPort = 5175
const remoteApi = 'https://joyno-hr.onrender.com'
const deployedFrontendOrigin = 'https://joyno-hr.pages.dev'

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_WORKSPACE_API': JSON.stringify('false'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: localPort,
    strictPort: true,
    proxy: {
      '/api': { target: remoteApi, changeOrigin: true, headers: { Origin: deployedFrontendOrigin } },
      '/health': { target: remoteApi, changeOrigin: true, headers: { Origin: deployedFrontendOrigin } },
    },
  },
})
