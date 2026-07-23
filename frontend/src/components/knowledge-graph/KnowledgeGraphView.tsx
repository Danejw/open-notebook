'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { GraphToolbar } from '@/components/knowledge-graph/GraphToolbar'
import { KnowledgeGraphCanvasArea } from '@/components/knowledge-graph/KnowledgeGraphCanvasArea'
import { useKnowledgeGraphSlice } from '@/components/knowledge-graph/useKnowledgeGraphSlice'
import { knowledgeGraphApi } from '@/lib/api/knowledge-graph'
import { useGraphNode } from '@/lib/hooks/useKnowledgeGraph'
import { useTranslation } from '@/lib/hooks/use-translation'
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
  const searchParams = useSearchParams()
  const runParam = searchParams.get('run')

  const {
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    highlightedSourceId,
    setHighlightedSourceId,
    showLabels,
    nodeSizeScale,
    edgeOpacity,
    focusNodeId,
    setFocusNodeId,
    setQueryRunId,
    viewMode,
    resetSelection,
  } = useKnowledgeGraphStore()

  const slice = useKnowledgeGraphSlice(projectId)
  const nodeDetail = useGraphNode(projectId, selectedNodeId)

  const [cameraCommand, setCameraCommand] = useState<{
    type: 'fit' | 'reset'
    token: number
  } | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  useEffect(() => {
    if (runParam) setQueryRunId(runParam)
  }, [runParam, setQueryRunId])

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
        const result = await knowledgeGraphApi.search(projectId, q.trim())
        if (!result.nodes.length) {
          toast.message(t('knowledge.graphNoResults'))
          return
        }
        slice.bumpGraphFromSlice(result)
        const first = result.nodes[0]
        setSelectedNodeId(first.id)
        setFocusNodeId(first.id)
      } catch {
        toast.error(t('knowledge.graphSearchFailed'))
      }
    },
    [projectId, slice.bumpGraphFromSlice, setSelectedNodeId, setFocusNodeId, t]
  )

  const openSource = useCallback(
    (sourceId: string) => {
      router.push(
        `/projects/${encodeURIComponent(projectId)}?modal=source&id=${encodeURIComponent(sourceId)}`
      )
    },
    [router, projectId]
  )

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [setSelectedNodeId, setSelectedEdgeId])

  const hasSelection = !!selectedNodeId || !!selectedEdgeId

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
        slice.resetGraphView()
        setCameraCommand({ type: 'reset', token: Date.now() })
      }}
      onFit={() => {
        if (selectedNodeId) {
          setFocusNodeId(selectedNodeId)
        } else {
          setCameraCommand({ type: 'fit', token: Date.now() })
        }
      }}
      updating={slice.projectUpdating}
    />
  )

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 flex-col overflow-hidden',
        embedded ? 'min-h-[180px]' : 'min-h-[320px]'
      )}
    >
      <KnowledgeGraphCanvasArea
        embedded={embedded}
        isEmpty={slice.isEmpty}
        toolbar={toolbar}
        cameraCommand={cameraCommand}
        graph={slice.graphRef.current}
        graphRevision={slice.graphRevision}
        selectedNodeId={selectedNodeId}
        highlightedNodeIds={slice.highlightIds}
        focusNodeId={focusNodeId}
        runLayout={slice.runLayout}
        showLabels={showLabels}
        nodeSizeScale={nodeSizeScale}
        edgeOpacity={edgeOpacity}
        onNodeClick={handleNodeClick}
        onEdgeClick={(edgeId) => {
          setSelectedEdgeId(edgeId)
          setSelectedNodeId(null)
        }}
        onStageClick={clearSelection}
        onLayoutSettled={slice.handleLayoutSettled}
        queryTraceLabel={
          viewMode === 'queryTrace' && slice.queryRunQuery.data?.run
            ? t('knowledge.graphQueryTrace').replace(
                '{query}',
                slice.queryRunQuery.data.run.query
              )
            : null
        }
        sourcesOpen={sourcesOpen}
        onCloseSources={() => setSourcesOpen(false)}
        sources={slice.sources}
        highlightedSourceId={highlightedSourceId}
        onSelectSource={setHighlightedSourceId}
        hasSelection={hasSelection}
        nodeDetailLoading={nodeDetail.isLoading}
        nodeDetail={nodeDetail.data}
        selectedEdge={slice.selectedEdge}
        onCloseSelection={clearSelection}
        onOpenSource={openSource}
        onSelectNeighbor={(id) => {
          setSelectedNodeId(id)
          setFocusNodeId(id)
        }}
      />
    </div>
  )
}
