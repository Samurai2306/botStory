/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // С хоста (npm run dev) имя `backend` не резолвится — по умолчанию localhost.
      // В docker-compose при необходимости: VITE_PROXY_TARGET=http://backend:8000 npm run dev
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
