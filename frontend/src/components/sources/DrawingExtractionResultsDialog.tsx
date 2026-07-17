'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PanZoomViewport } from '@/components/ui/pan-zoom-viewport'
import { drawingExtractionApi } from '@/lib/api/drawing-extraction'
import {
  useActivateDrawingRun,
  useDrawingRun,
  useRetryDrawingRun,
} from '@/lib/hooks/use-drawing-extraction'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

type DrawingExtractionResultsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  runId: string | null
  projectId?: string
}

const IN_PROGRESS_STATUSES = [
  'queued',
  'inspecting',
  'extracting',
  'validating',
  'publishing',
] as const

const PIPELINE_STAGES = [
  'queued',
  'inspecting',
  'extracting',
  'validating',
  'publishing',
] as const

type InProgressStatus = (typeof IN_PROGRESS_STATUSES)[number]

function countByType(items: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const type = String(item.item_type || 'unknown')
    counts[type] = (counts[type] || 0) + 1
  }
  return counts
}

function isInProgressStatus(status: string | undefined): status is InProgressStatus {
  return Boolean(
    status && (IN_PROGRESS_STATUSES as readonly string[]).includes(status)
  )
}

function stageLabelKey(status: string): string {
  switch (status) {
    case 'queued':
      return 'sources.drawingStageQueued'
    case 'inspecting':
      return 'sources.drawingStageInspecting'
    case 'extracting':
      return 'sources.drawingStageExtracting'
    case 'validating':
      return 'sources.drawingStageValidating'
    case 'publishing':
      return 'sources.drawingStagePublishing'
    case 'completed':
      return 'sources.drawingStageCompleted'
    case 'partial':
      return 'sources.drawingStagePartial'
    case 'failed':
      return 'sources.drawingStageFailed'
    case 'skipped':
      return 'sources.drawingStageSkipped'
    default:
      return 'sources.drawingStageExtracting'
  }
}

