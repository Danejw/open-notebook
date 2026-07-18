'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Eye,
  FileSearch,
  Inbox,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react'

import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'

import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useIsDesktop } from '@/lib/hooks/use-media-query'
import {
  useArchiveOpportunity,
  useOpportunities,
  useOpportunityDashboard,
  useOpportunitySources,
  usePursueOpportunity,
  useSeedOpportunitySources,
  useSetOpportunityStatus,
  useSyncSamGovOpportunities,
} from '@/lib/hooks/use-opportunities'
import type {
  HawaiiIsland,
  Opportunity,
  OpportunityFilters,
  OpportunitySort,
  OpportunityStatus,
} from '@/lib/types/opportunities'
import { cn } from '@/lib/utils'

const OPPORTUNITY_LAYOUT_STORAGE =
  typeof window === 'undefined'
    ? { getItem: () => null, setItem: () => {} }
    : localStorage

const STATUS_OPTIONS: Array<{ value: OpportunityStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All active' },
  { value: 'new', label: 'Early Research' },
  { value: 'reviewing', label: 'Pre-Solicitation' },
  { value: 'watching', label: 'Watching' },
  { value: 'pursuing', label: 'Active Solicitation' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'won', label: 'Awarded' },
  { value: 'lost', label: 'Lost' },
  { value: 'no_bid', label: 'Closed' },
]

const ISLAND_OPTIONS: Array<HawaiiIsland | 'all'> = [
  'all',
  'Oahu',
  'Hawaii',
  'Maui',
  'Kauai',
  'Molokai',
  'Lanai',
  'Statewide',
  'Pacific',
  'Unknown',
]

const SORT_OPTIONS: Array<{ value: OpportunitySort; label: string }> = [
  { value: 'due', label: 'Due date' },
  { value: 'fit_score_desc', label: 'Match % ↓' },
  { value: 'fit_score_asc', label: 'Match % ↑' },
]

const STATUS_SHORT_LABELS: Record<OpportunityStatus | 'all', string> = {
  all: 'All',
  new: 'Early',
  reviewing: 'Pre-sol',
  watching: 'Watch',
  pursuing: 'Active',
  submitted: 'Subm.',
  won: 'Award',
  lost: 'Lost',
  no_bid: 'Closed',
}

const SORT_SHORT_LABELS: Record<OpportunitySort, string> = {
  due: 'Due',
  fit_score_desc: 'Match↓',
  fit_score_asc: 'Match↑',
}

/** Pipeline labels for list/detail. Enum values unchanged; Amendment when addenda exist. */
const STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: 'Early Research',
  reviewing: 'Pre-Solicitation',
  watching: 'Pre-Solicitation',
  pursuing: 'Active Solicitation',
  submitted: 'Submitted',
  won: 'Awarded',
  lost: 'Lost',
  no_bid: 'Closed',
  ignored: 'Closed',
}

function pipelineStatusLabel(opportunity: Opportunity): string {
  if (
    opportunity.addenda.length > 0 &&
    opportunity.status !== 'won' &&
    opportunity.status !== 'lost' &&
    opportunity.status !== 'submitted' &&
    opportunity.status !== 'no_bid' &&
    opportunity.status !== 'ignored'
  ) {
    return 'Amendment'
  }
  return STATUS_LABELS[opportunity.status]
}

function statusVariant(status: OpportunityStatus) {
  if (status === 'won') return 'default' as const
  if (status === 'lost' || status === 'no_bid' || status === 'ignored') {
    return 'outline' as const
  }
  if (status === 'pursuing' || status === 'submitted') return 'secondary' as const
  return 'outline' as const
}

