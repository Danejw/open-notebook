'use client'

import { useEffect, useRef } from 'react'
import Sigma from 'sigma'
import FA2Layout from 'graphology-layout-forceatlas2/worker'
import type { MouseCoords } from 'sigma/types'
import type { KnowledgeGraphology } from '@/lib/graph/build-graphology-graph'
import {
  useGraphCanvasTheme,
  type GraphCanvasTheme,
} from '@/lib/graph/graph-canvas-theme'
import { edgeColorForTrace } from '@/lib/graph/graph-styles'
import {
  applyOrbit,
  clampOrbitPitch,
  orbitDeltasFromDrag,
  orbitPitchTransform,
  resolveOrbitPivot,
} from '@/lib/graph/unity-camera-controls'
import { cn } from '@/lib/utils'

type CameraDragMode = 'none' | 'orbit'

interface GraphCanvasProps {
  graph: KnowledgeGraphology
  selectedNodeId: string | null
  highlightedNodeIds: Set<string>
  focusNodeId: string | null
  runLayout: boolean
  onNodeClick: (nodeId: string) => void
  onEdgeClick: (edgeId: string) => void
  onStageClick: () => void
  onLayoutSettled?: () => void
  /** Drop chrome border in embedded Sources column. */
  embedded?: boolean
  /** When false, node labels are hidden (hover still shows name). */
  showLabels?: boolean
  /** Multiplier for node radius (visual + click target). */
  nodeSizeScale?: number
  /** Bump token to fit/reset the camera (works with next/dynamic). */
  cameraCommand?: { type: 'fit' | 'reset'; token: number } | null
  /** Bump to refresh Sigma after in-place graphology mutations (no remount). */
  graphRevision?: number
}

function scaledNodeSize(
  baseSize: unknown,
  scale: number,
  selected: boolean
): number {
  const size = (Number(baseSize) || 8) * scale
  return selected ? size * 1.35 : size
}

interface LabelDrawSettings {
  labelSize: number
  labelFont: string
  labelWeight: string
  labelColor: { color?: string; attribute?: string }
}

function resolveLabelFill(settings: LabelDrawSettings): string {
  return settings.labelColor.color || '#000'
}

function drawLabelWithHalo(
  context: CanvasRenderingContext2D,
  data: { x: number; y: number; size: number; label: string | null },
  settings: LabelDrawSettings,
  haloColor: string
) {
  if (!data.label) return
  const size = settings.labelSize
  const font = settings.labelFont
  const weight = settings.labelWeight
  const color = resolveLabelFill(settings)

  context.font = `${weight} ${size}px ${font}`
  const x = data.x + data.size + 3
  const y = data.y + size / 3

  context.lineWidth = 3
  context.strokeStyle = haloColor
  context.lineJoin = 'round'
  context.miterLimit = 2
  context.strokeText(data.label, x, y)
  context.fillStyle = color
  context.fillText(data.label, x, y)
}

function drawThemedNodeHover(
  context: CanvasRenderingContext2D,
  data: {
    x: number
    y: number
    size: number
    label: string | null
    color: string
  },
  settings: LabelDrawSettings,
  theme: GraphCanvasTheme
) {
  const size = settings.labelSize
  const font = settings.labelFont
  const weight = settings.labelWeight
  context.font = `${weight} ${size}px ${font}`

  context.fillStyle = theme.hoverFill
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.shadowBlur = 8
  context.shadowColor = theme.isDark
    ? 'rgba(0,0,0,0.65)'
    : 'rgba(0,0,0,0.35)'

  const PADDING = 2
  if (typeof data.label === 'string') {
    const textWidth = context.measureText(data.label).width
    const boxWidth = Math.round(textWidth + 5)
    const boxHeight = Math.round(size + 2 * PADDING)
    const radius = Math.max(data.size, size / 2) + PADDING
    const angleRadian = Math.asin(boxHeight / 2 / radius)
    const xDeltaCoord = Math.sqrt(
      Math.abs(Math.pow(radius, 2) - Math.pow(boxHeight / 2, 2))
    )
    context.beginPath()
    context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2)
    context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2)
    context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2)
    context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2)
    context.arc(data.x, data.y, radius, angleRadian, -angleRadian)
    context.closePath()
    context.fill()
  } else {
    context.beginPath()
    context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2)
    context.closePath()
    context.fill()
  }

  context.shadowBlur = 0
  drawLabelWithHalo(context, data, settings, theme.halo)
}

