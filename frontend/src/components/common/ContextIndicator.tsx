'use client'

import { FileText, Lightbulb, StickyNote } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ContextIndicatorProps {
  sourcesInsights: number
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
  sourcesInsights,
  sourcesFull,
  notesCount,
  tokenCount,
  charCount,
  className
}: ContextIndicatorProps) {
  const hasContext = (sourcesInsights + sourcesFull) > 0 || notesCount > 0
  const showTokens = tokenCount !== undefined && tokenCount > 0
  // Prefer tokens; only show chars when tokens are unavailable
  const showChars = !showTokens && charCount !== undefined && charCount > 0

  if (!hasContext) {
    return (
      <div className={cn('flex-shrink-0 px-2 py-0.5 text-[11px] text-muted-foreground border-t', className)}>
        No context selected — toggle sources or notes to include them.
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
            <p>
              Selected sources/notes are searched per message. Chat loads only
              the most relevant excerpts (not every insight every time).
            </p>
          </TooltipContent>
        </Tooltip>
        {sourcesInsights > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-amber-600 cursor-default">
                <Lightbulb className="h-3 w-3" />
                {sourcesInsights}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Insights for {sourcesInsights} source{sourcesInsights !== 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {sourcesFull > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-primary cursor-default">
                <FileText className="h-3 w-3" />
                {sourcesFull}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{sourcesFull} full source{sourcesFull !== 1 ? 's' : ''}</p>
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
              <p>{notesCount} full note{notesCount !== 1 ? 's' : ''}</p>
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