function formatDate(value: string | null): string {
  if (!value) return 'Not provided'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not provided'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatShortDate(value: string | null): string {
  if (!value) return 'No deadline'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No deadline'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function daysUntil(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.ceil((timestamp - Date.now()) / 86_400_000)
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function deadlineLabel(opportunity: Opportunity): string {
  const days = daysUntil(opportunity.bid_due_at)
  if (days === null) return 'No deadline'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `${days} days left`
}

function OverviewMetric({
  label,
  value,
  warning = false,
}: {
  label: string
  value: string | number
  warning?: boolean
}) {
  return (
    <div
      className={cn(
        'min-w-[4.5rem] shrink-0 flex-1 px-1.5 py-1 lg:min-w-0',
        warning && 'rounded-sm bg-destructive/10'
      )}
    >
      <div
        className={cn(
          'truncate text-sm font-semibold leading-none tabular-nums',
          warning && 'text-destructive'
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          'mt-0.5 truncate text-[10px] text-muted-foreground',
          warning && 'text-destructive/80'
        )}
      >
        {label}
      </div>
    </div>
  )
}

function railStatusDotClass(opportunity: Opportunity): string {
  const days = daysUntil(opportunity.bid_due_at)
  if (days !== null && days < 0) return 'bg-destructive'
  if (days !== null && days <= 7) return 'bg-amber-500'
  if (opportunity.status === 'won') return 'bg-emerald-500'
  if (opportunity.status === 'pursuing' || opportunity.status === 'submitted') {
    return 'bg-primary'
  }
  return 'bg-muted-foreground/50'
}

function OpportunityRailItem({
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
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors',
            'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
        </button>
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

function OpportunityRow({
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

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="break-words text-xs leading-relaxed">{value}</div>
    </div>
  )
}

function OpportunityDetail({ opportunity }: { opportunity: Opportunity }) {
  const router = useRouter()
  const statusMutation = useSetOpportunityStatus()
  const pursueMutation = usePursueOpportunity()
  const archiveMutation = useArchiveOpportunity()
  const actionPending =
    statusMutation.isPending || pursueMutation.isPending || archiveMutation.isPending

  const setStatus = (status: OpportunityStatus) => {
    statusMutation.mutate({ id: opportunity.id, status })
  }

  const pursue = () => {
    pursueMutation.mutate(opportunity.id, {
      onSuccess: (result) => router.push(`/projects/${result.project_id}`),
    })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-w-0 shrink-0 border-b p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{opportunity.procurement_type}</Badge>
          <Badge variant={statusVariant(opportunity.status)}>
            {pipelineStatusLabel(opportunity)}
          </Badge>
          {opportunity.fit_score !== null ? (
            <Badge variant={opportunity.fit_score >= 75 ? 'default' : 'secondary'}>
              {opportunity.fit_score}% company fit
            </Badge>
          ) : null}
        </div>
        <h3 className="mt-2 min-w-0 break-words text-base font-semibold leading-snug">
          {opportunity.source_url ? (
            <a
              href={opportunity.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full min-w-0 items-start gap-1 hover:text-primary hover:underline"
            >
              <span className="min-w-0 break-words">{opportunity.title}</span>
              <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-60" />
            </a>
          ) : (
            opportunity.title
          )}
        </h3>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 max-w-full items-center gap-1">
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate">{opportunity.agency}</span>
          </span>
          <span className="inline-flex min-w-0 max-w-full items-center gap-1">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{opportunity.location || opportunity.island}</span>
          </span>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="min-w-0 space-y-4 p-3">
          <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/20 p-2.5 @sm:grid-cols-2">
            <DetailField label="Bid deadline" value={formatDate(opportunity.bid_due_at)} />
            <DetailField label="Time remaining" value={deadlineLabel(opportunity)} />
            <DetailField label="Questions due" value={formatDate(opportunity.questions_due_at)} />
            <DetailField label="Pre-bid / site visit" value={formatDate(opportunity.prebid_at)} />
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <FileSearch className="size-3.5 shrink-0" />
              Plain-English scope
            </div>
            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
              {opportunity.scope_summary || opportunity.description || 'Scope has not been extracted yet.'}
            </p>
          </div>

          <div className="grid gap-3 @sm:grid-cols-2">
            <DetailField
              label="Relevant trades"
              value={
                opportunity.trades.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {opportunity.trades.map((trade) => (
                      <Badge key={trade} variant="secondary" className="text-[10px]">
                        {trade}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  'Not identified'
                )
              }
            />
            <DetailField
              label="License requirements"
              value={
                opportunity.license_requirements.length > 0
                  ? opportunity.license_requirements.join(', ')
                  : 'Not identified'
              }
            />
          </div>

          {opportunity.fit_reasons.length > 0 ? (
            <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <Target className="size-3.5" />
                Why this may fit
              </div>
              <div className="mt-1.5 space-y-1 text-xs">
                {opportunity.fit_reasons.map((reason) => (
                  <div key={reason} className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {opportunity.risk_flags.length > 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <ShieldAlert className="size-3.5" />
                Risks and requirements to verify
              </div>
              <div className="mt-1.5 space-y-1 text-xs">
                {opportunity.risk_flags.map((risk) => (
                  <div key={risk} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    <span>{risk}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 @sm:grid-cols-2">
            <DetailField
              label="Estimated value"
              value={
                opportunity.estimated_value_min !== null || opportunity.estimated_value_max !== null
                  ? `${formatMoney(opportunity.estimated_value_min ?? 0)} – ${formatMoney(
                      opportunity.estimated_value_max ?? opportunity.estimated_value_min ?? 0
                    )}`
                  : 'Not provided'
              }
            />
            <DetailField
              label="Bid bond"
              value={
                opportunity.bid_bond_required === null
                  ? 'Unknown'
                  : opportunity.bid_bond_required
                    ? `Required${opportunity.bid_bond_percent ? ` (${opportunity.bid_bond_percent}%)` : ''}`
                    : 'Not required'
              }
            />
            <DetailField
              label="Prevailing wage"
              value={
                opportunity.prevailing_wage_required === null
                  ? 'Unknown'
                  : opportunity.prevailing_wage_required
                    ? 'Required'
                    : 'Not identified'
              }
            />
            <DetailField
              label="Mandatory site visit"
              value={
                opportunity.mandatory_site_visit === null
                  ? 'Unknown'
                  : opportunity.mandatory_site_visit
                    ? 'Required'
                    : 'Not identified'
              }
            />
          </div>

          <div className="grid gap-3 @sm:grid-cols-2">
            <DetailField
              label="Solicitation number"
              value={opportunity.solicitation_number || opportunity.external_id}
            />
            <DetailField label="Source" value={opportunity.source_key} />
            <DetailField label="Documents" value={`${opportunity.documents.length} attached`} />
            <DetailField label="Addenda" value={`${opportunity.addenda.length} detected`} />
          </div>

          <div className="flex flex-wrap gap-1.5 border-t pt-3">
            <Button asChild size="sm" variant="outline" className="h-8 text-xs">
              <a href={opportunity.source_url} target="_blank" rel="noreferrer">
                Original notice
                <ArrowUpRight className="ml-1 size-3.5" />
              </a>
            </Button>

            {opportunity.project_id ? (
              <Button asChild size="sm" className="h-8 text-xs">
                <Link href={`/projects/${opportunity.project_id}`}>
                  Open bid workspace
                  <ArrowUpRight className="ml-1 size-3.5" />
                </Link>
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={actionPending}
                onClick={pursue}
              >
                Pursue and create workspace
                <Target className="ml-1 size-3.5" />
              </Button>
            )}

            {opportunity.status !== 'watching' && !opportunity.project_id ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                disabled={actionPending}
                onClick={() => setStatus('watching')}
              >
                <Eye className="mr-1 size-3.5" />
                Watch
              </Button>
            ) : null}

            {opportunity.status !== 'ignored' && !opportunity.project_id ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                disabled={actionPending}
                onClick={() => setStatus('ignored')}
              >
                <X className="mr-1 size-3.5" />
                Ignore
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-8 text-xs text-muted-foreground"
              disabled={actionPending}
              onClick={() => archiveMutation.mutate(opportunity.id)}
            >
              Archive
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

export default function OpportunitiesPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<OpportunityStatus | 'all'>('all')
  const [island, setIsland] = useState<HawaiiIsland | 'all'>('all')
  const [sourceKey, setSourceKey] = useState('all')
  const [sort, setSort] = useState<OpportunitySort>('due')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listCollapsed, setListCollapsed] = useState(false)
  const detailsRef = useRef<HTMLElement | null>(null)
  const listPanelRef = usePanelRef()
  const isDesktop = useIsDesktop()
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'opportunity-hub-columns',
    panelIds: ['list', 'details'],
    storage: OPPORTUNITY_LAYOUT_STORAGE,
    onlySaveAfterUserInteractions: true,
  })

  const handleListPanelResize = () => {
    const isCollapsed = listPanelRef.current?.isCollapsed() ?? false
    setListCollapsed((prev) => (prev !== isCollapsed ? isCollapsed : prev))
  }

  useEffect(() => {
    if (!isDesktop) return
    const frame = requestAnimationFrame(() => {
      setListCollapsed(listPanelRef.current?.isCollapsed() ?? false)
    })
    return () => cancelAnimationFrame(frame)
  }, [isDesktop, defaultLayout])

  const selectOpportunity = (id: string) => {
    setSelectedId(id)
    if (!isDesktop) {
      requestAnimationFrame(() => {
        detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const filters: OpportunityFilters = useMemo(
    () => ({
      q: query.trim() || undefined,
      status,
      island,
      source_key: sourceKey,
      sort,
    }),
    [query, status, island, sourceKey, sort]
  )

  const { data, isLoading, refetch } = useOpportunities(filters)
  const { data: dashboard } = useOpportunityDashboard()
  const { data: sources, isLoading: sourcesLoading } = useOpportunitySources()
  const seedSources = useSeedOpportunitySources()
  const syncSamGov = useSyncSamGovOpportunities()

  useEffect(() => {
    if (!sourcesLoading && sources && sources.length === 0 && !seedSources.isPending) {
      seedSources.mutate()
    }
  }, [seedSources, sources, sourcesLoading])

  const opportunities = data?.items ?? []
  const selected =
    opportunities.find((opportunity) => opportunity.id === selectedId) ?? opportunities[0] ?? null

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id)
    }
    if (!selected && selectedId) {
      setSelectedId(null)
    }
  }, [selected, selectedId])

  const filtersActive =
    query.trim().length > 0 ||
    status !== 'all' ||
    island !== 'all' ||
    sourceKey !== 'all' ||
    sort !== 'due'

  const clearFilters = () => {
    setQuery('')
    setStatus('all')
    setIsland('all')
    setSourceKey('all')
    setSort('due')
  }

  const listPaneCollapsed = (
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
            Opportunity inbox · {data?.total ?? 0}
          </TooltipContent>
        </Tooltip>

        <ScrollArea className="min-h-0 w-full flex-1">
          <div className="flex flex-col items-center gap-1 px-1 pb-2">
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
                  onSelect={() => selectOpportunity(opportunity.id)}
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
                  {filtersActive ? 'No opportunities match these filters' : 'The inbox is ready'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )

  const progressiveFilters = isDesktop
  const statusLabel =
    STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'All active'
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
      onClick={clearFilters}
    >
      <X className="size-3.5" />
    </Button>
  )

  const listPane = (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="min-w-0 shrink-0 space-y-1 border-b px-2 py-1.5">
        <div className="flex h-7 min-w-0 items-center gap-1.5">
          <div
            className={cn(
              'flex max-w-[45%] shrink items-center gap-1 truncate whitespace-nowrap',
              progressiveFilters && 'hidden @min-[360px]:flex'
            )}
          >
            <h2 className="truncate text-sm font-semibold leading-none">Opportunity inbox</h2>
            <span className="shrink-0 text-[11px] text-muted-foreground">· {data?.total ?? 0}</span>
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
          <Select value={status} onValueChange={(value) => setStatus(value as OpportunityStatus | 'all')}>
            <SelectTrigger className={filterTriggerClass}>
              {progressiveFilters ? (
                <>
                  <span className="truncate @min-[480px]:hidden">{STATUS_SHORT_LABELS[status]}</span>
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

          <Select value={island} onValueChange={(value) => setIsland(value as HawaiiIsland | 'all')}>
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

          <Select value={sourceKey} onValueChange={setSourceKey}>
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

          <Select value={sort} onValueChange={(value) => setSort(value as OpportunitySort)}>
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
                onSelect={() => selectOpportunity(opportunity.id)}
              />
            ))
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
              <Inbox className="size-9 text-muted-foreground/50" />
              <h3 className="mt-3 text-sm font-semibold">
                {filtersActive ? 'No opportunities match these filters' : 'The inbox is ready'}
              </h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                {filtersActive
                  ? 'Clear a filter or broaden the search.'
                  : 'Click Sync SAM.gov to pull recent federal Hawaii opportunities into this inbox.'}
              </p>
              {!filtersActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  disabled={syncSamGov.isPending}
                  onClick={() => syncSamGov.mutate(14)}
                >
                  <RefreshCw
                    className={cn(
                      'mr-1.5 size-3.5',
                      syncSamGov.isPending && 'animate-spin'
                    )}
                  />
                  {syncSamGov.isPending ? 'Syncing SAM.gov…' : 'Sync SAM.gov'}
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="mt-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )

  const detailsPane = (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b px-2.5 py-2">
        <h2 className="shrink-0 text-sm font-semibold">Details</h2>
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {selected ? selected.title : 'No selection'}
        </span>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {selected ? (
          <OpportunityDetail opportunity={selected} />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <div className="max-w-sm min-w-0">
              <FileSearch className="mx-auto size-9 text-muted-foreground/50" />
              <h3 className="mt-3 text-sm font-semibold">Select an opportunity</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Pick a notice from the list, then review scope, deadline, fit, risks, and bid actions here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        pageContentClassName
      )}
    >
      <PageHeader
        className="shrink-0"
        title="Opportunity Hub"
        description="One inbox for Hawaii IFBs, RFPs, RFQs, and public construction work."
        icon={Inbox}
        meta={`${data?.total ?? 0} visible opportunities · ${sources?.length ?? 0} sources`}
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={syncSamGov.isPending}
              onClick={() => syncSamGov.mutate(14)}
              aria-label="Sync SAM.gov opportunities"
            >
              <RefreshCw
                className={cn(
                  'size-3.5 sm:mr-1.5',
                  syncSamGov.isPending && 'animate-spin'
                )}
              />
              <span className="hidden sm:inline">
                {syncSamGov.isPending ? 'Syncing SAM.gov…' : 'Sync SAM.gov'}
              </span>
            </Button>
            <PageRefreshButton onClick={() => refetch()} />
          </div>
        }
      />

      <section
        aria-label="Overview"
        className="mt-2 shrink-0 rounded-md border bg-card"
      >
        <div className="flex divide-x divide-border overflow-x-auto lg:grid lg:grid-cols-6 lg:overflow-visible">
          <OverviewMetric label="New" value={dashboard?.new ?? 0} />
          <OverviewMetric label="High-fit" value={dashboard?.high_fit ?? 0} />
          <OverviewMetric
            label="Due 7d"
            value={dashboard?.due_soon ?? 0}
            warning={(dashboard?.due_soon ?? 0) > 0}
          />
          <OverviewMetric label="In progress" value={dashboard?.pursuing ?? 0} />
          <OverviewMetric label="Submitted" value={dashboard?.submitted ?? 0} />
          <OverviewMetric
            label="Pipeline"
            value={formatMoney(dashboard?.pipeline_value_max ?? 0)}
          />
        </div>
      </section>

      {isDesktop ? (
        <div className="mt-2 min-h-0 flex-1 overflow-hidden">
          <ResizablePanelGroup
            id="opportunity-hub-columns"
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            className="h-full min-h-0"
          >
            <ResizablePanel
              id="list"
              panelRef={listPanelRef}
              defaultSize="33%"
              minSize="20%"
              collapsible
              collapsedSize={48}
              onResize={handleListPanelResize}
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <section
                aria-label="Opportunity list"
                className="@container flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card"
              >
                {listCollapsed ? listPaneCollapsed : listPane}
              </section>
            </ResizablePanel>

            <ResizableHandle
              withHandle
              className="mx-0.5 w-1 rounded-full bg-transparent hover:bg-border/60"
            />

            <ResizablePanel
              id="details"
              defaultSize="67%"
              minSize="30%"
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <section
                aria-label="Opportunity details"
                className="@container flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card"
              >
                {detailsPane}
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <section
            aria-label="Opportunity list"
            className="@container flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-md border bg-card"
          >
            {listPane}
          </section>
          <section
            ref={detailsRef}
            aria-label="Opportunity details"
            className="@container flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-md border bg-card"
          >
            {detailsPane}
          </section>
        </div>
      )}
    </div>
  )
}
