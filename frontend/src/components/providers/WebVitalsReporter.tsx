'use client'

import { useReportWebVitals } from 'next/web-vitals'

interface WebVitalSample {
  id: string
  name: string
  value: number
  rating?: string
  delta: number
  navigationType?: string
}

interface WebVitalsStore {
  latest: Record<string, WebVitalSample>
  samples: WebVitalSample[]
}

type WindowWithWebVitals = Window & {
  __construction_os_WEB_VITALS__?: WebVitalsStore
}

const MAX_SAMPLES = 50

/**
 * Keep a bounded, automation-readable Web Vitals history without network calls.
 * Browser benchmarks can read `window.__construction_os_WEB_VITALS__`.
 */
function recordWebVital(metric: WebVitalSample) {
  const target = window as WindowWithWebVitals
  const store = target.__construction_os_WEB_VITALS__ ?? {
    latest: {},
    samples: [],
  }

  store.latest[metric.name] = metric
  store.samples.push(metric)
  if (store.samples.length > MAX_SAMPLES) {
    store.samples.splice(0, store.samples.length - MAX_SAMPLES)
  }

  target.__construction_os_WEB_VITALS__ = store

  if (process.env.NODE_ENV === 'development') {
    console.debug('[Web Vitals]', metric)
  }
}

export function WebVitalsReporter() {
  useReportWebVitals(recordWebVital)
  return null
}
