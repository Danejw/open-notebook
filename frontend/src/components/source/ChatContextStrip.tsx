'use client'

import { FileText, StickyNote } from 'lucide-react'
import { ChatContextIndicator } from '@/lib/types/api'
import { columnFooterClassName } from '@/components/projects/ColumnHeader'
import { cn } from '@/lib/utils'

export interface ChatContextStripProps {
  contextIndicators?: ChatContextIndicator | null
}

export function ChatContextStrip({
  contextIndicators,
}: ChatContextStripProps) {
  if (!contextIndicators) {
    return null
  }

  const hasSources = contextIndicators.sources?.length > 0
  const hasNotes = contextIndicators.notes?.length > 0
  if (!hasSources && !hasNotes) {
    return null
  }

  return (
    <div
      className={cn(
        columnFooterClassName,
        'flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground'
      )}
    >
      {hasSources ? (
        <span className="inline-flex items-center gap-0.5">
          <FileText className="h-3 w-3" />
          {contextIndicators.sources.length}
        </span>
      ) : null}
      {hasNotes ? (
        <span className="inline-flex items-center gap-0.5">
          <StickyNote className="h-3 w-3" />
          {contextIndicators.notes.length}
        </span>
      ) : null}
    </div>
  )
}
