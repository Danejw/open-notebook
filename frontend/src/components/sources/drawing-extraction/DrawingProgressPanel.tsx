'use client'

import { Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import {
  PIPELINE_STAGES,
  stageLabelKey,
} from '@/components/sources/drawing-extraction/drawingExtractionUtils'

export type DrawingProgressPanelProps = {
  status: string
  percent: number
  pageCount: number
  pagesProcessed: number
  drawingPagesFound: number
  currentSheet: string | null
  currentPageIndex: number
  hasPages: boolean
}

export function DrawingProgressPanel({
  status,
  percent,
  pageCount,
  pagesProcessed,
  drawingPagesFound,
  currentSheet,
  currentPageIndex,
  hasPages,
}: DrawingProgressPanelProps) {
  const { t } = useTranslation()
  const currentIndex = PIPELINE_STAGES.indexOf(
    status as (typeof PIPELINE_STAGES)[number]
  )

  return (
    <div className="shrink-0 space-y-1 border-b bg-muted/30 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Progress value={percent} className="h-1.5 flex-1" />
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
          {percent}%
        </span>
      </div>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {PIPELINE_STAGES.map((stage, stageIndex) => {
          const done = currentIndex > stageIndex
          const current = status === stage
          const label = t(stageLabelKey(stage))
          return (
            <li
              key={stage}
              title={label}
              className={cn(
                'inline-flex max-w-[11rem] items-center gap-1 text-[11px]',
                done && 'text-foreground',
                current && 'font-medium text-foreground',
                !done && !current && 'text-muted-foreground'
              )}
            >
              {current ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    done ? 'bg-primary' : 'bg-muted-foreground/40'
                  )}
                />
              )}
              <span className="truncate">{label}</span>
              {stageIndex < PIPELINE_STAGES.length - 1 ? (
                <span className="text-muted-foreground/40" aria-hidden>
                  ·
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        {pageCount > 0 ? (
          <span>
            {t('sources.drawingProgressPages')
              .replace('{done}', String(pagesProcessed))
              .replace('{total}', String(pageCount))}
          </span>
        ) : null}
        <span>
          {t('sources.drawingProgressDrawings').replace(
            '{count}',
            String(drawingPagesFound)
          )}
        </span>
        {currentSheet ? (
          <span>
            {t('sources.drawingProgressCurrentSheet').replace(
              '{sheet}',
              currentSheet
            )}
          </span>
        ) : currentPageIndex >= 0 ? (
          <span>
            {t('sources.drawingProgressCurrentPage').replace(
              '{page}',
              String(currentPageIndex + 1)
            )}
          </span>
        ) : null}
      </div>
      {status === 'queued' || !hasPages ? (
        <p className="text-[11px] text-muted-foreground">
          {status === 'queued'
            ? t('sources.drawingProgressWaiting')
            : t('sources.drawingProgressHint')}
        </p>
      ) : null}
    </div>
  )
}
