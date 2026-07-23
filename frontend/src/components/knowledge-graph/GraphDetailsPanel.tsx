'use client'

import { FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { GraphNodeDetailDTO } from '@/lib/api/knowledge-graph'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface GraphDetailsPanelProps {
  detail?: GraphNodeDetailDTO | null
  loading?: boolean
  edgeSummary?: {
    id: string
    relation: string
    source: string
    target: string
    evidenceCount: number
    confidence?: number | null
  } | null
  onOpenSource?: (sourceId: string) => void
  onSelectNeighbor?: (nodeId: string) => void
  /** Dismiss selection overlay. */
  onClose?: () => void
  /** Compact evidence/description for overlay cards. */
  compact?: boolean
  className?: string
}

export function GraphDetailsPanel({
  detail,
  loading,
  edgeSummary,
  onOpenSource,
  onSelectNeighbor,
  onClose,
  compact = true,
  className,
}: GraphDetailsPanelProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex max-h-[min(40%,16rem)] w-[min(100%,18rem)] flex-col overflow-hidden rounded-md border bg-background/90 shadow-md backdrop-blur-sm',
        className
      )}
      data-testid="knowledge-graph-details"
    >
      <div className="flex items-center gap-0.5 border-b px-0.5 py-0.5">
        <p className="min-w-0 flex-1 truncate px-0.5 text-[11px] font-medium text-muted-foreground">
          {edgeSummary
            ? t('knowledge.graphEdgeDetails')
            : detail?.kind ?? t('knowledge.graphLoading')}
        </p>
        {onClose ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-0.5 text-[11px] text-muted-foreground">
          {t('knowledge.graphLoading')}
        </div>
      ) : edgeSummary ? (
        <div className="flex flex-col gap-0.5 p-0.5">
          <p className="truncate text-sm font-medium">{edgeSummary.relation}</p>
          <p className="text-[11px] text-muted-foreground">
            {edgeSummary.confidence != null
              ? `${edgeSummary.confidence} · `
              : ''}
            {edgeSummary.evidenceCount} {t('knowledge.graphEvidence').toLowerCase()}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {edgeSummary.source} → {edgeSummary.target}
          </p>
        </div>
      ) : detail ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 p-0.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight">
                {detail.label}
              </p>
              <p className="truncate text-[11px] capitalize text-muted-foreground">
                {detail.kind}
                {detail.subtype ? ` · ${detail.subtype}` : ''}
                {` · ${t('knowledge.graphDegree')} ${detail.degree}`}
                {` · ${t('knowledge.graphSourceCount')} ${detail.source_count}`}
                {detail.confidence != null ? ` · ${detail.confidence}` : ''}
              </p>
              {detail.description && !compact ? (
                <p className="mt-0.5 line-clamp-3 text-[11px] text-muted-foreground">
                  {detail.description}
                </p>
              ) : null}
            </div>

            {detail.aliases?.length > 0 ? (
              <p className="truncate text-[11px] text-muted-foreground">
                {t('knowledge.graphAliases')}: {detail.aliases.join(', ')}
              </p>
            ) : null}

            {Object.keys(detail.relation_counts || {}).length > 0 ? (
              <div className="divide-y">
                <p className="py-0.5 text-[11px] font-medium">
                  {t('knowledge.graphRelations')}
                </p>
                <ul className="divide-y">
                  {Object.entries(detail.relation_counts).map(([rel, count]) => (
                    <li
                      key={rel}
                      className="flex justify-between gap-0.5 py-0.5 text-[11px]"
                    >
                      <span className="truncate">{rel}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {detail.neighbors?.length > 0 ? (
              <div>
                <p className="py-0.5 text-[11px] font-medium">
                  {t('knowledge.graphNeighbors')}
                </p>
                <ul className="divide-y">
                  {detail.neighbors.map((n) => (
                    <li key={`${n.id}-${n.relation}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto min-h-7 w-full justify-start gap-0.5 rounded-none px-0.5 py-0.5 text-left text-[11px] font-normal hover:bg-muted"
                        onClick={() => onSelectNeighbor?.(n.id)}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {n.label}
                        </span>
                        {n.relation ? (
                          <span className="shrink-0 text-muted-foreground">
                            {n.relation}
                          </span>
                        ) : null}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <p className="py-0.5 text-[11px] font-medium">
                {t('knowledge.graphEvidence')}
              </p>
              {detail.evidence?.length ? (
                <ul className="divide-y">
                  {detail.evidence.map((ev, idx) => (
                    <li
                      key={`${ev.chunk_id ?? ev.source_id ?? idx}`}
                      className="flex gap-0.5 py-0.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-h-7 items-center gap-0.5">
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                            {ev.source_title ||
                              ev.source_id ||
                              t('knowledge.graphEvidence')}
                          </span>
                          {ev.source_id ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 shrink-0"
                              aria-label={t('knowledge.graphSources')}
                              onClick={() => onOpenSource?.(ev.source_id!)}
                            >
                              <FileText className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                        {ev.chunk_order != null ? (
                          <p className="text-[11px] text-muted-foreground">
                            {t('knowledge.graphChunk').replace(
                              '{order}',
                              String(ev.chunk_order)
                            )}
                          </p>
                        ) : null}
                        {ev.snippet ? (
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">
                            {ev.snippet}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-0.5 text-[11px] text-muted-foreground">
                  {t('knowledge.graphNoEvidence')}
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      ) : null}
    </div>
  )
}
