'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Eye,
  FileSearch,
  Inbox,
  Link2,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react'

import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'

import { EmptyState } from '@/components/common/EmptyState'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { FormDialogShell, formDialogFormClassName } from '@/components/common/FormDialogShell'
import { PageHeader, pageContentClassName } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useIsMobile, useIsTablet } from '@/lib/hooks/use-media-query'
import { useCollectionsCatalog } from '@/lib/hooks/use-collections'
import {
  useArchiveOpportunity,
  useImportSamGovOpportunityUrl,
  useOpportunities,
  useOpportunity,
  useOpportunityDashboard,
  useOpportunitySources,
  usePursueOpportunity,
  useSeedOpportunitySources,
  useSetOpportunityStatus,
  useSetSamSyncCollection,
  useSyncSamGovOpportunities,
} from '@/lib/hooks/use-opportunities'
import type {
  HawaiiIsland,
  Opportunity,
  OpportunityDocument,
  OpportunityFilters,
  OpportunitySort,
  OpportunitySourceStage,
  OpportunityStatus,
} from '@/lib/types/opportunities'
import { cn } from '@/lib/utils'

const OPPORTUNITY_LAYOUT_STORAGE =
  typeof window === 'undefined'
    ? { getItem: () => null, setItem: () => {} }
    : localStorage

type InboxFilter =
  | 'all'
  | OpportunitySourceStage
  | Exclude<OpportunityStatus, 'none'>

const SOURCE_STAGE_VALUES: ReadonlySet<string> = new Set([
  'early_research',
  'pre_solicitation',
  'active_solicitation',
])

function isSourceStage(value: string): value is OpportunitySourceStage {
  return SOURCE_STAGE_VALUES.has(value)
}

