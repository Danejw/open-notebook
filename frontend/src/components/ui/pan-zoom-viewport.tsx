'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

const MIN_USER_ZOOM = 0.5
const MAX_USER_ZOOM = 8
const WHEEL_ZOOM_SENSITIVITY = 0.0015

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type ViewState = {
  fitScale: number
  userZoom: number
  panX: number
  panY: number
}

const INITIAL_VIEW: ViewState = {
  fitScale: 1,
  userZoom: 1,
  panX: 0,
  panY: 0,
}

type PanZoomViewportProps = {
  children: ReactNode
  /** Intrinsic width of the zoomable content in CSS pixels. */
  contentWidth: number
  /** Intrinsic height of the zoomable content in CSS pixels. */
  contentHeight: number
  /** Change this to reset pan/zoom (e.g. when the page image URL changes). */
  resetKey?: string | null
  className?: string
  /** Accessible name for the interactive viewport. */
  'aria-label'?: string
  title?: string
}

/**
 * Fit-to-viewport baseline with wheel zoom, drag pan, and pinch zoom.
 * Double-click resets to fit.
 */
export function PanZoomViewport({
  children,
  contentWidth,
  contentHeight,
  resetKey,
  className,
  'aria-label': ariaLabel,
  title,
}: PanZoomViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<ViewState>(INITIAL_VIEW)
  const [view, setView] = useState<ViewState>(INITIAL_VIEW)
  const [isPanning, setIsPanning] = useState(false)

  const dragRef = useRef<{
    pointerId: number
    lastX: number
    lastY: number
  } | null>(null)
  const pinchRef = useRef<{
    startDistance: number
    startZoom: number
    startMidX: number
    startMidY: number
    startPanX: number
    startPanY: number
  } | null>(null)

  const applyView = useCallback((next: ViewState) => {
    viewRef.current = next
    setView(next)
  }, [])

  const fitToContainer = useCallback(
    (preserveInteraction: boolean) => {
      const container = containerRef.current
      if (!container || contentWidth <= 0 || contentHeight <= 0) return

      const availW = Math.max(container.clientWidth, 1)
      const availH = Math.max(container.clientHeight, 1)
      const fitScale = Math.min(availW / contentWidth, availH / contentHeight, 1)
      const prev = viewRef.current

      applyView({
        fitScale,
        userZoom: preserveInteraction ? prev.userZoom : 1,
        panX: preserveInteraction
          ? prev.panX
          : (availW - contentWidth * fitScale) / 2,
        panY: preserveInteraction
          ? prev.panY
          : (availH - contentHeight * fitScale) / 2,
      })
    },
    [applyView, contentHeight, contentWidth]
  )

  const zoomAt = useCallback(
    (clientX: number, clientY: number, nextUserZoom: number) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const mx = clientX - rect.left
      const my = clientY - rect.top
      const current = viewRef.current
      const prevScale = current.fitScale * current.userZoom
      const zoom = clamp(nextUserZoom, MIN_USER_ZOOM, MAX_USER_ZOOM)
      const nextScale = current.fitScale * zoom
      if (prevScale <= 0) return

      const contentX = (mx - current.panX) / prevScale
      const contentY = (my - current.panY) / prevScale
      applyView({
        ...current,
        userZoom: zoom,
        panX: mx - contentX * nextScale,
        panY: my - contentY * nextScale,
      })
    },
    [applyView]
  )

  const resetView = useCallback(() => {
    fitToContainer(false)
  }, [fitToContainer])

  useEffect(() => {
    viewRef.current = INITIAL_VIEW
    setView(INITIAL_VIEW)
    dragRef.current = null
    pinchRef.current = null
    fitToContainer(false)
  }, [resetKey, contentWidth, contentHeight, fitToContainer])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => fitToContainer(true))
    observer.observe(container)
    return () => observer.disconnect()
  }, [fitToContainer])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY)
      zoomAt(event.clientX, event.clientY, viewRef.current.userZoom * factor)
    }

    const touchDistance = (a: Touch, b: Touch) => {
      const dx = a.clientX - b.clientX
      const dy = a.clientY - b.clientY
      return Math.hypot(dx, dy)
    }

    const toLocal = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault()
        dragRef.current = null
        setIsPanning(false)
        const [a, b] = [event.touches[0], event.touches[1]]
        const mid = toLocal(
          (a.clientX + b.clientX) / 2,
          (a.clientY + b.clientY) / 2
        )
        pinchRef.current = {
          startDistance: Math.max(touchDistance(a, b), 1),
          startZoom: viewRef.current.userZoom,
          startMidX: mid.x,
          startMidY: mid.y,
          startPanX: viewRef.current.panX,
          startPanY: viewRef.current.panY,
        }
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2 && pinchRef.current) {
        event.preventDefault()
        const [a, b] = [event.touches[0], event.touches[1]]
        const mid = toLocal(
          (a.clientX + b.clientX) / 2,
          (a.clientY + b.clientY) / 2
        )
        const distance = Math.max(touchDistance(a, b), 1)
        const pinch = pinchRef.current
        const current = viewRef.current
        const startScale = current.fitScale * pinch.startZoom
        if (startScale <= 0) return
        const contentX = (pinch.startMidX - pinch.startPanX) / startScale
        const contentY = (pinch.startMidY - pinch.startPanY) / startScale
        const nextZoom = clamp(
          pinch.startZoom * (distance / pinch.startDistance),
          MIN_USER_ZOOM,
          MAX_USER_ZOOM
        )
        const nextScale = current.fitScale * nextZoom
        applyView({
          ...current,
          userZoom: nextZoom,
          panX: mid.x - contentX * nextScale,
          panY: mid.y - contentY * nextScale,
        })
      } else if (dragRef.current) {
        event.preventDefault()
      }
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        pinchRef.current = null
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('touchstart', onTouchStart, { passive: false })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd)
    container.addEventListener('touchcancel', onTouchEnd)

    return () => {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [applyView, zoomAt])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || pinchRef.current) return
    if (event.pointerType === 'touch' && event.isPrimary === false) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    }
    setIsPanning(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || pinchRef.current) return
    const dx = event.clientX - drag.lastX
    const dy = event.clientY - drag.lastY
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    const current = viewRef.current
    applyView({
      ...current,
      panX: current.panX + dx,
      panY: current.panY + dy,
    })
  }

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const scale = view.fitScale * view.userZoom
  const ready = contentWidth > 0 && contentHeight > 0

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative min-h-0 w-full touch-none select-none overflow-hidden',
        isPanning ? 'cursor-grabbing' : 'cursor-grab',
        className
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDoubleClick={resetView}
      role="img"
      aria-label={ariaLabel}
      title={title}
    >
      {ready ? (
        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{
            width: contentWidth,
            height: contentHeight,
            transform: `translate(${view.panX}px, ${view.panY}px) scale(${scale})`,
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
