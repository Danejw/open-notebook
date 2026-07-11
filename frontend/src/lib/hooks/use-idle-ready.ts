'use client'

import { useEffect, useState } from 'react'

/**
 * Returns true after the browser is idle (or a short timeout fallback).
 * Use to defer non-critical queries until after first paint.
 */
export function useIdleReady(delayMs = 1500): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: delayMs })
      return () => window.cancelIdleCallback(id)
    }
    const timer = setTimeout(() => setReady(true), Math.min(delayMs, 500))
    return () => clearTimeout(timer)
  }, [delayMs])

  return ready
}
