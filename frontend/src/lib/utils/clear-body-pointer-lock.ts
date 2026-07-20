/**
 * Radix DropdownMenu → Dialog/AlertDialog combos can leave
 * `document.body.style.pointerEvents = 'none'` after close, freezing the UI.
 */
export function clearBodyPointerLock(): void {
  if (typeof document === 'undefined') return
  document.body.style.pointerEvents = ''
  document.body.removeAttribute('data-scroll-locked')
}
