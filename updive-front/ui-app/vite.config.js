import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5175,          // 5173,5174 band bo'lishi mumkin → 5175 ishlatiladi
    proxy: {
      '/api': {
        target: 'http://updive-nsm-app:80',   // Docker ichida servis nomi orqali
        changeOrigin: true,
        headers: { 'X-Auth-Token': 'd4014ad7774807ecf049f3d4943c410afeb42186ef555af08a4f4b0d5518957b' },
      },
      '/graph': {
        target: 'http://updive-nsm-app:80',
        changeOrigin: true,
        headers: { 'X-Auth-Token': 'd4014ad7774807ecf049f3d4943c410afeb42186ef555af08a4f4b0d5518957b' },
      },
      '/graph.php': {
        target: 'http://updive-nsm-app:80',
        changeOrigin: true,
      },
      '/images': {
        target: 'http://updive-nsm-app:80',
        changeOrigin: true,
      }
    }
  }
})
