'use client'

import dynamic from 'next/dynamic'
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
import { GraphControlsHelp } from '@/components/knowledge-graph/GraphControlsHelp'
import { GraphDetailsPanel } from '@/components/knowledge-graph/GraphDetailsPanel'
import { GraphSourcePanel } from '@/components/knowledge-graph/GraphSourcePanel'
import { GraphToolbar } from '@/components/knowledge-graph/GraphToolbar'
import {
  knowledgeGraphApi,
  type GraphEdgeDTO,
  type GraphSliceDTO,
} from '@/lib/api/knowledge-graph'
import {
  applyPositions,
  collectPositions,
  createEmptyGraph,
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

const GraphCanvas = dynamic(
  () =>
    import('@/components/knowledge-graph/GraphCanvas').then((m) => ({
      default: m.GraphCanvas,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
        Loading graph…
      </div>
    ),
  }
)

interface KnowledgeGraphViewProps {
  projectId: string
  /** Stacked layout for embedding in the Sources column (no source sidebar). */
  embedded?: boolean
  /** Trailing header actions when embedded (view tabs, Add Source, collapse). */
  headerTrailing?: ReactNode
}

export function KnowledgeGraphView({
  projectId,
  embedded = false,
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
    enabledKinds,
    minConfidence,
    pathPick,
    setPathPick,
    pathFromId,
    setPathFromId,
    pathToId,
    setPathToId,
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
      applyPositions(graph, layoutQuery.data.layout.positions)
      setLayoutApplied(true)
      setRunLayout(false)
    } else if (!layoutApplied && graph.order > 0 && previousOrder === 0) {
      // Cold load with no saved layout
      setRunLayout(true)
    }
    // Incremental merges: new nodes already placed near existing; skip FA2 to keep camera

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
      if (pathPick === 'pickFrom') {
        setPathFromId(nodeId)
        setPathPick('pickTo')
        toast.message(t('knowledge.graphPickTo'))
        return
      }
      if (pathPick === 'pickTo') {
        setPathToId(nodeId)
        setPathPick('idle')
        void (async () => {
          try {
            const fromId = pathFromId
            if (!fromId) return
            const slice = await knowledgeGraphApi.paths(projectId, fromId, nodeId)
            bumpGraphFromSlice(slice)
            setSelectedNodeId(nodeId)
            setFocusNodeId(nodeId)
          } catch {
            toast.error(t('knowledge.graphPathFailed'))
          }
        })()
        return
      }
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
    },
    [
      pathPick,
      pathFromId,
      projectId,
      setPathFromId,
      setPathPick,
      setPathToId,
      setSelectedNodeId,
      setSelectedEdgeId,
      setFocusNodeId,
      bumpGraphFromSlice,
      t,
    ]
  )

  const handleExpand = useCallback(async () => {
    if (!selectedNodeId) {
      toast.message(t('knowledge.graphSelectNode'))
      return
    }
    try {
      const kinds = provenanceMode
        ? 'entity,community,source,chunk,claim'
        : enabledKinds.join(',')
      const slice = await knowledgeGraphApi.getNeighbors(
        selectedNodeId,
        projectId,
        {
          depth: 1,
          node_kinds: kinds,
          min_confidence: minConfidence,
          limit: 60,
        }
      )
      bumpGraphFromSlice(slice)
    } catch {
      toast.error(t('knowledge.graphExpandFailed'))
    }
  }, [
    selectedNodeId,
    projectId,
    provenanceMode,
    enabledKinds,
    minConfidence,
    bumpGraphFromSlice,
    t,
  ])

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
      algorithm: 'forceatlas2',
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
      trailing={embedded ? headerTrailing : undefined}
      showSourcesToggle={!embedded}
      sourcesOpen={sourcesOpen}
      onToggleSources={() => setSourcesOpen((v) => !v)}
      onSearch={handleSearch}
      onExpand={handleExpand}
      onFindPath={() => {
        setPathPick('pickFrom')
        toast.message(t('knowledge.graphPickFrom'))
      }}
      onResetView={() => {
        resetSelection()
        setMergedSlice(overviewQuery.data ?? null)
        setLayoutApplied(false)
        setRunLayout(true)
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
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center p-0.5 text-center text-[11px] text-muted-foreground">
            {t('knowledge.graphEmpty')}
          </div>
        ) : (
          <GraphCanvas
            embedded={embedded}
            cameraCommand={cameraCommand}
            graph={graphRef.current}
            graphRevision={graphRevision}
            selectedNodeId={selectedNodeId}
            highlightedNodeIds={highlightIds}
            focusNodeId={focusNodeId}
            runLayout={runLayout}
            showLabels={showLabels}
            nodeSizeScale={nodeSizeScale}
            onNodeClick={handleNodeClick}
            onEdgeClick={(edgeId) => {
              setSelectedEdgeId(edgeId)
              setSelectedNodeId(null)
            }}
            onStageClick={clearSelection}
            onLayoutSettled={handleLayoutSettled}
          />
        )}
      </div>

      {!embedded ? toolbar : null}

      {viewMode === 'queryTrace' && queryRunQuery.data?.run ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 z-20 flex justify-center p-0.5',
            embedded ? 'top-0' : 'top-9'
          )}
        >
          <div className="max-w-[90%] truncate rounded-md border border-cyan-200/60 bg-cyan-50/90 px-1.5 py-0.5 text-[11px] text-cyan-900 shadow-sm backdrop-blur-sm dark:border-cyan-800/60 dark:bg-cyan-950/90 dark:text-cyan-100">
            {t('knowledge.graphQueryTrace').replace(
              '{query}',
              queryRunQuery.data.run.query
            )}
          </div>
        </div>
      ) : null}

      {/* Full-page sources drawer overlay (hidden in embedded) */}
      {!embedded && sourcesOpen ? (
        <div className="pointer-events-none absolute bottom-0 left-0 top-9 z-20 p-0.5">
          <div className="pointer-events-auto h-[calc(100%-0.25rem)]">
            <GraphSourcePanel
              sources={sources}
              selectedSourceId={highlightedSourceId}
              onSelect={setHighlightedSourceId}
              onClose={() => setSourcesOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Selection detail overlay — only when something is selected */}
      {hasSelection || (nodeDetail.isLoading && !!selectedNodeId) ? (
        <div className="pointer-events-none absolute bottom-0 right-0 z-20 p-0.5">
          <div className="pointer-events-auto">
            <GraphDetailsPanel
              compact
              detail={nodeDetail.data}
              loading={nodeDetail.isLoading && !!selectedNodeId}
              edgeSummary={selectedEdge ? edgeToSummary(selectedEdge) : null}
              onClose={clearSelection}
              onOpenSource={openSource}
              onSelectNeighbor={(id) => {
                setSelectedNodeId(id)
                setFocusNodeId(id)
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Gesture help — bottom-left HUD; collapsed by default */}
      <GraphControlsHelp />
    </div>
  )

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden',
        embedded ? 'min-h-[180px]' : 'min-h-[320px]'
      )}
    >
      {embedded ? toolbar : null}
      {canvasArea}
    </div>
  )
}

function edgeToSummary(edge: GraphEdgeDTO) {
  return {
    id: edge.id,
    relation: edge.relation,
    source: edge.source,
    target: edge.target,
    evidenceCount: edge.evidence_count,
    confidence: edge.confidence,
  }
}
