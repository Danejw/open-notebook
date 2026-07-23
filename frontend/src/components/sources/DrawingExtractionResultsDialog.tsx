'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  useActivateDrawingRun,
  useDrawingRun,
  useRetryDrawingRun,
} from '@/lib/hooks/use-drawing-extraction'
import { useTranslation } from '@/lib/hooks/use-translation'
import { DrawingEmptyResults } from '@/components/sources/drawing-extraction/DrawingEmptyResults'
import { DrawingFindingsPanel } from '@/components/sources/drawing-extraction/DrawingFindingsPanel'
import { DrawingPreviewPane } from '@/components/sources/drawing-extraction/DrawingPreviewPane'
import { DrawingProgressPanel } from '@/components/sources/drawing-extraction/DrawingProgressPanel'
import {
  asNumber,
  countByType,
  isInProgressStatus,
  pageLabel,
  progressPercent,
  showStatusBadge,
  stageLabelKey,
} from '@/components/sources/drawing-extraction/drawingExtractionUtils'
import { useAuthenticatedPageImage } from '@/components/sources/drawing-extraction/useAuthenticatedPageImage'

type DrawingExtractionResultsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  runId: string | null
  projectId?: string
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

  const handleRetry = () => {
    if (runId) retryRun.mutate(runId)
  }

  const handleActivate = () => {
    if (runId) activateRun.mutate(runId)
  }

  const handleToggleRaw = () => {
    setShowRaw((v) => !v)
  }

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
              <DrawingProgressPanel
                status={run.status}
                percent={percent}
                pageCount={pageCount}
                pagesProcessed={pagesProcessed}
                drawingPagesFound={drawingPagesFound}
                currentSheet={currentSheet}
                currentPageIndex={currentPageIndex}
                hasPages={hasPages}
              />
            ) : null}

            {(run.errors?.length || 0) > 0 ? (
              <div className="shrink-0 border-b border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px]">
                {t('sources.drawingWarnings')}: {JSON.stringify(run.errors)}
              </div>
            ) : null}

            {hasPages ? (
              <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                <DrawingPreviewPane
                  pages={pages}
                  activePageId={activePageId}
                  onSelectPage={setSelectedPageId}
                  pageImageUrl={pageImageUrl}
                  pageImageLoading={pageImageLoading}
                  imageSize={imageSize}
                  onImageSize={setImageSize}
                  sheetTitle={sheetTitle}
                />
                <DrawingFindingsPanel
                  pageItems={pageItems}
                  itemsExtracted={itemsExtracted}
                  typeEntries={typeEntries}
                  showRaw={showRaw}
                  activePage={activePage}
                  runStats={run.stats}
                  inProgress={inProgress}
                  isActive={Boolean(run.active)}
                  retryPending={retryRun.isPending}
                  activatePending={activateRun.isPending}
                  onRetry={handleRetry}
                  onActivate={handleActivate}
                  onToggleRaw={handleToggleRaw}
                />
              </div>
            ) : !inProgress ? (
              <DrawingEmptyResults
                run={run}
                showRaw={showRaw}
                retryPending={retryRun.isPending}
                onRetry={handleRetry}
                onToggleRaw={handleToggleRaw}
              />
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
