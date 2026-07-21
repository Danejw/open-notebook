import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearBodyPointerLock,
  scheduleClearBodyPointerLock,
} from '@/lib/utils/clear-body-pointer-lock'

describe('clearBodyPointerLock', () => {
  beforeEach(() => {
    document.body.style.pointerEvents = 'none'
    document.body.setAttribute('data-scroll-locked', '')
  })

  afterEach(() => {
    document.body.style.pointerEvents = ''
    document.body.removeAttribute('data-scroll-locked')
  })

  it('clears inline pointer-events and scroll-lock attribute', () => {
    clearBodyPointerLock()
    expect(document.body.style.pointerEvents).toBe('')
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)
  })

  it('scheduleClearBodyPointerLock clears again after deferred ticks', async () => {
    vi.useFakeTimers()
    scheduleClearBodyPointerLock()

    // Simulate Radix restoring the lock after our synchronous clear
    document.body.style.pointerEvents = 'none'

    await Promise.resolve() // microtask
    expect(document.body.style.pointerEvents).toBe('')

    document.body.style.pointerEvents = 'none'
    await vi.runAllTimersAsync()
    expect(document.body.style.pointerEvents).toBe('')

    vi.useRealTimers()
  })
})
