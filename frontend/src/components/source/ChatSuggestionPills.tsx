'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface ChatSuggestionPillsProps {
  suggestions: string[]
  isLoading?: boolean
  disabled?: boolean
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  onSelect: (suggestion: string) => void
  className?: string
}

export function ChatSuggestionPills({
  suggestions,
  isLoading = false,
  disabled = false,
  collapsed = false,
  onCollapsedChange,
  onSelect,
  className,
}: ChatSuggestionPillsProps) {
  const { t } = useTranslation()
  const canToggle = !!onCollapsedChange

  if (collapsed) {
    if (!canToggle) return null
    return (
      <div className={cn('mb-0.5 flex items-center px-0.5', className)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-0.5 px-1.5 text-[11px] text-muted-foreground"
          aria-expanded={false}
          aria-label={t('chat.suggestionsExpand')}
          onClick={() => onCollapsedChange(false)}
        >
          <ChevronUp className="size-3.5" />
          {t('chat.suggestionsExpand')}
        </Button>
      </div>
    )
  }

  if (!isLoading && suggestions.length === 0) {
    return null
  }

  return (
    <div
      className={cn('mb-0.5 flex items-start gap-0.5 px-0.5', className)}
      role="group"
      aria-label={t('chat.suggestionsLabel')}
    >
      <div className="flex min-w-0 flex-1 flex-wrap gap-0.5">
        {isLoading && suggestions.length === 0 ? (
          <>
            <Skeleton className="h-7 w-28 rounded-full" aria-hidden />
            <Skeleton className="h-7 w-36 rounded-full" aria-hidden />
            <Skeleton className="h-7 w-24 rounded-full" aria-hidden />
            <span className="sr-only">{t('chat.suggestionsLoading')}</span>
          </>
        ) : (
          suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onSelect(suggestion)}
              className={cn(
                'h-auto max-w-full rounded-full border bg-background px-2 py-0.5',
                'text-left text-[11px] leading-snug text-foreground shadow-sm',
                'hover:bg-muted',
                'min-h-7 touch-manipulation font-normal'
              )}
            >
              <span className="line-clamp-2 break-words">{suggestion}</span>
            </Button>
          ))
        )}
      </div>
      {canToggle ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          aria-expanded={true}
          aria-label={t('chat.suggestionsCollapse')}
          onClick={() => onCollapsedChange(true)}
        >
          <ChevronDown className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
