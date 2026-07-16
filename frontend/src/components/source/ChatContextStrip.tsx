'use client'

import { FileText, Lightbulb, StickyNote } from 'lucide-react'
import { SourceChatContextIndicator } from '@/lib/types/api'
import { ContextIndicator } from '@/components/common/ContextIndicator'
import {
  ActiveArtifactBar,
} from '@/components/projects/ActiveArtifactBar'
import { columnFooterClassName } from '@/components/projects/ColumnHeader'
import type { Artifact } from '@/lib/types/artifacts'
import { cn } from '@/lib/utils'

interface ProjectContextStats {
  sourcesInsights: number
  sourcesFull: number
  notesCount: number
  tokenCount?: number
  charCount?: number
}

export interface ChatContextStripProps {
  contextIndicators?: SourceChatContextIndicator | null
  projectContextStats?: ProjectContextStats
  activeArtifact?: Artifact
  onClearArtifact?: () => void
}

export function ChatContextStrip({
  contextIndicators,
  projectContextStats,
  activeArtifact,
  onClearArtifact,
}: ChatContextStripProps) {
  return (
    <>
      {contextIndicators ? (
        <div
          className={cn(
            columnFooterClassName,
            'flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground'
          )}
        >
          {contextIndicators.sources?.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <FileText className="h-3 w-3" />
              {contextIndicators.sources.length}
            </span>
          )}
          {contextIndicators.insights?.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Lightbulb className="h-3 w-3" />
              {contextIndicators.insights.length}
            </span>
          )}
          {contextIndicators.notes?.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <StickyNote className="h-3 w-3" />
              {contextIndicators.notes.length}
            </span>
          )}
        </div>
      ) : null}

      {projectContextStats ? (
        <ContextIndicator
          sourcesInsights={projectContextStats.sourcesInsights}
          sourcesFull={projectContextStats.sourcesFull}
          notesCount={projectContextStats.notesCount}
          tokenCount={projectContextStats.tokenCount}
          charCount={projectContextStats.charCount}
        />
      ) : null}

      {activeArtifact && onClearArtifact ? (
        <ActiveArtifactBar artifact={activeArtifact} onClear={onClearArtifact} />
      ) : null}
    </>
  )
}
