'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { sourcesApi } from '@/lib/api/sources'
import type { EvidenceFocusItem } from '@/lib/ag-ui/evidence-focus'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

/** Cap excerpt page scan so large solicitations cannot wedge the UI. */
export const EXCERPT_SCAN_MAX_PAGES = 25
export const EXCERPT_SCAN_MAX_MS = 2000

interface PdfCitationViewerProps {
  sourceId: string
  focus: EvidenceFocusItem | null
  className?: string
}

export function pageTextFromContent(items: ReadonlyArray<unknown>): string {
  return items
    .map((item) =>
      item && typeof item === 'object' && 'str' in item
        ? String((item as { str: string }).str)
        : ''
    )
    .join(' ')
}

export function excerptScanLimit(totalPages: number): number {
  return Math.min(Math.max(totalPages, 0), EXCERPT_SCAN_MAX_PAGES)
}

/**
 * In-app PDF viewer with optional page jump + excerpt text find (RAG-012).
 */
export function PdfCitationViewer({
  sourceId,
  focus,
  className,
}: PdfCitationViewerProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [findStatus, setFindStatus] = useState<string | null>(null)

  const targetPage = useMemo(() => {
    if (focus?.page && focus.page >= 1) {
      return focus.page
    }
    return 1
  }, [focus?.page])

  const excerptNeedle = useMemo(() => {
    const raw = focus?.excerpt?.trim() ?? ''
    return raw ? raw.slice(0, 80) : ''
  }, [focus?.excerpt])

  const hasFocusPage = Boolean(focus?.page && focus.page >= 1)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function renderPageToCanvas(
      pdfPage: {
        getViewport: (params: { scale: number }) => { width: number; height: number }
        render: (params: {
          canvasContext: CanvasRenderingContext2D
          viewport: { width: number; height: number }
        }) => { promise: Promise<void> }
      },
      canvas: HTMLCanvasElement,
      context: CanvasRenderingContext2D
    ): Promise<void> {
      const viewport = pdfPage.getViewport({ scale: 1.25 })
      canvas.height = viewport.height
      canvas.width = viewport.width
      await pdfPage.render({ canvasContext: context, viewport }).promise
    }

    async function loadPdf() {
      setLoading(true)
      setError(null)
      setFindStatus(null)
      setPageCount(0)

      try {
        const response = await sourcesApi.downloadFile(sourceId)
        if (cancelled) {
          return
        }

        const blob = response.data
        if (!(blob instanceof Blob) || blob.size === 0) {
          throw new Error('Failed to load PDF file')
        }

        objectUrl = URL.createObjectURL(blob)

        const pdfjs = await import('pdfjs-dist')
        // Served from frontend/public — avoid CDN hangs (CSP / offline).
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

        const doc = await pdfjs.getDocument(objectUrl).promise
        if (cancelled) {
          await doc.destroy()
          return
        }

        const total = doc.numPages
        setPageCount(total)
        let page = Math.min(Math.max(targetPage, 1), total)
        setPageNumber(page)

        const canvas = canvasRef.current
        if (!canvas) {
          throw new Error('PDF canvas is not ready')
        }
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('PDF canvas context unavailable')
        }

        const pdfPage = await doc.getPage(page)
        await renderPageToCanvas(pdfPage, canvas, context)

        // First paint done — clear loading before optional excerpt scan.
        if (!cancelled) {
          setLoading(false)
        }

        if (excerptNeedle && !cancelled) {
          const pageText = pageTextFromContent(
            (await pdfPage.getTextContent()).items
          )
          const needleLower = excerptNeedle.toLowerCase()
          if (pageText.toLowerCase().includes(needleLower)) {
            if (!cancelled) {
              setFindStatus(t('sources.citationHighlightFound'))
            }
          } else if (!hasFocusPage) {
            const started = Date.now()
            let foundPage: number | null = null
            const scanLimit = excerptScanLimit(total)
            for (let i = 1; i <= scanLimit; i += 1) {
              if (cancelled) {
                break
              }
              if (Date.now() - started > EXCERPT_SCAN_MAX_MS) {
                break
              }
              if (i === page) {
                continue
              }
              const other = await doc.getPage(i)
              const otherText = pageTextFromContent(
                (await other.getTextContent()).items
              )
              if (otherText.toLowerCase().includes(needleLower)) {
                foundPage = i
                break
              }
            }

            if (foundPage != null && foundPage !== page && !cancelled) {
              page = foundPage
              setPageNumber(foundPage)
              const found = await doc.getPage(foundPage)
              await renderPageToCanvas(found, canvas, context)
              setFindStatus(t('sources.citationHighlightFound'))
            } else if (!cancelled) {
              setFindStatus(t('sources.citationHighlightMissing'))
            }
          } else if (!cancelled) {
            setFindStatus(t('sources.citationHighlightMissing'))
          }
        }

        await doc.destroy()
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t('sources.failedToLoadFile')
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }
    }
    // Intentionally omit `t`: unstable identity cancels in-flight loads and
    // leaves Loading stuck (Strict Mode / i18n re-renders).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t omitted on purpose
  }, [sourceId, targetPage, excerptNeedle, hasFocusPage])

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {pageCount > 0 ? (
          <span>
            {t('sources.citationPdfPage')
              .replace('{page}', String(pageNumber))
              .replace('{total}', String(pageCount))}
          </span>
        ) : null}
        {focus?.page ? (
          <span>
            {t('sources.citationFromPage').replace('{page}', String(focus.page))}
          </span>
        ) : null}
        {findStatus ? <span>{findStatus}</span> : null}
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div className="max-h-[min(52vh,560px)] overflow-auto rounded-md border border-border/60 bg-muted/20 p-1">
          <canvas ref={canvasRef} className="mx-auto max-w-full" />
        </div>
      )}
      {focus?.excerpt ? (
        <blockquote className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {focus.excerpt}
        </blockquote>
      ) : null}
    </div>
  )
}