const STATUS_OPTIONS: Array<{ value: InboxFilter; label: string }> = [
  { value: 'all', label: 'All active' },
  { value: 'early_research', label: 'Early Research' },
  { value: 'pre_solicitation', label: 'Pre-Solicitation' },
  { value: 'active_solicitation', label: 'Active Solicitation' },
  { value: 'watching', label: 'Watching' },
  { value: 'pursuing', label: 'Pursuing' },
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

const STATUS_SHORT_LABELS: Record<InboxFilter, string> = {
  all: 'All',
  early_research: 'Early',
  pre_solicitation: 'Pre-sol',
  active_solicitation: 'Active',
  watching: 'Watch',
  pursuing: 'Pursue',
  submitted: 'Subm.',
  won: 'Award',
  lost: 'Lost',
  no_bid: 'Closed',
  ignored: 'Ignore',
}

const SORT_SHORT_LABELS: Record<OpportunitySort, string> = {
  due: 'Due',
  fit_score_desc: 'Match↓',
  fit_score_asc: 'Match↑',
}

const SOURCE_STAGE_LABELS: Record<OpportunitySourceStage, string> = {
  early_research: 'Early Research',
  pre_solicitation: 'Pre-Solicitation',
  active_solicitation: 'Active Solicitation',
}

const WORKFLOW_STATUS_LABELS: Record<OpportunityStatus, string> = {
  none: 'Open',
  watching: 'Watching',
  pursuing: 'Pursuing',
  submitted: 'Submitted',
  won: 'Awarded',
  lost: 'Lost',
  no_bid: 'Closed',
  ignored: 'Ignored',
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
  return SOURCE_STAGE_LABELS[opportunity.source_stage]
}

function sourceStageVariant(_stage: OpportunitySourceStage) {
  return 'outline' as const
}

function workflowStatusVariant(status: OpportunityStatus) {
  if (status === 'won') return 'default' as const
  if (status === 'lost' || status === 'no_bid' || status === 'ignored') {
    return 'outline' as const
  }
  if (status === 'watching' || status === 'pursuing' || status === 'submitted') {
    return 'secondary' as const
  }
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

const GENERIC_DOCUMENT_LABELS = new Set([
  'download',
  'search',
  'view',
  'files',
  'file',
  'attachment',
  'attachments',
  'resource',
  'resources',
])

function documentLabel(doc: OpportunityDocument, index: number): string {
  const named = doc.name?.trim()
  if (named && !GENERIC_DOCUMENT_LABELS.has(named.toLowerCase())) {
    return named
  }
  try {
    const path = new URL(doc.url).pathname
    const segments = path.split('/').filter(Boolean)
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = decodeURIComponent(segments[i])
      if (!GENERIC_DOCUMENT_LABELS.has(segment.toLowerCase()) && segment.includes('.')) {
        return segment
      }
    }
  } catch {
    // fall through
  }
  return `Attachment ${index + 1}`
}

function ingestStatusLabel(status: OpportunityDocument['ingest_status']): string | null {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'failed':
      return 'Failed'
    case 'skipped':
      return 'Skipped'
    case 'pending':
      return 'Pending'
    case undefined:
      return null
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

function OpportunityDetail({ opportunity: listOpportunity }: { opportunity: Opportunity }) {
  const router = useRouter()
  const { data: detailOpportunity } = useOpportunity(listOpportunity.id)
  const opportunity = detailOpportunity ?? listOpportunity
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

  const hasContact =
    Boolean(opportunity.contact_name) ||
    Boolean(opportunity.contact_email) ||
    Boolean(opportunity.contact_phone) ||
    Boolean(opportunity.contact_title)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-w-0 shrink-0 border-b p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{opportunity.procurement_type}</Badge>
          <Badge variant={sourceStageVariant(opportunity.source_stage)}>
            {pipelineStatusLabel(opportunity)}
          </Badge>
          {opportunity.status !== 'none' ? (
            <Badge variant={workflowStatusVariant(opportunity.status)}>
              {WORKFLOW_STATUS_LABELS[opportunity.status]}
            </Badge>
          ) : null}
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
            {opportunity.scope_summary || opportunity.description ? (
              <MarkdownRenderer
                size="sm"
                className="rounded-md border bg-muted/20 p-2.5 text-muted-foreground"
              >
                {opportunity.scope_summary || opportunity.description}
              </MarkdownRenderer>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Scope has not been extracted yet.
              </p>
            )}
          </div>

          <div className="grid gap-3 @sm:grid-cols-2">
            <DetailField
              label="Primary point of contact"
              value={
                hasContact ? (
                  <div className="space-y-0.5">
                    {opportunity.contact_name ? (
                      <div>
                        {opportunity.contact_name}
                        {opportunity.contact_title ? (
                          <span className="text-muted-foreground">
                            {' '}
                            · {opportunity.contact_title}
                          </span>
                        ) : null}
                      </div>
                    ) : opportunity.contact_title ? (
                      <div>{opportunity.contact_title}</div>
                    ) : null}
                    {opportunity.contact_email ? (
                      <a
                        href={`mailto:${opportunity.contact_email}`}
                        className="block break-all text-primary hover:underline"
                      >
                        {opportunity.contact_email}
                      </a>
                    ) : null}
                    {opportunity.contact_phone ? <div>{opportunity.contact_phone}</div> : null}
                  </div>
                ) : (
                  'Not provided'
                )
              }
            />
            <DetailField
              label="Contracting office"
              value={opportunity.office_address || 'Not provided'}
            />
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
            <DetailField label="Addenda" value={`${opportunity.addenda.length} detected`} />
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Documents
            </div>
            {opportunity.documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents discovered</p>
            ) : (
              <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {opportunity.documents.map((doc, index) => {
                  const statusLabel = ingestStatusLabel(doc.ingest_status)
                  return (
                    <li
                      key={`${doc.url}-${doc.source_id ?? ''}-${index}`}
                      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/20 px-2 py-1.5 text-xs"
                    >
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-w-0 max-w-full items-center gap-1 font-medium hover:text-primary hover:underline"
                      >
                        <span className="truncate">{documentLabel(doc, index)}</span>
                        <ArrowUpRight className="size-3 shrink-0 opacity-60" />
                      </a>
                      {statusLabel ? (
                        <Badge
                          variant={doc.ingest_status === 'failed' ? 'destructive' : 'secondary'}
                          className="text-[10px]"
                          title={doc.error || undefined}
                        >
                          {statusLabel}
                        </Badge>
                      ) : null}
                      {doc.source_id && opportunity.project_id ? (
                        <Link
                          href={`/projects/${opportunity.project_id}`}
                          className="text-[10px] text-muted-foreground hover:text-primary hover:underline"
                        >
                          Open in workspace
                        </Link>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
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

            {!opportunity.project_id ? (
              <Button
                size="sm"
                variant={opportunity.status === 'watching' ? 'default' : 'secondary'}
                className="h-8 text-xs"
                disabled={actionPending}
                aria-pressed={opportunity.status === 'watching'}
                onClick={() =>
                  setStatus(opportunity.status === 'watching' ? 'none' : 'watching')
                }
              >
                <Eye className="mr-1 size-3.5" />
                {opportunity.status === 'watching' ? 'Watching' : 'Watch'}
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
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all')
  const [island, setIsland] = useState<HawaiiIsland | 'all'>('all')
  const [sourceKey, setSourceKey] = useState('all')
  const [sort, setSort] = useState<OpportunitySort>('due')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [syncCollectionId, setSyncCollectionId] = useState<string>('none')
  const [syncCollectionHydrated, setSyncCollectionHydrated] = useState(false)
  const [importUrlOpen, setImportUrlOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const detailsRef = useRef<HTMLElement | null>(null)
  const listPanelRef = usePanelRef()
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
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
    if (isMobile) return
    const frame = requestAnimationFrame(() => {
      setListCollapsed(listPanelRef.current?.isCollapsed() ?? false)
    })
    return () => cancelAnimationFrame(frame)
  }, [isMobile, defaultLayout, isTablet])

  useEffect(() => {
    if (!isTablet) return
    const panel = listPanelRef.current
    if (!panel) return
    const frame = requestAnimationFrame(() => {
      if (!panel.isCollapsed()) {
        panel.collapse()
      }
      setListCollapsed(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [isTablet, defaultLayout])

  const selectOpportunity = (id: string) => {
    setSelectedId(id)
    if (isMobile) {
      requestAnimationFrame(() => {
        detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const filters: OpportunityFilters = useMemo(() => {
    const next: OpportunityFilters = {
      q: query.trim() || undefined,
      island,
      source_key: sourceKey,
      sort,
    }
    if (inboxFilter !== 'all') {
      if (isSourceStage(inboxFilter)) {
        next.source_stage = inboxFilter
      } else {
        next.status = inboxFilter
      }
    }
    return next
  }, [query, inboxFilter, island, sourceKey, sort])

  const { data, isLoading } = useOpportunities(filters)
  const { data: dashboard } = useOpportunityDashboard()
  const { data: sources, isLoading: sourcesLoading } = useOpportunitySources()
  const { data: collectionsCatalog } = useCollectionsCatalog()
  const seedSources = useSeedOpportunitySources()
  const syncSamGov = useSyncSamGovOpportunities()
  const importSamGovUrl = useImportSamGovOpportunityUrl()
  const setSamSyncCollection = useSetSamSyncCollection()

  const syncCollections = useMemo(
    () =>
      (collectionsCatalog ?? []).filter(
        (collection) => !collection.archived && collection.status !== 'archived'
      ),
    [collectionsCatalog]
  )

  const handleImportSamUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = importUrl.trim()
    if (!url || importSamGovUrl.isPending) {
      return
    }
    try {
      const result = await importSamGovUrl.mutateAsync(url)
      setImportUrlOpen(false)
      setImportUrl('')
      selectOpportunity(result.opportunity.id)
    } catch {
      // Toast handled by the mutation hook.
    }
  }

  useEffect(() => {
    if (syncCollectionHydrated || !sources) return
    const samSource = sources.find((source) => source.key === 'sam_gov_hawaii')
    const savedId = samSource?.sync_collection_id?.trim()
    if (savedId) {
      setSyncCollectionId(savedId)
    }
    setSyncCollectionHydrated(true)
  }, [sources, syncCollectionHydrated])

  useEffect(() => {
    if (!syncCollectionHydrated || syncCollectionId === 'none') return
    if (collectionsCatalog === undefined) return
    const stillExists = syncCollections.some(
      (collection) => collection.id === syncCollectionId
    )
    if (!stillExists) {
      setSyncCollectionId('none')
    }
  }, [
    collectionsCatalog,
    syncCollectionHydrated,
    syncCollectionId,
    syncCollections,
  ])

  const handleSyncCollectionChange = (value: string) => {
    setSyncCollectionId(value)
    setSamSyncCollection.mutate(value === 'none' ? null : value)
  }

  const runSamGovSync = () => {
    syncSamGov.mutate({
      daysBack: 14,
      collectionId: syncCollectionId === 'none' ? null : syncCollectionId,
    })
  }

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
    inboxFilter !== 'all' ||
    island !== 'all' ||
    sourceKey !== 'all' ||
    sort !== 'due'

  const clearFilters = () => {
    setQuery('')
    setInboxFilter('all')
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

  const progressiveFilters = !isMobile
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
          <Select
            value={inboxFilter}
            onValueChange={(value) => setInboxFilter(value as InboxFilter)}
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
            <EmptyState
              icon={Inbox}
              title={
                filtersActive ? 'No opportunities match these filters' : 'The inbox is ready'
              }
              description={
                filtersActive
                  ? 'Clear a filter or broaden the search.'
                  : 'Sync recent federal Hawaii notices, or paste a SAM.gov opportunity link to add one by hand.'
              }
              className="flex min-h-[280px] flex-col items-center justify-center px-6"
              action={
                !filtersActive ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={syncSamGov.isPending}
                      onClick={runSamGovSync}
                    >
                      <RefreshCw
                        className={cn(
                          'mr-1.5 size-3.5',
                          syncSamGov.isPending && 'animate-spin'
                        )}
                      />
                      {syncSamGov.isPending ? 'Syncing SAM.gov…' : 'Sync SAM.gov'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setImportUrlOpen(true)}
                    >
                      <Link2 className="mr-1.5 size-3.5" />
                      Add SAM.gov link
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )
              }
            />
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
        icon={Inbox}
        actions={
          <div className="flex items-center gap-1.5">
            <Select
              value={syncCollectionId}
              onValueChange={handleSyncCollectionChange}
              disabled={syncSamGov.isPending || setSamSyncCollection.isPending}
            >
              <SelectTrigger
                size="sm"
                className="h-7 max-w-[11rem] text-xs"
                aria-label="Collection filter for SAM.gov sync"
              >
                <SelectValue placeholder="No collection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No collection</SelectItem>
                {syncCollections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setImportUrlOpen(true)}
              aria-label="Add SAM.gov opportunity by URL"
            >
              <Link2 className="size-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Add SAM.gov link</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={syncSamGov.isPending}
              onClick={runSamGovSync}
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
          </div>
        }
      />

      <FormDialogShell
        open={importUrlOpen}
        onOpenChange={(open) => {
          setImportUrlOpen(open)
          if (!open) {
            setImportUrl('')
          }
        }}
        title="Add SAM.gov link"
        description="Paste a sam.gov opportunity URL. We fetch the notice and add it to this inbox like a sync result."
        onSubmit={handleImportSamUrl}
        isSubmitting={importSamGovUrl.isPending}
        disableSubmit={!importUrl.trim()}
        submitLabel="Add opportunity"
        submittingLabel="Importing…"
        compactFooter
      >
        <div className={formDialogFormClassName}>
          <div className="space-y-1.5">
            <Label htmlFor="sam-opportunity-url">Opportunity URL</Label>
            <Input
              id="sam-opportunity-url"
              type="url"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
              placeholder="https://sam.gov/workspace/contract/opp/…/view"
              autoFocus
              disabled={importSamGovUrl.isPending}
            />
          </div>
        </div>
      </FormDialogShell>

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

      {!isMobile ? (
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
