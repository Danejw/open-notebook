import type { TFunction } from 'i18next'
import type {
  Opportunity,
  OpportunityDocument,
  OpportunitySourceStage,
  OpportunityStatus,
  OpportunitySort,
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

export const INBOX_FILTER_VALUES: InboxFilter[] = [
  'all',
  'early_research',
  'pre_solicitation',
  'active_solicitation',
  'watching',
  'pursuing',
  'submitted',
  'won',
  'lost',
  'no_bid',
]

export const ISLAND_OPTION_VALUES = [
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

export type IslandOptionValue = (typeof ISLAND_OPTION_VALUES)[number]

export const SORT_OPTION_VALUES: OpportunitySort[] = [
  'due',
  'fit_score_desc',
  'fit_score_asc',
]

export function getStatusOptions(
  t: TFunction
): Array<{ value: InboxFilter; label: string }> {
  return [
    { value: 'all', label: t('opportunities.statusAllActive') },
    { value: 'early_research', label: t('opportunities.statusEarlyResearch') },
    { value: 'pre_solicitation', label: t('opportunities.statusPreSolicitation') },
    {
      value: 'active_solicitation',
      label: t('opportunities.statusActiveSolicitation'),
    },
    { value: 'watching', label: t('opportunities.statusWatching') },
    { value: 'pursuing', label: t('opportunities.statusPursuing') },
    { value: 'submitted', label: t('opportunities.statusSubmitted') },
    { value: 'won', label: t('opportunities.statusAwarded') },
    { value: 'lost', label: t('opportunities.statusLost') },
    { value: 'no_bid', label: t('opportunities.statusClosed') },
  ]
}

export function getStatusShortLabel(t: TFunction, filter: InboxFilter): string {
  switch (filter) {
    case 'all':
      return t('opportunities.statusShortAll')
    case 'early_research':
      return t('opportunities.statusShortEarly')
    case 'pre_solicitation':
      return t('opportunities.statusShortPreSol')
    case 'active_solicitation':
      return t('opportunities.statusShortActive')
    case 'watching':
      return t('opportunities.statusShortWatch')
    case 'pursuing':
      return t('opportunities.statusShortPursue')
    case 'submitted':
      return t('opportunities.statusShortSubmitted')
    case 'won':
      return t('opportunities.statusShortAwarded')
    case 'lost':
      return t('opportunities.statusShortLost')
    case 'no_bid':
      return t('opportunities.statusShortClosed')
    case 'ignored':
      return t('opportunities.statusShortIgnored')
    default: {
      const exhaustive: never = filter
      return exhaustive
    }
  }
}

export function getIslandLabel(t: TFunction, value: IslandOptionValue): string {
  switch (value) {
    case 'all':
      return t('opportunities.islandAll')
    case 'Oahu':
      return t('opportunities.islandOahu')
    case 'Hawaii':
      return t('opportunities.islandHawaii')
    case 'Maui':
      return t('opportunities.islandMaui')
    case 'Kauai':
      return t('opportunities.islandKauai')
    case 'Molokai':
      return t('opportunities.islandMolokai')
    case 'Lanai':
      return t('opportunities.islandLanai')
    case 'Statewide':
      return t('opportunities.islandStatewide')
    case 'Pacific':
      return t('opportunities.islandPacific')
    case 'Unknown':
      return t('opportunities.islandUnknown')
    default: {
      const exhaustive: never = value
      return exhaustive
    }
  }
}

export function getSortOptions(
  t: TFunction
): Array<{ value: OpportunitySort; label: string }> {
  return [
    { value: 'due', label: t('opportunities.sortDueDate') },
    { value: 'fit_score_desc', label: t('opportunities.sortMatchDesc') },
    { value: 'fit_score_asc', label: t('opportunities.sortMatchAsc') },
  ]
}

export function getSortShortLabel(t: TFunction, sort: OpportunitySort): string {
  switch (sort) {
    case 'due':
      return t('opportunities.sortShortDue')
    case 'fit_score_desc':
      return t('opportunities.sortShortMatchDesc')
    case 'fit_score_asc':
      return t('opportunities.sortShortMatchAsc')
    default: {
      const exhaustive: never = sort
      return exhaustive
    }
  }
}

export function getSourceStageLabel(
  t: TFunction,
  stage: OpportunitySourceStage
): string {
  switch (stage) {
    case 'early_research':
      return t('opportunities.sourceStageEarlyResearch')
    case 'pre_solicitation':
      return t('opportunities.sourceStagePreSolicitation')
    case 'active_solicitation':
      return t('opportunities.sourceStageActiveSolicitation')
    default: {
      const exhaustive: never = stage
      return exhaustive
    }
  }
}

export function getWorkflowStatusLabel(
  t: TFunction,
  status: OpportunityStatus
): string {
  switch (status) {
    case 'none':
      return t('opportunities.workflowOpen')
    case 'watching':
      return t('opportunities.workflowWatching')
    case 'pursuing':
      return t('opportunities.workflowPursuing')
    case 'submitted':
      return t('opportunities.workflowSubmitted')
    case 'won':
      return t('opportunities.workflowAwarded')
    case 'lost':
      return t('opportunities.workflowLost')
    case 'no_bid':
      return t('opportunities.workflowClosed')
    case 'ignored':
      return t('opportunities.workflowIgnored')
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

export function pipelineStatusLabel(
  t: TFunction,
  opportunity: Opportunity
): string {
  if (
    opportunity.addenda.length > 0 &&
    opportunity.status !== 'won' &&
    opportunity.status !== 'lost' &&
    opportunity.status !== 'submitted' &&
    opportunity.status !== 'no_bid' &&
    opportunity.status !== 'ignored'
  ) {
    return t('opportunities.pipelineAmendment')
  }
  return getSourceStageLabel(t, opportunity.source_stage)
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

export function formatDate(t: TFunction, value: string | null): string {
  if (!value) return t('opportunities.notProvided')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('opportunities.notProvided')
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatShortDate(t: TFunction, value: string | null): string {
  if (!value) return t('opportunities.noDeadline')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('opportunities.noDeadline')
  return new Intl.DateTimeFormat(undefined, {
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
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function deadlineLabel(t: TFunction, opportunity: Opportunity): string {
  const days = daysUntil(opportunity.bid_due_at)
  if (days === null) return t('opportunities.noDeadline')
  if (days < 0) {
    return t('opportunities.deadlineOverdue').replace(
      '{days}',
      String(Math.abs(days))
    )
  }
  if (days === 0) return t('opportunities.deadlineDueToday')
  if (days === 1) return t('opportunities.deadlineDueTomorrow')
  return t('opportunities.deadlineDaysLeft').replace('{days}', String(days))
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

export function documentLabel(
  t: TFunction,
  doc: OpportunityDocument,
  index: number
): string {
  const named = doc.name?.trim()
  if (named && !GENERIC_DOCUMENT_LABELS.has(named.toLowerCase())) {
    return named
  }
  try {
    const path = new URL(doc.url).pathname
    const segments = path.split('/').filter(Boolean)
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = decodeURIComponent(segments[i])
      if (
        !GENERIC_DOCUMENT_LABELS.has(segment.toLowerCase()) &&
        segment.includes('.')
      ) {
        return segment
      }
    }
  } catch {
    // fall through
  }
  return t('opportunities.attachmentFallback').replace(
    '{index}',
    String(index + 1)
  )
}

export function ingestStatusLabel(
  t: TFunction,
  status: OpportunityDocument['ingest_status']
): string | null {
  switch (status) {
    case 'queued':
      return t('opportunities.ingestQueued')
    case 'failed':
      return t('opportunities.ingestFailed')
    case 'skipped':
      return t('opportunities.ingestSkipped')
    case 'pending':
      return t('opportunities.ingestPending')
    case undefined:
      return null
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}
