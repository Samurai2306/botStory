import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { startPerfMonitoring } from './utils/perfMonitor'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

startPerfMonitoring()

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // noop: app still works without SW
      })
    })
  } else {
    // In dev mode SW frequently causes stale caches and blank UI after refresh.
    // Keep dev runtime deterministic by removing existing registrations.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        reg.unregister().catch(() => {})
      })
    }).catch(() => {})
  }
}
