import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend target: Docker service name when running inside Docker,
// fallback to server IP when running on dev machine
// Inside Docker: updive-nsm-app:80 | Local dev: local backend on port 8091
const IN_DOCKER = process.env.IN_DOCKER === 'true';
const BACKEND = process.env.VITE_BACKEND_URL || (IN_DOCKER ? 'http://updive-nsm-app:80' : 'http://localhost:8091');

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5175,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        headers: { 'X-Auth-Token': 'd4014ad7774807ecf049f3d4943c410afeb42186ef555af08a4f4b0d5518957b' },
      },
      '/graph': {
        target: BACKEND,
        changeOrigin: true,
        headers: { 'X-Auth-Token': 'd4014ad7774807ecf049f3d4943c410afeb42186ef555af08a4f4b0d5518957b' },
      },
      '/graph.php': {
        target: BACKEND,
        changeOrigin: true,
      },
      '/images': {
        target: BACKEND,
        changeOrigin: true,
      }
    }
  }
})
