import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Forzamos el uso de la versión compilada para evitar errores de dependencias de Node/Native
      'jsmediatags': 'jsmediatags/dist/jsmediatags.min.js'
    }
  }
})
