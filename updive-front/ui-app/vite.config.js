import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        headers: { 'X-Auth-Token': 'd4014ad7774807ecf049f3d4943c410afeb42186ef555af08a4f4b0d5518957b' },
      },
      '/graph': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        headers: { 'X-Auth-Token': 'd4014ad7774807ecf049f3d4943c410afeb42186ef555af08a4f4b0d5518957b' },
      }
    }
  }
})
