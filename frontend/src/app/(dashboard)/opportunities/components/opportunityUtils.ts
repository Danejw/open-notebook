import type {
  Opportunity,
  OpportunityDocument,
  OpportunitySourceStage,
  OpportunityStatus,
} from '@/lib/types/opportunities'

export type InboxFilter =
  | 'all'
  | OpportunitySourceStage
  | Exclude<OpportunityStatus, 'none'>

const SOURCE_STAGE_VALUES: ReadonlySet<string> = new Set([
  'early_research',
  'pre_solicitation',
  'active_solicitation',
])

export function isSourceStage(value: string): value is OpportunitySourceStage {
  return SOURCE_STAGE_VALUES.has(value)
}

export const STATUS_OPTIONS: Array<{ value: InboxFilter; label: string }> = [
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

export const ISLAND_OPTIONS = [
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
] as const

export const SORT_OPTIONS = [
  { value: 'due' as const, label: 'Due date' },
  { value: 'fit_score_desc' as const, label: 'Match % ↓' },
  { value: 'fit_score_asc' as const, label: 'Match % ↑' },
]

export const STATUS_SHORT_LABELS: Record<InboxFilter, string> = {
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

export const SORT_SHORT_LABELS = {
  due: 'Due',
  fit_score_desc: 'Match↓',
  fit_score_asc: 'Match↑',
} as const

export const SOURCE_STAGE_LABELS: Record<OpportunitySourceStage, string> = {
  early_research: 'Early Research',
  pre_solicitation: 'Pre-Solicitation',
  active_solicitation: 'Active Solicitation',
}

export const WORKFLOW_STATUS_LABELS: Record<OpportunityStatus, string> = {
  none: 'Open',
  watching: 'Watching',
  pursuing: 'Pursuing',
  submitted: 'Submitted',
  won: 'Awarded',
  lost: 'Lost',
  no_bid: 'Closed',
  ignored: 'Ignored',
}

export function pipelineStatusLabel(opportunity: Opportunity): string {
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

export function sourceStageVariant(_stage: OpportunitySourceStage) {
  return 'outline' as const
}

export function workflowStatusVariant(status: OpportunityStatus) {
  if (status === 'won') return 'default' as const
  if (status === 'lost' || status === 'no_bid' || status === 'ignored') {
    return 'outline' as const
  }
  if (status === 'watching' || status === 'pursuing' || status === 'submitted') {
    return 'secondary' as const
  }
  return 'outline' as const
}

export function formatDate(value: string | null): string {
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

export function formatShortDate(value: string | null): string {
  if (!value) return 'No deadline'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No deadline'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function daysUntil(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.ceil((timestamp - Date.now()) / 86_400_000)
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function deadlineLabel(opportunity: Opportunity): string {
  const days = daysUntil(opportunity.bid_due_at)
  if (days === null) return 'No deadline'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `${days} days left`
}

export function railStatusDotClass(opportunity: Opportunity): string {
  const days = daysUntil(opportunity.bid_due_at)
  if (days !== null && days < 0) return 'bg-destructive'
  if (days !== null && days <= 7) return 'bg-amber-500'
  if (opportunity.status === 'won') return 'bg-emerald-500'
  if (opportunity.status === 'pursuing' || opportunity.status === 'submitted') {
    return 'bg-primary'
  }
  return 'bg-muted-foreground/50'
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

export function documentLabel(doc: OpportunityDocument, index: number): string {
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

export function ingestStatusLabel(
  status: OpportunityDocument['ingest_status']
): string | null {
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
