import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-spotify-auth': {
        target: 'https://accounts.spotify.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-spotify-auth/, '/api/token')
      },
      '/api-spotify': {
        target: 'https://api.spotify.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-spotify/, '')
      }
    }
  },
  resolve: {
    alias: {
      // Forzamos el uso de la versión compilada para evitar errores de dependencias de Node/Native
      'jsmediatags': 'jsmediatags/dist/jsmediatags.min.js'
    }
  }
})