function progressPercent(
  status: string | undefined,
  pagesProcessed: number,
  pageCount: number
): number {
  switch (status) {
    case 'queued':
      return 4
    case 'inspecting':
      return 10
    case 'extracting': {
      if (pageCount <= 0) return 18
      const ratio = Math.min(1, Math.max(0, pagesProcessed / pageCount))
      return Math.round(18 + ratio * 62)
    }
    case 'validating':
      return 84
    case 'publishing':
      return 92
    case 'completed':
    case 'partial':
      return 100
    case 'failed':
    case 'skipped':
      return 100
    default:
      return 8
  }
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function showStatusBadge(status: string | undefined): boolean {
  if (!status) return false
  if (status === 'completed') return false
  return true
}

function formatBand(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.replace(/_/g, ' ')
}

function pageLabel(page: Record<string, unknown>): string {
  const sheet = page.sheet_number
  if (typeof sheet === 'string' && sheet.trim()) return sheet.trim()
  const index = asNumber(page.page_index, 0)
  return `Page ${index + 1}`
}

function useAuthenticatedPageImage(
  runId: string | null | undefined,
  pageId: string | null
): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    if (!runId || !pageId) {
      setUrl(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setUrl(null)

    void drawingExtractionApi
      .fetchPageImage(runId, pageId, 'render')
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [runId, pageId])

  return { url, loading }
}

export function DrawingExtractionResultsDialog({
  open,
  onOpenChange,
  runId,
  projectId,
}: DrawingExtractionResultsDialogProps) {
  const { t } = useTranslation()
  const { data, isLoading, isFetching } = useDrawingRun(runId ?? undefined)
  const activateRun = useActivateDrawingRun(projectId)
  const retryRun = useRetryDrawingRun(projectId)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  const run = data?.run
  const pages = data?.pages ?? []
  const items = data?.items ?? []
  const counts = useMemo(() => countByType(items), [items])
  const stats = run?.stats ?? {}

  const inProgress = isInProgressStatus(run?.status)
  const pagesProcessed = Math.max(
    asNumber(stats.pages_processed, pages.length),
    pages.length
  )
  const pageCount = Math.max(
    asNumber(stats.page_count, run?.page_count ?? 0),
    run?.page_count ?? 0,
    pages.length
  )
  const drawingPagesFound = Math.max(
    asNumber(stats.drawing_pages_found, run?.drawing_page_count ?? 0),
    run?.drawing_page_count ?? 0,
    pages.filter((page) => Boolean(page.is_drawing)).length
  )
  const itemsExtracted = Math.max(asNumber(stats.items_extracted, items.length), items.length)
  const currentPageIndex = asNumber(stats.current_page_index, -1)
  const currentSheet =
    typeof stats.current_sheet === 'string' && stats.current_sheet.trim()
      ? stats.current_sheet.trim()
      : null
  const percent = progressPercent(run?.status, pagesProcessed, pageCount)

  const activePageId = selectedPageId || (pages[0] ? String(pages[0].id) : null)
  const pageItems = useMemo(
    () => items.filter((item) => String(item.page_id) === activePageId),
    [items, activePageId]
  )
  const activePage = pages.find((p) => String(p.id) === activePageId)
  const hasPages = pages.length > 0
  const typeEntries = Object.entries(counts).sort((a, b) => b[1] - a[1])

  const { url: pageImageUrl, loading: pageImageLoading } = useAuthenticatedPageImage(
    open ? runId : null,
    activePageId
  )

  useEffect(() => {
    setImageSize({ width: 0, height: 0 })
  }, [pageImageUrl])

  const sheetTitle = activePage
    ? [pageLabel(activePage), String(activePage.sheet_title || '').trim()]
        .filter(Boolean)
        .join(' · ')
    : t('sources.drawingResultsTitle')

  const showInitialLoading = Boolean(runId) && isLoading && !run

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[90vh] max-h-[90vh] w-full max-w-none flex-col overflow-hidden rounded-none border-x-0 p-0 sm:max-w-none"
      >
        <DialogHeader className="border-b px-2 py-1.5 pr-10">
          <DialogTitle className="truncate">{sheetTitle}</DialogTitle>
          {run ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
              {showStatusBadge(run.status) ? (
                <Badge
                  variant={inProgress ? 'secondary' : 'outline'}
                  className="h-5 px-1.5 text-[11px] font-normal text-foreground"
                >
                  {t(stageLabelKey(run.status))}
                </Badge>
              ) : null}
              {run.active ? (
                <Badge className="h-5 px-1.5 text-[11px] font-normal">
                  {t('sources.drawingActiveForRetrieval')}
                </Badge>
              ) : null}
              <span>
                {t('sources.drawingProgressItems').replace(
                  '{count}',
                  String(itemsExtracted)
                )}
              </span>
              {!inProgress ? (
                <span>
                  {t('sources.drawingPagesProcessed')
                    .replace('{pages}', String(run.drawing_page_count ?? pages.length))
                    .replace('{total}', String(run.page_count ?? pages.length))}
                </span>
              ) : null}
              {run.extraction_model ? <span>{run.extraction_model}</span> : null}
              {isFetching ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('sources.drawingProgressRefreshing')}
                </span>
              ) : null}
            </div>
          ) : null}
        </DialogHeader>

        {showInitialLoading ? (
          <div className="flex flex-1 items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('common.loading')}
          </div>
        ) : !run ? (
          <p className="px-2 py-2 text-[11px] text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {inProgress ? (
              <div className="shrink-0 space-y-1 border-b bg-muted/30 px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <Progress value={percent} className="h-1.5 flex-1" />
                  <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                    {percent}%
                  </span>
                </div>
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {PIPELINE_STAGES.map((stage, stageIndex) => {
                    const currentIndex = PIPELINE_STAGES.indexOf(
                      run.status as (typeof PIPELINE_STAGES)[number]
                    )
                    const done = currentIndex > stageIndex
                    const current = run.status === stage
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
                {run.status === 'queued' || !hasPages ? (
                  <p className="text-[11px] text-muted-foreground">
                    {run.status === 'queued'
                      ? t('sources.drawingProgressWaiting')
                      : t('sources.drawingProgressHint')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {(run.errors?.length || 0) > 0 ? (
              <div className="shrink-0 border-b border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px]">
                {t('sources.drawingWarnings')}: {JSON.stringify(run.errors)}
              </div>
            ) : null}

            {hasPages ? (
              <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                {/* Sheet preview */}
                <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
                  {pages.length > 1 ? (
                    <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b px-1 py-0.5">
                      {pages.map((page) => {
                        const id = String(page.id)
                        return (
                          <button
                            key={id}
                            type="button"
                            className={cn(
                              'h-7 shrink-0 rounded px-1.5 text-[11px] hover:bg-muted',
                              activePageId === id && 'bg-muted font-medium'
                            )}
                            onClick={() => setSelectedPageId(id)}
                          >
                            {pageLabel(page)}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  <div className="relative min-h-[240px] flex-1 bg-muted/40 md:min-h-0">
                    {pageImageLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('common.loading')}
                      </div>
                    ) : pageImageUrl ? (
                      <>
                        {imageSize.width === 0 ? (
                          <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t('common.loading')}
                          </div>
                        ) : (
                          <PanZoomViewport
                            className="absolute inset-0"
                            contentWidth={imageSize.width}
                            contentHeight={imageSize.height}
                            resetKey={pageImageUrl}
                            aria-label={sheetTitle}
                            title={sheetTitle}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL */}
                            <img
                              src={pageImageUrl}
                              alt={sheetTitle}
                              draggable={false}
                              className="pointer-events-none block max-w-none"
                              style={{
                                width: imageSize.width,
                                height: imageSize.height,
                              }}
                            />
                          </PanZoomViewport>
                        )}
                        {/* Measure natural size without affecting layout */}
                        {imageSize.width === 0 ? (
                          // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL
                          <img
                            src={pageImageUrl}
                            alt=""
                            aria-hidden
                            className="pointer-events-none absolute h-px w-px opacity-0"
                            onLoad={(event) => {
                              const img = event.currentTarget
                              setImageSize({
                                width: img.naturalWidth,
                                height: img.naturalHeight,
                              })
                            }}
                          />
                        ) : null}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center px-2">
                        <p className="text-center text-[11px] text-muted-foreground">
                          {t('sources.drawingMissing')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Findings */}
                <div className="flex min-h-0 flex-col">
                  <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
                    <span className="mr-auto text-[11px] text-muted-foreground">
                      {pageItems.length} / {itemsExtracted}
                      {typeEntries.length > 0
                        ? ` · ${typeEntries
                            .slice(0, 4)
                            .map(([type, count]) => `${type} ${count}`)
                            .join(' · ')}${
                            typeEntries.length > 4
                              ? ` · +${typeEntries.length - 4}`
                              : ''
                          }`
                        : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retryRun.isPending || inProgress}
                      onClick={() => runId && retryRun.mutate(runId)}
                    >
                      {t('sources.drawingRetry')}
                    </Button>
                    {!run.active ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={activateRun.isPending || inProgress}
                        onClick={() => runId && activateRun.mutate(runId)}
                      >
                        {t('sources.drawingActivate')}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowRaw((v) => !v)}
                    >
                      {showRaw
                        ? t('sources.drawingHideRaw')
                        : t('sources.drawingShowRaw')}
                    </Button>
                  </div>

                  <ScrollArea className="h-full min-h-0 flex-1">
                    <div className="px-1.5 py-1">
                      {showRaw ? (
                        <pre className="overflow-auto rounded bg-muted p-1.5 text-[10px] leading-snug">
                          {JSON.stringify(
                            {
                              classification: activePage?.classification,
                              sheet_metadata: activePage?.sheet_metadata,
                              stats: run.stats,
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
                            const raw = item.raw_text
                              ? String(item.raw_text).trim()
                              : ''
                            return (
                              <li
                                key={String(item.id || item.stable_id)}
                                className="py-1.5"
                              >
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
              </div>
            ) : !inProgress ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 py-6">
                <p className="text-[11px] text-muted-foreground">
                  {t('sources.drawingNoItems')}
                </p>
                <div className="flex gap-0.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retryRun.isPending}
                    onClick={() => runId && retryRun.mutate(runId)}
                  >
                    {t('sources.drawingRetry')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowRaw((v) => !v)}
                  >
                    {showRaw
                      ? t('sources.drawingHideRaw')
                      : t('sources.drawingShowRaw')}
                  </Button>
                </div>
                {showRaw ? (
                  <pre className="mt-1 max-h-48 w-full overflow-auto rounded bg-muted p-1.5 text-[10px]">
                    {JSON.stringify(run, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
