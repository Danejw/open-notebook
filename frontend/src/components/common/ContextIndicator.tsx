'use client'

import { FileText, StickyNote } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/hooks/use-translation'

interface ContextIndicatorProps {
  sourcesFull: number
  notesCount: number
  tokenCount?: number
  charCount?: number
  className?: string
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

export function ContextIndicator({
  sourcesFull,
  notesCount,
  tokenCount,
  charCount,
  className
}: ContextIndicatorProps) {
  const { t } = useTranslation()
  const hasContext = sourcesFull > 0 || notesCount > 0
  const showTokens = tokenCount !== undefined && tokenCount > 0
  const showChars = !showTokens && charCount !== undefined && charCount > 0

  if (!hasContext) {
    return (
      <div className={cn('flex-shrink-0 px-2 py-0.5 text-[11px] text-muted-foreground border-t', className)}>
        {t('chat.contextNoneSelected')}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex-shrink-0 flex items-center justify-between gap-2 px-2 py-0.5 border-t text-[11px] text-muted-foreground',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate cursor-default">
              Search pool
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>{t('chat.contextSearchPoolHelp')}</p>
          </TooltipContent>
        </Tooltip>

        {sourcesFull > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-primary cursor-default">
                <FileText className="h-3 w-3" />
                {sourcesFull}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('chat.contextFullSources').replace('{count}', String(sourcesFull))}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {notesCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-primary cursor-default">
                <StickyNote className="h-3 w-3" />
                {notesCount}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('chat.contextFullArtifacts').replace('{count}', String(notesCount))}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {(showTokens || showChars) && (
        <span className="shrink-0 tabular-nums">
          {showTokens && `${formatNumber(tokenCount!)} tok`}
          {showChars && `${formatNumber(charCount!)} chars`}
        </span>
      )}
    </div>
  )
}
