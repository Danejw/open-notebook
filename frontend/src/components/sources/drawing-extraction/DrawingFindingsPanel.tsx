'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { useTranslation } from '@/lib/hooks/use-translation'
import { DrawingActionBar } from '@/components/sources/drawing-extraction/DrawingActionBar'
import { formatBand } from '@/components/sources/drawing-extraction/drawingExtractionUtils'

export type DrawingFindingsPanelProps = {
  pageItems: Array<Record<string, unknown>>
  itemsExtracted: number
  typeEntries: Array<[string, number]>
  showRaw: boolean
  activePage: Record<string, unknown> | undefined
  runStats: Record<string, unknown> | undefined
  inProgress: boolean
  isActive: boolean
  retryPending: boolean
  activatePending: boolean
  onRetry: () => void
  onActivate: () => void
  onToggleRaw: () => void
}

export function DrawingFindingsPanel({
  pageItems,
  itemsExtracted,
  typeEntries,
  showRaw,
  activePage,
  runStats,
  inProgress,
  isActive,
  retryPending,
  activatePending,
  onRetry,
  onActivate,
  onToggleRaw,
}: DrawingFindingsPanelProps) {
  const { t } = useTranslation()

  const summary = (
    <span className="mr-auto text-[11px] text-muted-foreground">
      {pageItems.length} / {itemsExtracted}
      {typeEntries.length > 0
        ? ` · ${typeEntries
            .slice(0, 4)
            .map(([type, count]) => `${type} ${count}`)
            .join(' · ')}${
            typeEntries.length > 4 ? ` · +${typeEntries.length - 4}` : ''
          }`
        : ''}
    </span>
  )

  return (
    <div className="flex min-h-0 flex-col">
      <DrawingActionBar
        inProgress={inProgress}
        isActive={isActive}
        showActivate
        showRaw={showRaw}
        retryPending={retryPending}
        activatePending={activatePending}
        onRetry={onRetry}
        onActivate={onActivate}
        onToggleRaw={onToggleRaw}
        leading={summary}
      />

      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="px-1.5 py-1">
          {showRaw ? (
            <pre className="overflow-auto rounded bg-muted p-1.5 text-[10px] leading-snug">
              {JSON.stringify(
                {
                  classification: activePage?.classification,
                  sheet_metadata: activePage?.sheet_metadata,
                  stats: runStats,
                  items: pageItems,
                },
                null,
                2
              )}
            </pre>
          ) : pageItems.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">
              {t('sources.drawingNoItems')}
            </p>
          ) : (
            <ul className="divide-y">
              {pageItems.map((item) => {
                const band = formatBand(item.confidence_band)
                const label = String(item.label || item.stable_id || '')
                const type = String(item.item_type || '')
                const raw = item.raw_text ? String(item.raw_text).trim() : ''
                return (
                  <li key={String(item.id || item.stable_id)} className="py-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-snug">
                        {label}
                      </span>
                      {band ? (
                        <span className="shrink-0 text-[11px] capitalize text-muted-foreground">
                          {band}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {type}
                    </div>
                    {raw && raw !== label ? (
                      <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
                        {raw}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
