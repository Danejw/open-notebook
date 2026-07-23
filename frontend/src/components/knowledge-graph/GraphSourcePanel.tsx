'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { GraphNodeDTO } from '@/lib/api/knowledge-graph'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface GraphSourcePanelProps {
  sources: GraphNodeDTO[]
  selectedSourceId: string | null
  onSelect: (sourceId: string | null) => void
  onClose?: () => void
  className?: string
}

export function GraphSourcePanel({
  sources,
  selectedSourceId,
  onSelect,
  onClose,
  className,
}: GraphSourcePanelProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex h-full max-h-full w-44 flex-col overflow-hidden rounded-md border bg-background/90 shadow-md backdrop-blur-sm',
        className
      )}
      data-testid="knowledge-graph-sources"
    >
      <div className="flex items-center gap-0.5 border-b px-0.5 py-0.5">
        <h3
          className="min-w-0 flex-1 truncate px-0.5 text-[11px] font-medium"
          title={t('knowledge.graphSourcesDesc')}
        >
          {t('knowledge.graphSources')}
        </h3>
        {onClose ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="divide-y px-0.5">
          <li>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'h-auto min-h-7 w-full justify-start rounded-none px-0.5 py-0.5 text-left text-[11px] font-normal',
                !selectedSourceId
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted'
              )}
              onClick={() => onSelect(null)}
            >
              {t('knowledge.graphAllSources')}
            </Button>
          </li>
          {sources.map((source) => (
            <li key={source.id}>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  'h-auto min-h-7 w-full justify-start rounded-none px-0.5 py-0.5 text-left text-[11px] font-normal',
                  selectedSourceId === source.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                )}
                onClick={() =>
                  onSelect(selectedSourceId === source.id ? null : source.id)
                }
              >
                <span className="line-clamp-2">{source.label}</span>
              </Button>
            </li>
          ))}
          {sources.length === 0 && (
            <li className="px-0.5 py-0.5 text-[11px] text-muted-foreground">
              {t('knowledge.graphEmpty')}
            </li>
          )}
        </ul>
      </ScrollArea>
    </div>
  )
}
