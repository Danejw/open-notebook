'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { HawaiiIsland, OpportunitySort } from '@/lib/types/opportunities'
import { cn } from '@/lib/utils'
import {
  ISLAND_OPTIONS,
  SORT_OPTIONS,
  SORT_SHORT_LABELS,
  STATUS_OPTIONS,
  STATUS_SHORT_LABELS,
  type InboxFilter,
} from '@/app/(dashboard)/opportunities/components/opportunityUtils'

export interface OpportunitySourceOption {
  key: string
  name: string
}

export interface OpportunityFilterBarProps {
  query: string
  onQueryChange: (value: string) => void
  inboxFilter: InboxFilter
  onInboxFilterChange: (value: InboxFilter) => void
  island: HawaiiIsland | 'all'
  onIslandChange: (value: HawaiiIsland | 'all') => void
  sourceKey: string
  onSourceKeyChange: (value: string) => void
  sort: OpportunitySort
  onSortChange: (value: OpportunitySort) => void
  sources: OpportunitySourceOption[] | undefined
  total: number
  filtersActive: boolean
  onClearFilters: () => void
  progressiveFilters: boolean
}

export function OpportunityFilterBar({
  query,
  onQueryChange,
  inboxFilter,
  onInboxFilterChange,
  island,
  onIslandChange,
  sourceKey,
  onSourceKeyChange,
  sort,
  onSortChange,
  sources,
  total,
  filtersActive,
  onClearFilters,
  progressiveFilters,
}: OpportunityFilterBarProps) {
  const statusLabel =
    STATUS_OPTIONS.find((option) => option.value === inboxFilter)?.label ?? 'All active'
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? 'Due date'
  const sourceLabel =
    sourceKey === 'all'
      ? 'All sources'
      : (sources ?? []).find((source) => source.key === sourceKey)?.name ?? 'Source'
  const islandLabel = island === 'all' ? 'All islands' : island
  const filterTriggerClass = cn(
    'h-7 min-w-0 flex-1 text-xs',
    progressiveFilters && '@min-[480px]:min-w-[5rem]'
  )
  const clearFiltersButton = (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label="Clear filters"
      onClick={onClearFilters}
    >
      <X className="size-3.5" />
    </Button>
  )

  return (
    <div className="min-w-0 shrink-0 space-y-1 border-b px-2 py-1.5">
      <div className="flex h-7 min-w-0 items-center gap-1.5">
        <div
          className={cn(
            'flex max-w-[45%] shrink items-center gap-1 truncate whitespace-nowrap',
            progressiveFilters && 'hidden @min-[360px]:flex'
          )}
        >
          <h2 className="truncate text-sm font-semibold leading-none">Opportunity inbox</h2>
          <span className="shrink-0 text-[11px] text-muted-foreground">· {total}</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search…"
            className={cn(
              'h-7 w-full min-w-0 pl-7 text-xs',
              filtersActive && progressiveFilters && 'pr-8 @min-[300px]:pr-2'
            )}
          />
          {filtersActive && progressiveFilters ? (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 @min-[300px]:hidden">
              {clearFiltersButton}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'flex h-7 min-w-0 flex-nowrap items-center gap-1',
          !progressiveFilters && 'gap-1.5 overflow-x-auto'
        )}
      >
        <Select
          value={inboxFilter}
          onValueChange={(value) => onInboxFilterChange(value as InboxFilter)}
        >
          <SelectTrigger className={filterTriggerClass}>
            {progressiveFilters ? (
              <>
                <span className="truncate @min-[480px]:hidden">
                  {STATUS_SHORT_LABELS[inboxFilter]}
                </span>
                <span className="hidden truncate @min-[480px]:inline">{statusLabel}</span>
              </>
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={island}
          onValueChange={(value) => onIslandChange(value as HawaiiIsland | 'all')}
        >
          <SelectTrigger
            className={cn(
              filterTriggerClass,
              progressiveFilters && 'hidden @min-[400px]:flex'
            )}
          >
            {progressiveFilters ? (
              <>
                <span className="truncate @min-[480px]:hidden">
                  {island === 'all' ? 'Island' : island}
                </span>
                <span className="hidden truncate @min-[480px]:inline">{islandLabel}</span>
              </>
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            {ISLAND_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === 'all' ? 'All islands' : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sourceKey} onValueChange={onSourceKeyChange}>
          <SelectTrigger
            className={cn(
              filterTriggerClass,
              progressiveFilters && 'hidden @min-[360px]:flex'
            )}
          >
            {progressiveFilters ? (
              <>
                <span className="truncate @min-[480px]:hidden">
                  {sourceKey === 'all' ? 'Source' : sourceLabel}
                </span>
                <span className="hidden truncate @min-[480px]:inline">{sourceLabel}</span>
              </>
            ) : (
              <SelectValue placeholder="Source" />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {(sources ?? []).map((source) => (
              <SelectItem key={source.key} value={source.key}>
                {source.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(value) => onSortChange(value as OpportunitySort)}>
          <SelectTrigger className={filterTriggerClass}>
            {progressiveFilters ? (
              <>
                <span className="truncate @min-[480px]:hidden">{SORT_SHORT_LABELS[sort]}</span>
                <span className="hidden truncate @min-[480px]:inline">{sortLabel}</span>
              </>
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filtersActive ? (
          <div
            className={cn(
              'shrink-0',
              progressiveFilters ? 'hidden @min-[300px]:block' : 'block'
            )}
          >
            {clearFiltersButton}
          </div>
        ) : null}
      </div>
    </div>
  )
}
