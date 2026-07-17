'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Eye,
  FileSearch,
  Filter,
  Inbox,
  MapPin,
  Search,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react'

import {
  PageHeader,
  pageContentClassName,
  pageSectionGapClassName,
} from '@/components/layout/PageHeader'
import { PageRefreshButton } from '@/components/layout/PageRefreshButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  useArchiveOpportunity,
  useOpportunities,
  useOpportunityDashboard,
  useOpportunitySources,
  usePursueOpportunity,
  useSeedOpportunitySources,
  useSetOpportunityStatus,
} from '@/lib/hooks/use-opportunities'
import type {
  HawaiiIsland,
  Opportunity,
  OpportunityFilters,
  OpportunityStatus,
} from '@/lib/types/opportunities'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS: Array<{ value: OpportunityStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All active' },
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'watching', label: 'Watching' },
  { value: 'pursuing', label: 'Pursuing' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'no_bid', label: 'No bid' },
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

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  watching: 'Watching',
  pursuing: 'Pursuing',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
  no_bid: 'No bid',
  ignored: 'Ignored',
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

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  warning = false,
}: {
  label: string
  value: string | number
  helper?: string
  icon: typeof Inbox
  warning?: boolean
}) {
  return (
    <Card className="py-0 shadow-none">
      <CardContent className="flex items-center gap-2 p-2.5">
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md bg-muted',
            warning && 'bg-destructive/10 text-destructive'
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold leading-none">{value}</div>
          <div className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
            {label}
          </div>
          {helper ? (
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground/75">
              {helper}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
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
  const urgent = days !== null && days <= 7
  const overdue = days !== null && days < 0

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border p-2.5 text-left transition-colors hover:bg-muted/45',
        selected && 'border-primary bg-primary/5 ring-1 ring-primary/20'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {opportunity.procurement_type}
            </Badge>
            <Badge variant={statusVariant(opportunity.status)} className="h-5 px-1.5 text-[10px]">
              {STATUS_LABELS[opportunity.status]}
            </Badge>
            {opportunity.fit_score !== null ? (
              <Badge
                variant={opportunity.fit_score >= 75 ? 'default' : 'secondary'}
                className="h-5 px-1.5 text-[10px]"
              >
                {opportunity.fit_score}% fit
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug">
            {opportunity.title}
          </h3>
          <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Building2 className="size-3 shrink-0" />
            <span className="truncate">{opportunity.agency}</span>
          </div>
        </div>
        <div
          className={cn(
            'shrink-0 rounded-md border px-2 py-1 text-right',
            urgent && 'border-amber-500/40 bg-amber-500/5',
            overdue && 'border-destructive/40 bg-destructive/5 text-destructive'
          )}
        >
          <div className="text-[10px] text-muted-foreground">{formatShortDate(opportunity.bid_due_at)}</div>
          <div className="mt-0.5 text-[11px] font-semibold">{deadlineLabel(opportunity)}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" />
          {opportunity.location || opportunity.island}
        </span>
        {opportunity.solicitation_number ? (
          <span className="truncate">#{opportunity.solicitation_number}</span>
        ) : null}
        {opportunity.addenda.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3" />
            {opportunity.addenda.length} addenda
          </span>
        ) : null}
      </div>
    </button>
  )
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-xs leading-relaxed">{value}</div>
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
    <Card className="h-full min-h-0 py-0 shadow-none">
      <CardHeader className="border-b p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{opportunity.procurement_type}</Badge>
          <Badge variant={statusVariant(opportunity.status)}>
            {STATUS_LABELS[opportunity.status]}
          </Badge>
          {opportunity.fit_score !== null ? (
            <Badge variant={opportunity.fit_score >= 75 ? 'default' : 'secondary'}>
              {opportunity.fit_score}% company fit
            </Badge>
          ) : null}
        </div>
        <CardTitle className="mt-2 text-base leading-snug">{opportunity.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Building2 className="size-3.5" />
            {opportunity.agency}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" />
            {opportunity.location || opportunity.island}
          </span>
        </div>
      </CardHeader>

      <ScrollArea className="h-[calc(100vh-245px)] min-h-[430px]">
        <CardContent className="space-y-4 p-3">
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 p-2.5">
            <DetailField label="Bid deadline" value={formatDate(opportunity.bid_due_at)} />
            <DetailField label="Time remaining" value={deadlineLabel(opportunity)} />
            <DetailField label="Questions due" value={formatDate(opportunity.questions_due_at)} />
            <DetailField label="Pre-bid / site visit" value={formatDate(opportunity.prebid_at)} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <FileSearch className="size-3.5" />
              Plain-English scope
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {opportunity.scope_summary || opportunity.description || 'Scope has not been extracted yet.'}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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

          <div className="grid gap-3 sm:grid-cols-2">
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

          <div className="grid gap-3 sm:grid-cols-2">
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
        </CardContent>
      </ScrollArea>
    </Card>
  )
}

export default function OpportunitiesPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<OpportunityStatus | 'all'>('all')
  const [island, setIsland] = useState<HawaiiIsland | 'all'>('all')
  const [sourceKey, setSourceKey] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filters: OpportunityFilters = useMemo(
    () => ({ q: query.trim() || undefined, status, island, source_key: sourceKey }),
    [query, status, island, sourceKey]
  )

  const { data, isLoading, refetch } = useOpportunities(filters)
  const { data: dashboard } = useOpportunityDashboard()
  const { data: sources, isLoading: sourcesLoading } = useOpportunitySources()
  const seedSources = useSeedOpportunitySources()

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

  const filtersActive = query.trim().length > 0 || status !== 'all' || island !== 'all' || sourceKey !== 'all'

  const clearFilters = () => {
    setQuery('')
    setStatus('all')
    setIsland('all')
    setSourceKey('all')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn(pageContentClassName, pageSectionGapClassName)}>
        <PageHeader
          title="Opportunity Hub"
          description="One inbox for Hawaii IFBs, RFPs, RFQs, and public construction work."
          icon={Inbox}
          meta={`${data?.total ?? 0} visible opportunities · ${sources?.length ?? 0} sources`}
          actions={<PageRefreshButton onClick={() => refetch()} />}
        />

        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="New opportunities" value={dashboard?.new ?? 0} icon={Inbox} />
          <MetricCard label="High-fit matches" value={dashboard?.high_fit ?? 0} icon={Target} />
          <MetricCard
            label="Due in 7 days"
            value={dashboard?.due_soon ?? 0}
            icon={CalendarClock}
            warning={(dashboard?.due_soon ?? 0) > 0}
          />
          <MetricCard label="Bids in progress" value={dashboard?.pursuing ?? 0} icon={Clock3} />
          <MetricCard label="Submitted" value={dashboard?.submitted ?? 0} icon={CheckCircle2} />
          <MetricCard
            label="Pipeline range"
            value={formatMoney(dashboard?.pipeline_value_max ?? 0)}
            helper={
              dashboard && dashboard.pipeline_value_min !== dashboard.pipeline_value_max
                ? `Low ${formatMoney(dashboard.pipeline_value_min)}`
                : undefined
            }
            icon={CircleDollarSign}
          />
        </div>

        <Card className="py-0 shadow-none">
          <CardContent className="flex flex-wrap items-center gap-1.5 p-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search agency, scope, trade, license, or solicitation..."
                className="h-8 pl-7 text-xs"
              />
            </div>

            <Select value={status} onValueChange={(value) => setStatus(value as OpportunityStatus | 'all')}>
              <SelectTrigger className="h-8 w-[135px] text-xs">
                <SelectValue />
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
              <SelectTrigger className="h-8 w-[125px] text-xs">
                <SelectValue />
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
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="All sources" />
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

            {filtersActive ? (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                <Filter className="mr-1 size-3.5" />
                Clear
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid min-h-[520px] gap-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
          <Card className="min-h-0 py-0 shadow-none">
            <CardHeader className="flex-row items-center justify-between border-b p-2.5">
              <CardTitle className="text-sm">Opportunity inbox</CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {data?.total ?? 0} matches
              </span>
            </CardHeader>
            <ScrollArea className="h-[calc(100vh-245px)] min-h-[430px]">
              <CardContent className="space-y-1.5 p-2">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 w-full rounded-md" />
                  ))
                ) : opportunities.length > 0 ? (
                  opportunities.map((opportunity) => (
                    <OpportunityRow
                      key={opportunity.id}
                      opportunity={opportunity}
                      selected={selected?.id === opportunity.id}
                      onSelect={() => setSelectedId(opportunity.id)}
                    />
                  ))
                ) : (
                  <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
                    <Inbox className="size-9 text-muted-foreground/50" />
                    <h3 className="mt-3 text-sm font-semibold">
                      {filtersActive ? 'No opportunities match these filters' : 'The inbox is ready'}
                    </h3>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                      {filtersActive
                        ? 'Clear a filter or broaden the search.'
                        : 'The Hawaii source registry is installed. Collector adapters can now import normalized notices through the Opportunity Hub API without changing this interface.'}
                    </p>
                    {filtersActive ? (
                      <Button size="sm" variant="outline" className="mt-3" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </ScrollArea>
          </Card>

          {selected ? (
            <OpportunityDetail opportunity={selected} />
          ) : (
            <Card className="flex min-h-[430px] items-center justify-center py-0 shadow-none">
              <div className="max-w-sm px-6 text-center">
                <FileSearch className="mx-auto size-9 text-muted-foreground/50" />
                <h3 className="mt-3 text-sm font-semibold">Select an opportunity</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Review the extracted scope, deadline, fit, risks, requirements, original notice, and bid actions here.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
