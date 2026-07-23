'use client'

import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { EmptyState } from '@/components/common/EmptyState'
import { GraphControlsHelp } from '@/components/knowledge-graph/GraphControlsHelp'
import { GraphDetailsPanel } from '@/components/knowledge-graph/GraphDetailsPanel'
import { GraphSourcePanel } from '@/components/knowledge-graph/GraphSourcePanel'
import type {
  GraphEdgeDTO,
  GraphNodeDetailDTO,
  GraphNodeDTO,
} from '@/lib/api/knowledge-graph'
import type { KnowledgeGraphology } from '@/lib/graph/build-graphology-graph'
import { useTranslation } from '@/lib/hooks/use-translation'

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

export interface KnowledgeGraphCanvasAreaProps {
  embedded: boolean
  isEmpty: boolean
  toolbar: ReactNode
  cameraCommand: { type: 'fit' | 'reset'; token: number } | null
  graph: KnowledgeGraphology
  graphRevision: number
  selectedNodeId: string | null
  highlightedNodeIds: Set<string>
  focusNodeId: string | null
  runLayout: boolean
  showLabels: boolean
  nodeSizeScale: number
  edgeOpacity: number
  onNodeClick: (nodeId: string) => void
  onEdgeClick: (edgeId: string) => void
  onStageClick: () => void
  onLayoutSettled: () => void
  queryTraceLabel: string | null
  sourcesOpen: boolean
  onCloseSources: () => void
  sources: GraphNodeDTO[]
  highlightedSourceId: string | null
  onSelectSource: (sourceId: string | null) => void
  hasSelection: boolean
  nodeDetailLoading: boolean
  nodeDetail: GraphNodeDetailDTO | null | undefined
  selectedEdge: GraphEdgeDTO | null
  onCloseSelection: () => void
  onOpenSource: (sourceId: string) => void
  onSelectNeighbor: (id: string) => void
}

export function KnowledgeGraphCanvasArea(props: KnowledgeGraphCanvasAreaProps) {
  const { t } = useTranslation()

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0">
        {props.isEmpty ? (
          <EmptyState
            variant="subtle"
            title={t('knowledge.graphEmpty')}
            className="flex h-full items-center justify-center p-0.5"
            titleClassName="text-[11px]"
          />
        ) : (
          <GraphCanvas
            embedded={props.embedded}
            cameraCommand={props.cameraCommand}
            graph={props.graph}
            graphRevision={props.graphRevision}
            selectedNodeId={props.selectedNodeId}
            highlightedNodeIds={props.highlightedNodeIds}
            focusNodeId={props.focusNodeId}
            runLayout={props.runLayout}
            showLabels={props.showLabels}
            nodeSizeScale={props.nodeSizeScale}
            edgeOpacity={props.edgeOpacity}
            onNodeClick={props.onNodeClick}
            onEdgeClick={props.onEdgeClick}
            onStageClick={props.onStageClick}
            onLayoutSettled={props.onLayoutSettled}
          />
        )}
      </div>

      {props.toolbar}

      {props.queryTraceLabel ? (
        <div className="pointer-events-none absolute inset-x-0 top-9 z-20 flex justify-center p-0.5">
          <div className="max-w-[90%] truncate rounded-md border border-cyan-200/60 bg-cyan-50/90 px-1.5 py-0.5 text-[11px] text-cyan-900 shadow-sm backdrop-blur-sm dark:border-cyan-800/60 dark:bg-cyan-950/90 dark:text-cyan-100">
            {props.queryTraceLabel}
          </div>
        </div>
      ) : null}

      {!props.embedded && props.sourcesOpen ? (
        <div className="pointer-events-none absolute bottom-0 left-0 top-9 z-20 p-0.5">
          <div className="pointer-events-auto h-[calc(100%-0.25rem)]">
            <GraphSourcePanel
              sources={props.sources}
              selectedSourceId={props.highlightedSourceId}
              onSelect={props.onSelectSource}
              onClose={props.onCloseSources}
            />
          </div>
        </div>
      ) : null}

      {props.hasSelection ||
      (props.nodeDetailLoading && !!props.selectedNodeId) ? (
        <div className="pointer-events-none absolute bottom-0 right-0 z-20 p-0.5">
          <div className="pointer-events-auto">
            <GraphDetailsPanel
              compact
              detail={props.nodeDetail}
              loading={props.nodeDetailLoading && !!props.selectedNodeId}
              edgeSummary={
                props.selectedEdge ? edgeToSummary(props.selectedEdge) : null
              }
              onClose={props.onCloseSelection}
              onOpenSource={props.onOpenSource}
              onSelectNeighbor={props.onSelectNeighbor}
            />
          </div>
        </div>
      ) : null}

      <GraphControlsHelp />
    </div>
  )
}
