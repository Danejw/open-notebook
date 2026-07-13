'use client'

import { useEffect, useRef } from 'react'
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph'
import SpriteText from 'three-spritetext'
import type { Object3D } from 'three'
import type { KnowledgeGraphology } from '@/lib/graph/build-graphology-graph'
import {
  useGraphCanvasTheme,
  type GraphCanvasTheme,
} from '@/lib/graph/graph-canvas-theme'
import { edgeColorForTrace } from '@/lib/graph/graph-styles'
import {
  focusCameraOnPoint,
  focusDistanceForNodeSize,
} from '@/lib/graph/unity-camera-controls'
import { cn } from '@/lib/utils'

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
  embedded?: boolean
  showLabels?: boolean
  nodeSizeScale?: number
  cameraCommand?: { type: 'fit' | 'reset'; token: number } | null
  graphRevision?: number
}

interface FgNode {
  id: string
  name: string
  color: string
  val: number
  x?: number
  y?: number
  z?: number
  fx?: number
  fy?: number
  fz?: number
  kind?: string
  __graphColor?: string
}

interface FgLink {
  id: string
  source: string | FgNode
  target: string | FgNode
  color: string
  relation?: string
  metadata?: Record<string, unknown>
}

function linkEndpointId(end: string | FgNode): string {
  return typeof end === 'string' ? end : end.id
}

function getNodes(fg: ForceGraph3DInstance): FgNode[] {
  return (fg.graphData() as unknown as { nodes: FgNode[] }).nodes
}

function graphToForceData(graph: KnowledgeGraphology): {
  nodes: FgNode[]
  links: FgLink[]
} {
  const nodes: FgNode[] = []
  graph.forEachNode((id, attrs) => {
    const color = String(attrs.color || '#64748b')
    nodes.push({
      id,
      name: String(attrs.label || id),
      color,
      __graphColor: color,
      val: Number(attrs.size) || 8,
      x: Number(attrs.x) || 0,
      y: Number(attrs.y) || 0,
      z: Number(attrs.z) || 0,
      kind: attrs.kind != null ? String(attrs.kind) : undefined,
    })
  })

  const links: FgLink[] = []
  graph.forEachEdge((edgeId, attrs, source, target) => {
    links.push({
      id: edgeId,
      source,
      target,
      color: edgeColorForTrace(
        (attrs.metadata as Record<string, unknown> | undefined) ?? undefined
      ),
      relation:
        attrs.relation != null
          ? String(attrs.relation)
          : attrs.label != null
            ? String(attrs.label)
            : undefined,
      metadata:
        (attrs.metadata as Record<string, unknown> | undefined) ?? undefined,
    })
  })

  return { nodes, links }
}

function syncPositionsToGraphology(
  graph: KnowledgeGraphology,
  nodes: FgNode[]
): void {
  for (const node of nodes) {
    if (!graph.hasNode(node.id)) continue
    if (Number.isFinite(node.x)) graph.setNodeAttribute(node.id, 'x', node.x)
    if (Number.isFinite(node.y)) graph.setNodeAttribute(node.id, 'y', node.y)
    if (Number.isFinite(node.z)) graph.setNodeAttribute(node.id, 'z', node.z)
  }
}

function applyHighlightColors(
  fg: ForceGraph3DInstance,
  theme: GraphCanvasTheme,
  selectedNodeId: string | null,
  highlightedNodeIds: Set<string>
) {
  fg.nodeColor((n) => {
    const node = n as FgNode
    const base = node.__graphColor || node.color || '#64748b'
    const isHighlighted =
      highlightedNodeIds.size === 0 || highlightedNodeIds.has(node.id)
    if (!isHighlighted) return theme.dimNode
    return base
  })
  fg.linkColor((l) => {
    const link = l as FgLink
    const a = linkEndpointId(link.source)
    const b = linkEndpointId(link.target)
    const connectedToSelection =
      !selectedNodeId || a === selectedNodeId || b === selectedNodeId
    const inHighlight =
      highlightedNodeIds.size === 0 ||
      (highlightedNodeIds.has(a) && highlightedNodeIds.has(b))
    if (!connectedToSelection || !inHighlight) return theme.dimEdge
    return edgeColorForTrace(link.metadata) || link.color || '#94a3b8'
  })
  fg.linkVisibility((l) => {
    const link = l as FgLink
    const a = linkEndpointId(link.source)
    const b = linkEndpointId(link.target)
    if (highlightedNodeIds.size === 0) return true
    return highlightedNodeIds.has(a) && highlightedNodeIds.has(b)
  })
}