function applyLabelTheme(sigma: Sigma, theme: GraphCanvasTheme) {
  sigma.setSetting('labelColor', { color: theme.label })
  sigma.setSetting('edgeLabelColor', { color: theme.label })
  sigma.setSetting('defaultDrawNodeLabel', (context, data, settings) => {
    drawLabelWithHalo(context, data, settings, theme.halo)
  })
  sigma.setSetting('defaultDrawNodeHover', (context, data, settings) => {
    drawThemedNodeHover(context, data, settings, theme)
  })
}

/**
 * Camera gestures:
 * - LMB click → select (Sigma suppresses click after a meaningful drag)
 * - LMB drag → pan (Sigma built-in)
 * - RMB drag → orbit on Z (horizontal) and X (vertical) around selection / viewport center
 * - Wheel / pinch → zoom toward cursor
 * - F (when canvas focused) → frame selection / fit
 */
export function GraphCanvas({
  graph,
  selectedNodeId,
  highlightedNodeIds,
  focusNodeId,
  runLayout,
  onNodeClick,
  onEdgeClick,
  onStageClick,
  onLayoutSettled,
  embedded = false,
  showLabels = false,
  nodeSizeScale = 1,
  cameraCommand = null,
  graphRevision = 0,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const layoutRef = useRef<FA2Layout | null>(null)
  const dragModeRef = useRef<CameraDragMode>('none')
  const orbitRef = useRef<{
    lastX: number
    lastY: number
    pivotX: number
    pivotY: number
  } | null>(null)
  /** X-axis pitch (degrees) for perspective tumble; Z spin lives on Sigma camera.angle. */
  const pitchRef = useRef(0)
  const suppressClickRef = useRef(false)
  const selectedNodeIdRef = useRef(selectedNodeId)
  selectedNodeIdRef.current = selectedNodeId
  const showLabelsRef = useRef(showLabels)
  showLabelsRef.current = showLabels
  const nodeSizeScaleRef = useRef(nodeSizeScale)
  nodeSizeScaleRef.current = nodeSizeScale
  const theme = useGraphCanvasTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    container.style.cursor = 'default'
    container.style.touchAction = 'none'

    const initialTheme = themeRef.current
    const sigma = new Sigma(graph, container, {
      renderLabels: showLabelsRef.current,
      renderEdgeLabels: false,
      labelDensity: 0.07,
      labelGridCellSize: 60,
      labelRenderedSizeThreshold: 8,
      labelColor: { color: initialTheme.label },
      edgeLabelColor: { color: initialTheme.label },
      defaultNodeColor: '#64748b',
      defaultEdgeColor: '#94a3b8',
      zIndex: true,
      // LMB drag pans; wheel + pinch zoom. RMB X/Z orbit is custom below.
      enableCameraPanning: true,
      enableCameraZooming: true,
      enableCameraRotation: false,
      minCameraRatio: 0.05,
      maxCameraRatio: 12,
      inertiaDuration: 180,
      inertiaRatio: 1.4,
      zoomDuration: 140,
      zoomingRatio: 1.35,
      hideEdgesOnMove: true,
      hideLabelsOnMove: true,
    })
    applyLabelTheme(sigma, initialTheme)

    sigma.setSetting('nodeReducer', (node, data) => {
      const res = { ...data }
      const isSelected = node === selectedNodeId
      const isHighlighted =
        highlightedNodeIds.size === 0 || highlightedNodeIds.has(node)
      if (!isHighlighted) {
        res.color = themeRef.current.dimNode
        res.label = ''
        res.zIndex = 0
      } else {
        res.zIndex = isSelected ? 2 : 1
      }
      res.size = scaledNodeSize(data.size, nodeSizeScaleRef.current, isSelected)
      if (isSelected) {
        res.highlighted = true
      }
      return res
    })

    sigma.setSetting('edgeReducer', (edge, data) => {
      const res = { ...data }
      const extremities = graph.extremities(edge)
      const [a, b] = extremities
      const connectedToSelection =
        !selectedNodeId || a === selectedNodeId || b === selectedNodeId
      const inHighlight =
        highlightedNodeIds.size === 0 ||
        (highlightedNodeIds.has(a) && highlightedNodeIds.has(b))
      if (!connectedToSelection || !inHighlight) {
        res.color = themeRef.current.dimEdge
        res.hidden = highlightedNodeIds.size > 0 && !inHighlight
      } else {
        res.color = edgeColorForTrace(
          (data.metadata as Record<string, unknown> | undefined) ?? undefined
        )
      }
      return res
    })

    const consumeSuppressedClick = () => {
      if (!suppressClickRef.current) return false
      suppressClickRef.current = false
      return true
    }

    sigma.on('clickNode', ({ node }) => {
      if (consumeSuppressedClick()) return
      onNodeClick(node)
    })
    sigma.on('clickEdge', ({ edge }) => {
      if (consumeSuppressedClick()) return
      onEdgeClick(edge)
    })
    sigma.on('clickStage', () => {
      if (consumeSuppressedClick()) return
      onStageClick()
    })

    const mouse = sigma.getMouseCaptor()

    const applyPitchVisual = (pitchDeg: number) => {
      pitchRef.current = pitchDeg
      container.style.transform = orbitPitchTransform(pitchDeg)
      container.style.transformOrigin = 'center center'
    }

    const resetPitchVisual = () => {
      applyPitchVisual(0)
    }

    const beginOrbit = (e: MouseCoords) => {
      const dims = sigma.getDimensions()
      const viewportCenter = sigma.viewportToFramedGraph({
        x: dims.width / 2,
        y: dims.height / 2,
      })
      const pivot = resolveOrbitPivot(
        selectedNodeIdRef.current,
        (id) => graph.hasNode(id),
        (id) => {
          const attrs = graph.getNodeAttributes(id)
          return { x: Number(attrs.x) || 0, y: Number(attrs.y) || 0 }
        },
        viewportCenter
      )
      dragModeRef.current = 'orbit'
      orbitRef.current = {
        lastX: e.x,
        lastY: e.y,
        pivotX: pivot.x,
        pivotY: pivot.y,
      }
      e.preventSigmaDefault()
      container.style.cursor = 'grabbing'
    }

    const onMouseDown = (e: MouseCoords) => {
      const orig = e.original as MouseEvent
      container.focus({ preventScroll: true })

      // RMB → orbit on Z (horizontal) + X (vertical)
      if (orig.button === 2) {
        beginOrbit(e)
        return
      }

      // LMB: Sigma pans on drag; click without meaningful drag still selects.
      if (orig.button === 0) {
        dragModeRef.current = 'none'
      }
    }

    const onMouseMoveBody = (e: MouseCoords) => {
      if (dragModeRef.current !== 'orbit' || !orbitRef.current) return
      e.preventSigmaDefault()
      suppressClickRef.current = true
      const dx = e.x - orbitRef.current.lastX
      const dy = e.y - orbitRef.current.lastY
      if (dx === 0 && dy === 0) return
      const dims = sigma.getDimensions()
      const { yawZ, pitchX } = orbitDeltasFromDrag(
        dx,
        dy,
        dims.width,
        dims.height
      )
      if (yawZ !== 0) {
        const cam = sigma.getCamera()
        const state = cam.getState()
        const next = applyOrbit(
          { x: state.x, y: state.y, angle: state.angle },
          { x: orbitRef.current.pivotX, y: orbitRef.current.pivotY },
          yawZ
        )
        cam.setState({ x: next.x, y: next.y, angle: next.angle })
      }
      if (pitchX !== 0) {
        applyPitchVisual(clampOrbitPitch(pitchRef.current + pitchX))
      }
      orbitRef.current = { ...orbitRef.current, lastX: e.x, lastY: e.y }
    }

    const onMouseUp = () => {
      dragModeRef.current = 'none'
      orbitRef.current = null
      container.style.cursor = 'default'
    }

    const onContextMenu = (ev: MouseEvent) => {
      ev.preventDefault()
    }

    const frameSelectionOrFit = () => {
      resetPitchVisual()
      const selected = selectedNodeIdRef.current
      if (selected && graph.hasNode(selected)) {
        const attrs = graph.getNodeAttributes(selected)
        void sigma.getCamera().animate(
          { x: Number(attrs.x) || 0, y: Number(attrs.y) || 0, ratio: 0.35 },
          { duration: 300 }
        )
        return
      }
      void sigma.getCamera().animatedReset({ duration: 300 })
    }

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'f' && ev.key !== 'F') return
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return
      const target = ev.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      ev.preventDefault()
      frameSelectionOrFit()
    }

    mouse.on('mousedown', onMouseDown)
    mouse.on('mousemovebody', onMouseMoveBody)
    mouse.on('mouseup', onMouseUp)
    container.addEventListener('contextmenu', onContextMenu)
    container.addEventListener('keydown', onKeyDown)

    sigmaRef.current = sigma

    return () => {
      mouse.off('mousedown', onMouseDown)
      mouse.off('mousemovebody', onMouseMoveBody)
      mouse.off('mouseup', onMouseUp)
      container.removeEventListener('contextmenu', onContextMenu)
      container.removeEventListener('keydown', onKeyDown)
      container.style.transform = ''
      pitchRef.current = 0
      layoutRef.current?.kill()
      layoutRef.current = null
      sigma.kill()
      sigmaRef.current = null
    }
    // Mount once; reducers refreshed below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph])

  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma) return
    applyLabelTheme(sigma, theme)
    sigma.refresh()
  }, [theme])

  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma || graphRevision < 1) return
    sigma.refresh()
  }, [graphRevision])

  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma) return
    sigma.setSetting('renderLabels', showLabels)
    sigma.refresh()
  }, [showLabels])

  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma) return
    sigma.setSetting('nodeReducer', (node, data) => {
      const res = { ...data }
      const isSelected = node === selectedNodeId
      const isHighlighted =
        highlightedNodeIds.size === 0 || highlightedNodeIds.has(node)
      if (!isHighlighted) {
        res.color = themeRef.current.dimNode
        res.label = ''
        res.zIndex = 0
      } else {
        res.zIndex = isSelected ? 2 : 1
      }
      res.size = scaledNodeSize(data.size, nodeSizeScaleRef.current, isSelected)
      if (isSelected) {
        res.highlighted = true
      }
      return res
    })
    sigma.setSetting('edgeReducer', (edge, data) => {
      const res = { ...data }
      const extremities = graph.extremities(edge)
      const [a, b] = extremities
      const connectedToSelection =
        !selectedNodeId || a === selectedNodeId || b === selectedNodeId
      const inHighlight =
        highlightedNodeIds.size === 0 ||
        (highlightedNodeIds.has(a) && highlightedNodeIds.has(b))
      if (!connectedToSelection || !inHighlight) {
        res.color = themeRef.current.dimEdge
        res.hidden = highlightedNodeIds.size > 0 && !inHighlight
      } else {
        res.color = edgeColorForTrace(
          (data.metadata as Record<string, unknown> | undefined) ?? undefined
        )
      }
      return res
    })
    sigma.refresh()
  }, [graph, selectedNodeId, highlightedNodeIds, nodeSizeScale])

  useEffect(() => {
    if (!focusNodeId || !sigmaRef.current || !graph.hasNode(focusNodeId)) return
    const sigma = sigmaRef.current
    if (containerRef.current) {
      pitchRef.current = 0
      containerRef.current.style.transform = ''
    }
    const attrs = graph.getNodeAttributes(focusNodeId)
    sigma.getCamera().animate(
      { x: Number(attrs.x) || 0, y: Number(attrs.y) || 0, ratio: 0.35 },
      { duration: 400 }
    )
  }, [focusNodeId, graph])

  useEffect(() => {
    if (!cameraCommand || !sigmaRef.current || !containerRef.current) return
    pitchRef.current = 0
    containerRef.current.style.transform = ''
    void sigmaRef.current.getCamera().animatedReset({
      duration: cameraCommand.type === 'fit' ? 300 : 200,
    })
  }, [cameraCommand])

  useEffect(() => {
    if (!runLayout || graph.order === 0) return
    layoutRef.current?.kill()
    const layout = new FA2Layout(graph, {
      settings: {
        gravity: 1,
        slowDown: 2,
        barnesHutOptimize: graph.order > 200,
      },
    })
    layoutRef.current = layout
    layout.start()
    const timer = window.setTimeout(() => {
      layout.stop()
      sigmaRef.current?.refresh()
      onLayoutSettled?.()
    }, 2500)
    return () => {
      window.clearTimeout(timer)
      layout.stop()
      layout.kill()
      layoutRef.current = null
    }
  }, [runLayout, graph, onLayoutSettled])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        'h-full w-full bg-background outline-none',
        embedded ? 'rounded-none border-0' : 'rounded-md border-0'
      )}
      data-testid="knowledge-graph-canvas"
      title="LMB drag pan · LMB click select · RMB drag orbit (X·Z) · Wheel/pinch zoom · F frame"
    />
  )
}
