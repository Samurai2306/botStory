type MetricPayload = {
  metric: string
  value: number
  ts: number
  route: string
}

const PERF_STORAGE_FLAG = 'perf_monitoring_enabled'
const PERF_ENDPOINT = '/api/v1/client-metrics'

function canMonitor() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(PERF_STORAGE_FLAG) === '1'
}

function sendMetric(payload: MetricPayload) {
  try {
    const body = JSON.stringify(payload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(PERF_ENDPOINT, body)
      return
    }
    void fetch(PERF_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
  } catch {
    // Must never affect app runtime
  }
}

export function startPerfMonitoring() {
  if (!canMonitor() || typeof window === 'undefined') return

  const route = () => window.location.pathname

  if ('PerformanceObserver' in window) {
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          sendMetric({
            metric: 'longtask',
            value: Math.round(entry.duration),
            ts: Date.now(),
            route: route(),
          })
        }
      })
      longTaskObserver.observe({ entryTypes: ['longtask'] })
    } catch {
      // Unsupported browser / blocked entry type
    }

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1]
        if (!last) return
        sendMetric({
          metric: 'lcp',
          value: Math.round(last.startTime),
          ts: Date.now(),
          route: route(),
        })
      })
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] })
    } catch {
      // Unsupported browser / blocked entry type
    }
  }
}
