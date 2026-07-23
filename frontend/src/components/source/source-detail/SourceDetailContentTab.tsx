'use client'

import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { PdfCitationViewer } from '@/components/source/PdfCitationViewer'
import type { HighlightedTextView } from '@/components/source/source-detail/sourceDetailUtils'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { EvidenceFocusItem } from '@/lib/ag-ui/evidence-focus'
import { cn } from '@/lib/utils'
import { ExternalLink, Link as LinkIcon } from 'lucide-react'

const PLAIN_PRE_CLASS = cn(
  'max-h-[min(52vh,560px)] overflow-auto rounded-md border border-border/60',
  'bg-muted/20 px-1.5 py-1 font-mono text-[11px] leading-snug',
  'whitespace-pre-wrap break-words text-foreground'
)

export interface SourceDetailContentTabProps {
  sourceId: string
  assetUrl?: string
  contentText: string
  isYouTubeUrl: boolean
  youTubeVideoId: string | null
  showPdfViewer: boolean
  usePlainExtractionView: boolean
  highlightedTextView: HighlightedTextView | null
  focusForThisSource: EvidenceFocusItem | null
}

export function SourceDetailContentTab({
  sourceId,
  assetUrl,
  contentText,
  isYouTubeUrl,
  youTubeVideoId,
  showPdfViewer,
  usePlainExtractionView,
  highlightedTextView,
  focusForThisSource,
}: SourceDetailContentTabProps) {
  const { t } = useTranslation()

  return (
    <>
      {assetUrl && !isYouTubeUrl && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <LinkIcon className="h-3 w-3 shrink-0" />
          <a
            href={assetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate hover:underline"
          >
            {assetUrl}
          </a>
        </div>
      )}

      {isYouTubeUrl && youTubeVideoId && (
        <div className="space-y-1">
          <div className="aspect-video overflow-hidden rounded-md bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${youTubeVideoId}`}
              title={t('common.accessibility.ytVideo')}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          {assetUrl && (
            <a
              href={assetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t('sources.openOnYoutube')}
            </a>
          )}
        </div>
      )}

      {!contentText && !showPdfViewer ? (
        <p className="px-0.5 py-2 text-sm text-muted-foreground">{t('sources.noContent')}</p>
      ) : showPdfViewer ? (
        <PdfCitationViewer sourceId={sourceId} focus={focusForThisSource} />
      ) : highlightedTextView ? (
        <pre className={PLAIN_PRE_CLASS}>
          {highlightedTextView.before}
          <mark className="rounded-sm bg-amber-200/80 px-0.5 text-foreground dark:bg-amber-500/40">
            {highlightedTextView.match}
          </mark>
          {highlightedTextView.after}
        </pre>
      ) : usePlainExtractionView ? (
        <pre className={PLAIN_PRE_CLASS}>{contentText}</pre>
      ) : (
        <div className="rounded-md border border-border/60 bg-muted/20 px-1.5 py-1">
          <MarkdownRenderer size="sm">{contentText}</MarkdownRenderer>
        </div>
      )}
    </>
  )
}
