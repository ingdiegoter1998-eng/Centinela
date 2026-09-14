import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base: en GitHub Pages el sitio vive en /<repo>/, no en la raíz del dominio.
// Se puede sobrescribir con BASE_PATH si el repo cambia de nombre o se usa
// dominio propio (BASE_PATH=/ en ese caso).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/proyecto-centinela/',
  plugins: [react()],
})
