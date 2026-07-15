'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface TemplateHtmlPreviewProps {
  html: string
  className?: string
  title?: string
  /** Viewport height for the preview (default: min(70vh, 720px)). */
  maxHeightPx?: number
}

const MIN_USER_ZOOM = 0.5
const MAX_USER_ZOOM = 8
const WHEEL_ZOOM_SENSITIVITY = 0.0015

function defaultMaxHeight(): number {
  if (typeof window === 'undefined') return 720
  return Math.min(window.innerHeight * 0.7, 720)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type ViewState = {
  fitScale: number
  userZoom: number
  panX: number
  panY: number
  naturalWidth: number
  naturalHeight: number
}

const INITIAL_VIEW: ViewState = {
  fitScale: 1,
  userZoom: 1,
  panX: 0,
  panY: 0,
  naturalWidth: 0,
  naturalHeight: 0,
}

/**
 * Sandboxed HTML preview with fit-to-viewport baseline plus pan/zoom
 * (wheel, drag, and pinch).
 */
export function TemplateHtmlPreview({
  html,
  className,
  title,
  maxHeightPx,
}: TemplateHtmlPreviewProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
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
    const iframe = iframeRef.current
    if (!iframe) return
    const scale = next.fitScale * next.userZoom
    iframe.style.width = `${next.naturalWidth}px`
    iframe.style.height = `${next.naturalHeight}px`
    iframe.style.transform = `translate(${next.panX}px, ${next.panY}px) scale(${scale})`
    iframe.style.transformOrigin = '0 0'
  }, [])

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

  const measureAndFit = useCallback(() => {
    const container = containerRef.current
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!container || !iframe || !doc?.documentElement) return

    const body = doc.body
    const root = doc.documentElement
    if (!body) return

    iframe.style.transform = 'none'
    iframe.style.width = '2400px'
    iframe.style.height = 'auto'

    const width = Math.max(
      root.scrollWidth,
      body.scrollWidth,
      root.offsetWidth,
      body.offsetWidth,
      1
    )
    const height = Math.max(
      root.scrollHeight,
      body.scrollHeight,
      root.offsetHeight,
      body.offsetHeight,
      1
    )

    const availW = Math.max(container.clientWidth, 1)
    const availH = maxHeightPx ?? defaultMaxHeight()
    const fitScale = Math.min(availW / width, availH / height, 1)

    const prev = viewRef.current
    const keepInteraction =
      prev.naturalWidth > 0 &&
      prev.naturalWidth === width &&
      prev.naturalHeight === height

    applyView({
      fitScale,
      userZoom: keepInteraction ? prev.userZoom : 1,
      panX: keepInteraction ? prev.panX : (availW - width * fitScale) / 2,
      panY: keepInteraction ? prev.panY : (availH - height * fitScale) / 2,
      naturalWidth: width,
      naturalHeight: height,
    })
  }, [applyView, maxHeightPx])

  useEffect(() => {
    viewRef.current = INITIAL_VIEW
    setView(INITIAL_VIEW)
    dragRef.current = null
    pinchRef.current = null

    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return

    doc.open()
    doc.write(html)
    doc.close()

    const style = doc.createElement('style')
    style.setAttribute('data-template-fit', 'true')
    style.textContent = `
      html, body {
        margin: 0 !important;
        overflow: hidden !important;
      }
    `
    doc.head?.appendChild(style)

    const runFit = () => {
      requestAnimationFrame(() => measureAndFit())
    }
    runFit()

    const images = Array.from(doc.images ?? [])
    for (const img of images) {
      if (!img.complete) {
        img.addEventListener('load', runFit, { once: true })
        img.addEventListener('error', runFit, { once: true })
      }
    }

    const t1 = window.setTimeout(runFit, 50)
    const t2 = window.setTimeout(runFit, 250)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [html, measureAndFit])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => measureAndFit())
    observer.observe(container)
    return () => observer.disconnect()
  }, [measureAndFit])

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
    // Ignore multi-touch pointer streams; pinch handled via touch events.
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

  const viewportHeight = maxHeightPx ?? defaultMaxHeight()

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full touch-none select-none overflow-hidden rounded-md border bg-white',
        isPanning ? 'cursor-grabbing' : 'cursor-grab',
        className
      )}
      style={{
        height: viewportHeight,
        maxHeight: maxHeightPx ?? 'min(70vh, 720px)',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDoubleClick={() => {
        const container = containerRef.current
        if (!container) return
        const availW = Math.max(container.clientWidth, 1)
        const availH = maxHeightPx ?? defaultMaxHeight()
        const current = viewRef.current
        applyView({
          ...current,
          userZoom: 1,
          panX: (availW - current.naturalWidth * current.fitScale) / 2,
          panY: (availH - current.naturalHeight * current.fitScale) / 2,
        })
      }}
      role="img"
      aria-label={title ?? t('chat.templatePreview')}
      title={t('chat.templatePreview')}
    >
      <iframe
        ref={iframeRef}
        title={title ?? t('chat.templatePreview')}
        className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
        sandbox="allow-same-origin"
        style={{
          width: view.naturalWidth || undefined,
          height: view.naturalHeight || undefined,
          transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.fitScale * view.userZoom})`,
          transformOrigin: '0 0',
        }}
      />
    </div>
  )
}
