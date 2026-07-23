'use client'

import { Button } from '@/components/ui/button'
import type { DrawingExtractionRun } from '@/lib/api/drawing-extraction'
import { useTranslation } from '@/lib/hooks/use-translation'

export type DrawingEmptyResultsProps = {
  run: DrawingExtractionRun
  showRaw: boolean
  retryPending: boolean
  onRetry: () => void
  onToggleRaw: () => void
}

export function DrawingEmptyResults({
  run,
  showRaw,
  retryPending,
  onRetry,
  onToggleRaw,
}: DrawingEmptyResultsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 py-6">
      <p className="text-[11px] text-muted-foreground">
        {t('sources.drawingNoItems')}
      </p>
      <div className="flex gap-0.5">
        <Button
          size="sm"
          variant="outline"
          disabled={retryPending}
          onClick={onRetry}
        >
          {t('sources.drawingRetry')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggleRaw}>
          {showRaw ? t('sources.drawingHideRaw') : t('sources.drawingShowRaw')}
        </Button>
      </div>
      {showRaw ? (
        <pre className="mt-1 max-h-48 w-full overflow-auto rounded bg-muted p-1.5 text-[10px]">
          {JSON.stringify(run, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}
