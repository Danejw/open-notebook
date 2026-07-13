'use client'

import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

const DEFAULT_DELAY_MS = 450

interface UseLongPressOptions {
  delayMs?: number
  disabled?: boolean
  onClick?: () => void
  onLongPress: () => void
}

/**
 * Pointer long-press helper for entering multi-select.
 * Suppresses the subsequent click after a long-press fires.
 */
export function useLongPress({
  delayMs = DEFAULT_DELAY_MS,
  disabled = false,
  onClick,
  onLongPress,
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressedRef = useRef(false)
  const movedRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (disabled) return
      if (event.pointerType === 'mouse' && event.button !== 0) return

      longPressedRef.current = false
      movedRef.current = false
      startPosRef.current = { x: event.clientX, y: event.clientY }
      clearTimer()
      timerRef.current = setTimeout(() => {
        longPressedRef.current = true
        onLongPress()
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(12)
          } catch {
            // ignore
          }
        }
      }, delayMs)
    },
    [clearTimer, delayMs, disabled, onLongPress]
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!startPosRef.current || movedRef.current) return
      const dx = Math.abs(event.clientX - startPosRef.current.x)
      const dy = Math.abs(event.clientY - startPosRef.current.y)
      if (dx > 8 || dy > 8) {
        movedRef.current = true
        clearTimer()
      }
    },
    [clearTimer]
  )

  const onPointerUp = useCallback(() => {
    clearTimer()
    startPosRef.current = null
  }, [clearTimer])

  const onPointerCancel = useCallback(() => {
    clearTimer()
    startPosRef.current = null
    longPressedRef.current = false
  }, [clearTimer])

  const handleClick = useCallback(
    (event?: ReactMouseEvent) => {
      if (longPressedRef.current) {
        longPressedRef.current = false
        event?.preventDefault()
        event?.stopPropagation()
        return
      }
      if (movedRef.current) {
        movedRef.current = false
        return
      }
      onClick?.()
    },
    [onClick]
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave: onPointerUp,
    onClick: handleClick,
  }
}
