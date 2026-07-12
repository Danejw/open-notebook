'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Shuffle, X } from 'lucide-react'
import type { Artifact } from '@/lib/types/artifacts'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface ActiveArtifactBarProps {
  artifact: Artifact
  onClear: () => void
  className?: string
}

export function ActiveArtifactBar({ artifact, onClear, className }: ActiveArtifactBarProps) {
  const { t } = useTranslation()
  const [showPrompt, setShowPrompt] = useState(false)

  return (
    <div
      className={cn(
        'mx-2 mb-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs',
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Shuffle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium text-foreground">{artifact.title}</p>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] text-muted-foreground"
                onClick={() => setShowPrompt((prev) => !prev)}
              >
                {showPrompt ? (
                  <>
                    <ChevronUp className="mr-0.5 h-3 w-3" />
                    {t('chat.hideArtifactPrompt')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-0.5 h-3 w-3" />
                    {t('chat.showArtifactPrompt')}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                onClick={onClear}
                aria-label={t('chat.clearArtifact')}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {artifact.description ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
              {artifact.description}
            </p>
          ) : null}
          {showPrompt ? (
            <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-background/80 p-2 text-[11px] text-muted-foreground hide-scrollbar">
              {artifact.prompt}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function buildArtifactTriggerMessage(artifactTitle: string): string {
  return `Generate the ${artifactTitle} using the selected project context. Cite all sources.`
}
