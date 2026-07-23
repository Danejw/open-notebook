'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PanZoomViewport } from '@/components/ui/pan-zoom-viewport'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { pageLabel } from '@/components/sources/drawing-extraction/drawingExtractionUtils'

export type DrawingPreviewPaneProps = {
  pages: Array<Record<string, unknown>>
  activePageId: string | null
  onSelectPage: (pageId: string) => void
  pageImageUrl: string | null
  pageImageLoading: boolean
  imageSize: { width: number; height: number }
  onImageSize: (size: { width: number; height: number }) => void
  sheetTitle: string
}

export function DrawingPreviewPane({
  pages,
  activePageId,
  onSelectPage,
  pageImageUrl,
  pageImageLoading,
  imageSize,
  onImageSize,
  sheetTitle,
}: DrawingPreviewPaneProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
      {pages.length > 1 ? (
        <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b px-1 py-0.5">
          {pages.map((page) => {
            const id = String(page.id)
            return (
              <Button
                key={id}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 shrink-0 rounded px-1.5 text-[11px]',
                  activePageId === id && 'bg-muted font-medium'
                )}
                onClick={() => onSelectPage(id)}
              >
                {pageLabel(page)}
              </Button>
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
                  onImageSize({
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
  )
}
