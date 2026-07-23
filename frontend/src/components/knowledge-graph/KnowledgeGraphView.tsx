'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GraphToolbar } from '@/components/knowledge-graph/GraphToolbar'
import { KnowledgeGraphCanvasArea } from '@/components/knowledge-graph/KnowledgeGraphCanvasArea'
import {
  knowledgeGraphApi,
  type GraphSliceDTO,
} from '@/lib/api/knowledge-graph'
import {
  applyPositions,
  collectPositions,
  createEmptyGraph,
  layoutHas3DDepth,
  layoutLooksParametric,
  seedRandomNodePositions,
  syncGraphToSlice,
} from '@/lib/graph/build-graphology-graph'
import {
  GRAPH_QUERY_KEYS,
  mergeSlices,
  useGraphLayout,
  useGraphNode,
  useGraphOverview,
  useGraphQueryRun,
  useSaveGraphLayout,
  useSourceSubgraph,
} from '@/lib/hooks/useKnowledgeGraph'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useGraphLiveStore } from '@/lib/stores/graph-live-store'
import { useKnowledgeGraphStore } from '@/lib/stores/knowledge-graph-store'
import { cn } from '@/lib/utils'

interface KnowledgeGraphViewProps {
  projectId: string
  /** Stacked layout for embedding in the Sources column (no source sidebar). */
  embedded?: boolean
  /** Top-left overlay when embedded (List/Graph tabs). */
  headerLeading?: ReactNode
  /** Top-right overlay when embedded (Add Source). */
  headerTrailing?: ReactNode
}

