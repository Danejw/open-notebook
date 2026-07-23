'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DrawingExtractionRun } from '@/lib/api/drawing-extraction'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface SourceDetailDrawingTabProps {
  run: DrawingExtractionRun
  onInspectResults: () => void
}

export function SourceDetailDrawingTab({
  run,
  onInspectResults,
}: SourceDetailDrawingTabProps) {
  const { t } = useTranslation()
  const itemsExtracted = run.stats?.items_extracted

  return (
    <div className="space-y-2 rounded-md border border-border/60 px-1.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
          {run.status === 'partial'
            ? t('sources.drawingStagePartial')
            : t('sources.drawingStageCompleted')}
        </Badge>
        {run.active ? (
          <Badge className="h-5 px-1.5 text-[11px] font-normal">
            {t('sources.drawingActiveForRetrieval')}
          </Badge>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t('sources.drawingPagesProcessed')
          .replace('{pages}', String(run.drawing_page_count ?? 0))
          .replace('{total}', String(run.page_count ?? 0))}
      </p>
      {typeof itemsExtracted === 'number' ? (
        <p className="text-[11px] text-muted-foreground">
          {t('sources.drawingProgressItems').replace('{count}', String(itemsExtracted))}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{t('sources.drawingResultsReady')}</p>
      <Button size="sm" className="h-7" onClick={onInspectResults}>
        {t('sources.drawingInspectResults')}
      </Button>
    </div>
  )
}
