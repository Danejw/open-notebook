/**
 * Radix DismissableLayer (Dialog / AlertDialog / DropdownMenu) sets
 * `document.body.style.pointerEvents = 'none'` while open. When layers nest or
 * tear down out of order (especially DropdownMenu → Dialog), Radix can restore
 * the locked value and freeze the page until refresh.
 */
export function clearBodyPointerLock(): void {
  if (typeof document === 'undefined') return
  document.body.style.pointerEvents = ''
  document.body.removeAttribute('data-scroll-locked')
}

/**
 * Clear immediately and again after Radix teardown races (microtask / rAF / timeout).
 * Use on modal close paths so a stuck lock cannot survive the next paint.
 */
export function scheduleClearBodyPointerLock(): void {
  clearBodyPointerLock()
  if (typeof window === 'undefined') return
  queueMicrotask(clearBodyPointerLock)
  requestAnimationFrame(() => {
    clearBodyPointerLock()
    window.setTimeout(clearBodyPointerLock, 0)
  })
}