export function KnowledgeGraphView({
  projectId,
  embedded = false,
  headerLeading,
  headerTrailing,
}: KnowledgeGraphViewProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const runParam = searchParams.get('run')

  const {
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    highlightedSourceId,
    setHighlightedSourceId,
    provenanceMode,
    showLabels,
    nodeSizeScale,
    edgeOpacity,
    enabledKinds,
    minConfidence,
    focusNodeId,
    setFocusNodeId,
    queryRunId,
    setQueryRunId,
    viewMode,
    resetSelection,
  } = useKnowledgeGraphStore()

  const [mergedSlice, setMergedSlice] = useState<GraphSliceDTO | null>(null)
  const [runLayout, setRunLayout] = useState(false)
  const [layoutApplied, setLayoutApplied] = useState(false)
  const graphRef = useRef(createEmptyGraph())
  const [graphRevision, setGraphRevision] = useState(0)
  const processedLiveTokenRef = useRef(0)
  const [cameraCommand, setCameraCommand] = useState<{
    type: 'fit' | 'reset'
    token: number
  } | null>(null)

  const lastCompleted = useGraphLiveStore((s) => s.lastCompleted)
  const projectUpdating = useGraphLiveStore((s) =>
    s.isProjectUpdating(projectId)
  )

  useEffect(() => {
    if (runParam) setQueryRunId(runParam)
  }, [runParam, setQueryRunId])

  const overviewQuery = useGraphOverview(projectId, viewMode === 'explore')
  const queryRunQuery = useGraphQueryRun(
    queryRunId,
    viewMode === 'queryTrace' && !!queryRunId
  )
  const layoutQuery = useGraphLayout(
    projectId,
    overviewQuery.data?.graph_version
  )
  const saveLayout = useSaveGraphLayout(projectId)
  const nodeDetail = useGraphNode(projectId, selectedNodeId)
  const sourceSubgraph = useSourceSubgraph(
    projectId,
    highlightedSourceId,
    !!highlightedSourceId
  )

  const activeSlice = useMemo(() => {
    if (viewMode === 'queryTrace' && queryRunQuery.data?.slice) {
      return queryRunQuery.data.slice
    }
    return mergedSlice ?? overviewQuery.data ?? null
  }, [viewMode, queryRunQuery.data, mergedSlice, overviewQuery.data])

  useEffect(() => {
    if (overviewQuery.data && !mergedSlice) {
      setMergedSlice(overviewQuery.data)
    }
  }, [overviewQuery.data, mergedSlice])

  // Soft reconcile: merge overview into live slice when graph_version advances
  useEffect(() => {
    if (!overviewQuery.data?.graph_version || !mergedSlice?.graph_version) return
    if (overviewQuery.data.graph_version === mergedSlice.graph_version) return
    setMergedSlice((prev) =>
      mergeSlices(prev ?? undefined, overviewQuery.data!)
    )
  }, [overviewQuery.data, mergedSlice?.graph_version])

  // Live merge when a source KG write finishes
  useEffect(() => {
    if (!lastCompleted) return
    if (lastCompleted.projectId !== projectId) return
    if (lastCompleted.token <= processedLiveTokenRef.current) return
    processedLiveTokenRef.current = lastCompleted.token
    const sourceId = lastCompleted.sourceId

    void (async () => {
      try {
        const slice = await knowledgeGraphApi.sourceSubgraph(sourceId, projectId)
        setMergedSlice((prev) => {
          const base = prev ?? overviewQuery.data ?? undefined
          const merged = mergeSlices(base, slice)
          if (overviewQuery.data?.graph_version) {
            return {
              ...merged,
              graph_version: overviewQuery.data.graph_version,
            }
          }
          return merged
        })
        void queryClient.invalidateQueries({
          queryKey: GRAPH_QUERY_KEYS.overview(projectId),
        })
      } catch {
        void queryClient.invalidateQueries({
          queryKey: GRAPH_QUERY_KEYS.overview(projectId),
        })
      }
    })()
  }, [lastCompleted, projectId, overviewQuery.data, queryClient])

  useEffect(() => {
    if (!activeSlice) return
    const graph = graphRef.current
    const filtered: GraphSliceDTO = {
      ...activeSlice,
      nodes: activeSlice.nodes.filter((n) => enabledKinds.includes(n.kind)),
      edges: activeSlice.edges.filter((e) => {
        const conf = e.confidence
        if (conf != null && conf < minConfidence) return false
        const nodeIds = new Set(
          activeSlice.nodes
            .filter((n) => enabledKinds.includes(n.kind))
            .map((n) => n.id)
        )
        return nodeIds.has(e.source) && nodeIds.has(e.target)
      }),
    }

    const preserve = collectPositions(graph)
    const previousOrder = graph.order
    const { newNodeIds } = syncGraphToSlice(graph, filtered, {
      preservePositions: preserve,
    })
    void newNodeIds

    if (
      !layoutApplied &&
      layoutQuery.data?.layout?.positions &&
      String(layoutQuery.data.layout.graph_version) === activeSlice.graph_version
    ) {
      const saved = layoutQuery.data.layout.positions
      const algorithm = layoutQuery.data.layout.algorithm
      const usable3d =
        algorithm === 'd3-force-3d' &&
        layoutHas3DDepth(saved) &&
        !layoutLooksParametric(saved)

      setLayoutApplied(true)
      if (usable3d) {
        applyPositions(graph, saved)
        setRunLayout(false)
      } else {
        // Flat FA2, missing z, or concentric-ring bug — reseed and run 3D force.
        seedRandomNodePositions(graph)
        setRunLayout(true)
      }
    } else if (!layoutApplied && graph.order > 0 && previousOrder === 0) {
      // Cold load with no saved layout — random seeds + 3D force.
      setRunLayout(true)
    }
    // Incremental merges: new nodes already placed near existing; skip full re-layout

    setGraphRevision((v) => v + 1)
  }, [
    activeSlice,
    enabledKinds,
    minConfidence,
    layoutQuery.data,
    layoutApplied,
  ])

  const highlightIds = useMemo(() => {
    if (!highlightedSourceId || !sourceSubgraph.data) return new Set<string>()
    return new Set(sourceSubgraph.data.nodes.map((n) => n.id))
  }, [highlightedSourceId, sourceSubgraph.data])

  const sources = useMemo(
    () => (overviewQuery.data?.nodes ?? []).filter((n) => n.kind === 'source'),
    [overviewQuery.data]
  )

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId || !activeSlice) return null
    return activeSlice.edges.find((e) => e.id === selectedEdgeId) ?? null
  }, [selectedEdgeId, activeSlice])

  const bumpGraphFromSlice = useCallback((slice: GraphSliceDTO) => {
    setMergedSlice((prev) => mergeSlices(prev ?? undefined, slice))
  }, [])

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
      setFocusNodeId(nodeId)
    },
    [setSelectedNodeId, setSelectedEdgeId, setFocusNodeId]
  )

  const handleSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return
      try {
        const slice = await knowledgeGraphApi.search(projectId, q.trim())
        if (!slice.nodes.length) {
          toast.message(t('knowledge.graphNoResults'))
          return
        }
        bumpGraphFromSlice(slice)
        const first = slice.nodes[0]
        setSelectedNodeId(first.id)
        setFocusNodeId(first.id)
      } catch {
        toast.error(t('knowledge.graphSearchFailed'))
      }
    },
    [projectId, bumpGraphFromSlice, setSelectedNodeId, setFocusNodeId, t]
  )

  const handleLayoutSettled = useCallback(() => {
    setRunLayout(false)
    setLayoutApplied(true)
    const positions = collectPositions(graphRef.current)
    const version = Number(activeSlice?.graph_version || 0)
    saveLayout.mutate({
      positions,
      algorithm: 'd3-force-3d',
      graph_version: version,
    })
  }, [activeSlice?.graph_version, saveLayout])

  const openSource = useCallback(
    (sourceId: string) => {
      router.push(
        `/projects/${encodeURIComponent(projectId)}?modal=source&id=${encodeURIComponent(sourceId)}`
      )
    },
    [router, projectId]
  )

  const isEmpty =
    !overviewQuery.isLoading &&
    !queryRunQuery.isLoading &&
    (!activeSlice || activeSlice.nodes.length === 0)

  const hasSelection = !!selectedNodeId || !!selectedEdgeId
  const [sourcesOpen, setSourcesOpen] = useState(false)

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [setSelectedNodeId, setSelectedEdgeId])

  const toolbar = (
    <GraphToolbar
      layout={embedded ? 'bar' : 'overlay'}
      leading={embedded ? headerLeading : undefined}
      trailing={embedded ? headerTrailing : undefined}
      showSourcesToggle={!embedded}
      sourcesOpen={sourcesOpen}
      onToggleSources={() => setSourcesOpen((v) => !v)}
      onSearch={handleSearch}
      onResetView={() => {
        resetSelection()
        setMergedSlice(overviewQuery.data ?? null)
        seedRandomNodePositions(graphRef.current)
        setLayoutApplied(false)
        setRunLayout(true)
        setGraphRevision((v) => v + 1)
        setCameraCommand({ type: 'reset', token: Date.now() })
      }}
      onFit={() => {
        if (selectedNodeId) {
          setFocusNodeId(selectedNodeId)
        } else {
          setCameraCommand({ type: 'fit', token: Date.now() })
        }
      }}
      updating={projectUpdating}
    />
  )

  const canvasArea = (
    <KnowledgeGraphCanvasArea
      embedded={embedded}
      isEmpty={isEmpty}
      toolbar={toolbar}
      cameraCommand={cameraCommand}
      graph={graphRef.current}
      graphRevision={graphRevision}
      selectedNodeId={selectedNodeId}
      highlightedNodeIds={highlightIds}
      focusNodeId={focusNodeId}
      runLayout={runLayout}
      showLabels={showLabels}
      nodeSizeScale={nodeSizeScale}
      edgeOpacity={edgeOpacity}
      onNodeClick={handleNodeClick}
      onEdgeClick={(edgeId) => {
        setSelectedEdgeId(edgeId)
        setSelectedNodeId(null)
      }}
      onStageClick={clearSelection}
      onLayoutSettled={handleLayoutSettled}
      queryTraceLabel={
        viewMode === 'queryTrace' && queryRunQuery.data?.run
          ? t('knowledge.graphQueryTrace').replace(
              '{query}',
              queryRunQuery.data.run.query
            )
          : null
      }
      sourcesOpen={sourcesOpen}
      onCloseSources={() => setSourcesOpen(false)}
      sources={sources}
      highlightedSourceId={highlightedSourceId}
      onSelectSource={setHighlightedSourceId}
      hasSelection={hasSelection}
      nodeDetailLoading={nodeDetail.isLoading}
      nodeDetail={nodeDetail.data}
      selectedEdge={selectedEdge}
      onCloseSelection={clearSelection}
      onOpenSource={openSource}
      onSelectNeighbor={(id) => {
        setSelectedNodeId(id)
        setFocusNodeId(id)
      }}
    />
  )

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 flex-col overflow-hidden',
        embedded ? 'min-h-[180px]' : 'min-h-[320px]'
      )}
    >
      {canvasArea}
    </div>
  )
}
