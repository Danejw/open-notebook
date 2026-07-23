'use client'

import { FileSearch, Inbox } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Opportunity } from '@/lib/types/opportunities'
import { useTranslation } from '@/lib/hooks/use-translation'
import { OpportunityDetail } from '@/app/(dashboard)/opportunities/components/OpportunityDetail'
import {
  OpportunityFilterBar,
  type OpportunityFilterBarProps,
} from '@/app/(dashboard)/opportunities/components/OpportunityFilterBar'
import {
  OpportunityRailItem,
  OpportunityRow,
} from '@/app/(dashboard)/opportunities/components/OpportunityListItems'
import { SamGovActionButtons } from '@/app/(dashboard)/opportunities/components/SamGovActionButtons'

export interface OpportunityListPanelProps {
  opportunities: Opportunity[]
  selected: Opportunity | null
  isLoading: boolean
  total: number
  filtersActive: boolean
  collapsed: boolean
  filterBarProps: OpportunityFilterBarProps
  onSelect: (id: string) => void
  onClearFilters: () => void
  onSyncSamGov: () => void
  onOpenImportUrl: () => void
  syncPending: boolean
}

export function OpportunityListCollapsedRail({
  opportunities,
  selected,
  isLoading,
  total,
  filtersActive,
  onSelect,
}: {
  opportunities: Opportunity[]
  selected: Opportunity | null
  isLoading: boolean
  total: number
  filtersActive: boolean
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full min-h-0 min-w-0 flex-col items-center overflow-hidden py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="mb-1.5 flex size-8 shrink-0 items-center justify-center text-muted-foreground"
              aria-hidden
            >
              <Inbox className="size-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            {t('opportunities.inboxRailTooltip').replace(
              '{total}',
              String(total)
            )}
          </TooltipContent>
        </Tooltip>

        <ScrollArea className="min-h-0 w-full flex-1">
          <div className="flex flex-col items-center gap-1 px-1 pt-2 pb-2">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="size-8 shrink-0 rounded-md" />
              ))
            ) : opportunities.length > 0 ? (
              opportunities.map((opportunity) => (
                <OpportunityRailItem
                  key={opportunity.id}
                  opportunity={opportunity}
                  selected={selected?.id === opportunity.id}
                  onSelect={() => onSelect(opportunity.id)}
                />
              ))
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex size-8 items-center justify-center text-muted-foreground/50">
                    <Inbox className="size-4" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {filtersActive
                    ? t('opportunities.emptyFilteredTitle')
                    : t('opportunities.emptyReadyTitle')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}

export function OpportunityListPanel({
  opportunities,
  selected,
  isLoading,
  total,
  filtersActive,
  collapsed,
  filterBarProps,
  onSelect,
  onClearFilters,
  onSyncSamGov,
  onOpenImportUrl,
  syncPending,
}: OpportunityListPanelProps) {
  const { t } = useTranslation()

  if (collapsed) {
    return (
      <OpportunityListCollapsedRail
        opportunities={opportunities}
        selected={selected}
        isLoading={isLoading}
        total={total}
        filtersActive={filtersActive}
        onSelect={onSelect}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <OpportunityFilterBar {...filterBarProps} />

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="min-w-0 divide-y">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-none" />
            ))
          ) : opportunities.length > 0 ? (
            opportunities.map((opportunity) => (
              <OpportunityRow
                key={opportunity.id}
                opportunity={opportunity}
                selected={selected?.id === opportunity.id}
                onSelect={() => onSelect(opportunity.id)}
              />
            ))
          ) : (
            <EmptyState
              icon={Inbox}
              title={
                filtersActive
                  ? t('opportunities.emptyFilteredTitle')
                  : t('opportunities.emptyReadyTitle')
              }
              description={
                filtersActive
                  ? t('opportunities.emptyFilteredDescription')
                  : t('opportunities.emptyReadyDescription')
              }
              className="flex min-h-[280px] flex-col items-center justify-center px-6"
              action={
                !filtersActive ? (
                  <SamGovActionButtons
                    syncPending={syncPending}
                    onSyncSamGov={onSyncSamGov}
                    onOpenImportUrl={onOpenImportUrl}
                    className="justify-center"
                  />
                ) : (
                  <Button size="sm" variant="outline" onClick={onClearFilters}>
                    {t('opportunities.clearFilters')}
                  </Button>
                )
              }
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export function OpportunityDetailsPanel({
  selected,
}: {
  selected: Opportunity | null
}) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b px-2.5 py-2">
        <h2 className="shrink-0 text-sm font-semibold">
          {t('opportunities.detailsHeading')}
        </h2>
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {selected ? selected.title : t('opportunities.noSelection')}
        </span>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {selected ? (
          <OpportunityDetail opportunity={selected} />
        ) : (
          <EmptyState
            icon={FileSearch}
            title={t('opportunities.selectOpportunityTitle')}
            description={t('opportunities.selectOpportunityDescription')}
            className="flex flex-1 flex-col items-center justify-center border-0 px-6"
          />
        )}
      </div>
    </div>
  )
}
