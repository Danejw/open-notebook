'use client'

import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Opportunity } from '@/lib/types/opportunities'
import { cn } from '@/lib/utils'
import {
  WORKFLOW_STATUS_LABELS,
  daysUntil,
  formatShortDate,
  pipelineStatusLabel,
  railStatusDotClass,
} from '@/app/(dashboard)/opportunities/components/opportunityUtils'

export function OpportunityRailItem({
  opportunity,
  selected,
  onSelect,
}: {
  opportunity: Opportunity
  selected: boolean
  onSelect: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onSelect}
          className={cn(
            'size-8 shrink-0 rounded-md',
            selected && 'bg-primary/10 ring-1 ring-primary/30'
          )}
          aria-label={opportunity.title}
          aria-pressed={selected}
        >
          {opportunity.fit_score !== null ? (
            <span
              className={cn(
                'text-[10px] font-semibold leading-none tabular-nums',
                opportunity.fit_score >= 75 ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {opportunity.fit_score}
            </span>
          ) : (
            <span
              className={cn('size-2 rounded-full', railStatusDotClass(opportunity))}
              aria-hidden
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <p className="font-medium">{opportunity.title}</p>
        <p className="text-[10px] opacity-80">
          {pipelineStatusLabel(opportunity)} · {formatShortDate(opportunity.bid_due_at)}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

export function OpportunityRow({
  opportunity,
  selected,
  onSelect,
}: {
  opportunity: Opportunity
  selected: boolean
  onSelect: () => void
}) {
  const days = daysUntil(opportunity.bid_due_at)
  const overdue = days !== null && days < 0
  const urgent = days !== null && days <= 7
  const location = opportunity.location || opportunity.island
  const due = formatShortDate(opportunity.bid_due_at)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'w-full cursor-pointer border-b px-2 py-1.5 text-left transition-colors last:border-b-0 hover:bg-muted/45',
        selected && 'bg-primary/5'
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-snug">{opportunity.title}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-x-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{location}</span>
            </span>
            <span aria-hidden>·</span>
            <span
              className={cn(
                'shrink-0',
                overdue && 'font-medium text-destructive',
                !overdue && urgent && 'font-medium text-amber-700 dark:text-amber-400'
              )}
            >
              {due}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5">
          <span className="max-w-[min(9.5rem,40%)] truncate text-[10px] font-medium leading-none text-muted-foreground">
            {pipelineStatusLabel(opportunity)}
          </span>
          {opportunity.status !== 'none' ? (
            <span className="max-w-[min(9.5rem,40%)] truncate text-[10px] leading-none text-muted-foreground/80">
              {WORKFLOW_STATUS_LABELS[opportunity.status]}
            </span>
          ) : null}
          {opportunity.fit_score !== null ? (
            <span
              className={cn(
                'text-[11px] font-semibold leading-none tabular-nums',
                opportunity.fit_score >= 75 ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {opportunity.fit_score}%
            </span>
          ) : (
            <span className="text-[11px] leading-none text-muted-foreground/60">—</span>
          )}
        </div>
      </div>
    </div>
  )
}
