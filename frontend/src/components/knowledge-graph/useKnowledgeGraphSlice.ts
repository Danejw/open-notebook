'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  useGraphOverview,
  useGraphQueryRun,
  useSaveGraphLayout,
  useSourceSubgraph,
} from '@/lib/hooks/useKnowledgeGraph'
import { useGraphLiveStore } from '@/lib/stores/graph-live-store'
import { useKnowledgeGraphStore } from '@/lib/stores/knowledge-graph-store'

/**
 * Owns graph slice merge, live updates, layout seeding, and graphology sync.
 */
export function useKnowledgeGraphSlice(projectId: string) {
  const queryClient = useQueryClient()
  const {
    selectedEdgeId,
    highlightedSourceId,
    enabledKinds,
    minConfidence,
    queryRunId,
    viewMode,
  } = useKnowledgeGraphStore()

  const [mergedSlice, setMergedSlice] = useState<GraphSliceDTO | null>(null)
  const [runLayout, setRunLayout] = useState(false)
  const [layoutApplied, setLayoutApplied] = useState(false)
  const graphRef = useRef(createEmptyGraph())
  const [graphRevision, setGraphRevision] = useState(0)
  const processedLiveTokenRef = useRef(0)

  const lastCompleted = useGraphLiveStore((s) => s.lastCompleted)
  const projectUpdating = useGraphLiveStore((s) =>
    s.isProjectUpdating(projectId)
  )

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

  useEffect(() => {
    if (!overviewQuery.data?.graph_version || !mergedSlice?.graph_version) return
    if (overviewQuery.data.graph_version === mergedSlice.graph_version) return
    setMergedSlice((prev) =>
      mergeSlices(prev ?? undefined, overviewQuery.data!)
    )
  }, [overviewQuery.data, mergedSlice?.graph_version])

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
        seedRandomNodePositions(graph)
        setRunLayout(true)
      }
    } else if (!layoutApplied && graph.order > 0 && previousOrder === 0) {
      setRunLayout(true)
    }

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

  const resetGraphView = useCallback(() => {
    setMergedSlice(overviewQuery.data ?? null)
    seedRandomNodePositions(graphRef.current)
    setLayoutApplied(false)
    setRunLayout(true)
    setGraphRevision((v) => v + 1)
  }, [overviewQuery.data])

  const isEmpty =
    !overviewQuery.isLoading &&
    !queryRunQuery.isLoading &&
    (!activeSlice || activeSlice.nodes.length === 0)

  return {
    graphRef,
    graphRevision,
    setGraphRevision,
    runLayout,
    setRunLayout,
    setLayoutApplied,
    projectUpdating,
    overviewQuery,
    queryRunQuery,
    activeSlice,
    highlightIds,
    sources,
    selectedEdge,
    bumpGraphFromSlice,
    handleLayoutSettled,
    resetGraphView,
    isEmpty,
  }
}
