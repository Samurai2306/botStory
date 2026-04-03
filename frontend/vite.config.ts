/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          reactVendor: ['react', 'react-dom', 'react-router-dom', 'zustand'],
          motionVendor: ['framer-motion'],
          threeVendor: ['three', '@react-three/fiber', '@react-three/drei'],
          editorVendor: ['@uiw/react-codemirror', '@codemirror/state', '@codemirror/view', '@codemirror/lang-javascript'],
        },
      },
    },
  },
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