/**
 * Camera gestures (Three.js OrbitControls via 3d-force-graph):
 * - LMB drag → orbit around focus
 * - RMB / MMB drag → pan (moves focus)
 * - Wheel → zoom toward focus
 * - LMB click node → select + focus + zoom
 * - Background click → clear selection
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
  const fgRef = useRef<ForceGraph3DInstance | null>(null)
  const settledRef = useRef(false)
  const runLayoutRef = useRef(runLayout)
  runLayoutRef.current = runLayout
  const selectedNodeIdRef = useRef(selectedNodeId)
  selectedNodeIdRef.current = selectedNodeId
  const highlightedRef = useRef(highlightedNodeIds)
  highlightedRef.current = highlightedNodeIds
  const showLabelsRef = useRef(showLabels)
  showLabelsRef.current = showLabels
  const nodeSizeScaleRef = useRef(nodeSizeScale)
  nodeSizeScaleRef.current = nodeSizeScale
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick
  const onEdgeClickRef = useRef(onEdgeClick)
  onEdgeClickRef.current = onEdgeClick
  const onStageClickRef = useRef(onStageClick)
  onStageClickRef.current = onStageClick
  const onLayoutSettledRef = useRef(onLayoutSettled)
  onLayoutSettledRef.current = onLayoutSettled
  const theme = useGraphCanvasTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

  const focusNode = (
    fg: ForceGraph3DInstance,
    node: FgNode,
    durationMs = 600
  ) => {
    const distance = focusDistanceForNodeSize(
      (Number(node.val) || 8) * nodeSizeScaleRef.current
    )
    const pose = focusCameraOnPoint(
      {
        x: Number(node.x) || 0,
        y: Number(node.y) || 0,
        z: Number(node.z) || 0,
      },
      distance
    )
    fg.cameraPosition(pose.position, pose.lookAt, durationMs)
  }

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    container.style.cursor = 'default'

    const data = graphToForceData(graph)
    const fg = new ForceGraph3D(container, { controlType: 'orbit' })
      .graphData(data)
      .backgroundColor(themeRef.current.isDark ? '#09090b' : '#ffffff')
      .nodeId('id')
      .nodeLabel((n) => (n as FgNode).name)
      .nodeVal((n) => (Number((n as FgNode).val) || 8) * nodeSizeScaleRef.current)
      .nodeRelSize(4)
      .nodeOpacity(0.92)
      .linkWidth(1.2)
      .linkOpacity(0.55)
      .linkDirectionalArrowLength(3.5)
      .linkDirectionalArrowRelPos(1)
      .enableNodeDrag(false)
      .showNavInfo(false)
      .onNodeClick((n) => {
        const node = n as FgNode
        onNodeClickRef.current(node.id)
        focusNode(fg, node)
      })
      .onLinkClick((l) => {
        const link = l as FgLink
        if (link.id) onEdgeClickRef.current(link.id)
      })
      .onBackgroundClick(() => {
        onStageClickRef.current()
      })
      .onEngineStop(() => {
        // Only persist when we intentionally ran a layout. Otherwise
        // cooldownTicks(0) / pin freezes also fire onEngineStop and would
        // lock in bad seed coords (rings / flat 2D).
        if (!runLayoutRef.current) return
        if (settledRef.current) return
        settledRef.current = true
        syncPositionsToGraphology(graph, getNodes(fg))
        onLayoutSettledRef.current?.()
      })

    applyHighlightColors(
      fg,
      themeRef.current,
      selectedNodeIdRef.current,
      highlightedRef.current
    )

    if (showLabelsRef.current) {
      fg.nodeThreeObject((n) => {
        const sprite = new SpriteText((n as FgNode).name)
        sprite.color = themeRef.current.label
        sprite.textHeight = 4
        return sprite as unknown as Object3D
      })
      fg.nodeThreeObjectExtend(true)
    }

    const resize = () => {
      fg.width(container.clientWidth || 1)
      fg.height(container.clientHeight || 1)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

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
      const selected = selectedNodeIdRef.current
      const nodes = getNodes(fg)
      if (selected) {
        const node = nodes.find((n) => n.id === selected)
        if (node) {
          focusNode(fg, node)
          return
        }
      }
      fg.zoomToFit(400, 40)
    }
    container.addEventListener('keydown', onKeyDown)

    const onContextMenu = (ev: MouseEvent) => {
      ev.preventDefault()
    }
    container.addEventListener('contextmenu', onContextMenu)

    fgRef.current = fg
    settledRef.current = false

    return () => {
      ro.disconnect()
      container.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('contextmenu', onContextMenu)
      fg._destructor()
      fgRef.current = null
      while (container.firstChild) {
        container.removeChild(container.firstChild)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.backgroundColor(theme.isDark ? '#09090b' : '#ffffff')
    applyHighlightColors(fg, theme, selectedNodeId, highlightedNodeIds)
  }, [theme, selectedNodeId, highlightedNodeIds])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg || graphRevision < 1) return
    const data = graphToForceData(graph)
    const prevById = new Map(getNodes(fg).map((n) => [n.id, n]))
    for (const node of data.nodes) {
      const old = prevById.get(node.id)
      if (old && Number.isFinite(old.x)) {
        node.x = old.x
        node.y = old.y
        node.z = old.z
      }
      // While laying out, never carry pinned coords into the new payload.
      if (runLayoutRef.current) {
        delete node.fx
        delete node.fy
        delete node.fz
      }
    }
    if (!runLayoutRef.current) {
      settledRef.current = true
    }
    fg.graphData(data)
    applyHighlightColors(
      fg,
      themeRef.current,
      selectedNodeIdRef.current,
      highlightedRef.current
    )
    if (runLayoutRef.current) {
      settledRef.current = false
      fg.d3ReheatSimulation()
      fg.cooldownTicks(250)
      fg.warmupTicks(40)
    }
  }, [graphRevision, graph])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    if (showLabels) {
      fg.nodeThreeObject((n) => {
        const sprite = new SpriteText((n as FgNode).name)
        sprite.color = themeRef.current.label
        sprite.textHeight = 4
        return sprite as unknown as Object3D
      })
      fg.nodeThreeObjectExtend(true)
    } else {
      // Clear custom label sprites without replacing default node meshes.
      ;(
        fg as unknown as {
          nodeThreeObject: (obj: null) => ForceGraph3DInstance
        }
      ).nodeThreeObject(null)
      fg.nodeThreeObjectExtend(false)
    }
  }, [showLabels, theme])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.nodeVal((n) => (Number((n as FgNode).val) || 8) * nodeSizeScale)
  }, [nodeSizeScale])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !focusNodeId) return
    const node = getNodes(fg).find((n) => n.id === focusNodeId)
    if (node) focusNode(fg, node)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !cameraCommand) return
    if (cameraCommand.type === 'fit') {
      const selected = selectedNodeIdRef.current
      const nodes = getNodes(fg)
      if (selected) {
        const node = nodes.find((n) => n.id === selected)
        if (node) {
          focusNode(fg, node)
          return
        }
      }
      fg.zoomToFit(400, 40)
      return
    }
    fg.zoomToFit(300, 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCommand])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const nodes = getNodes(fg)
    if (runLayout) {
      settledRef.current = false
      for (const node of nodes) {
        delete node.fx
        delete node.fy
        delete node.fz
      }
      fg.d3ReheatSimulation()
      fg.cooldownTicks(250)
      fg.warmupTicks(40)
    } else {
      for (const node of nodes) {
        if (Number.isFinite(node.x)) node.fx = node.x
        if (Number.isFinite(node.y)) node.fy = node.y
        if (Number.isFinite(node.z)) node.fz = node.z
      }
      fg.cooldownTicks(0)
    }
  }, [runLayout])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        'h-full w-full overflow-hidden bg-background outline-none [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full',
        embedded ? 'rounded-none border-0' : 'rounded-md border-0'
      )}
      data-testid="knowledge-graph-canvas"
      title="LMB orbit · Wheel zoom · Click node to focus · RMB pan · F frame"
    />
  )
}
