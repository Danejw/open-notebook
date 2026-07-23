'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Eye,
  FileSearch,
  MapPin,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react'

import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useArchiveOpportunity,
  useOpportunity,
  usePursueOpportunity,
  useSetOpportunityStatus,
} from '@/lib/hooks/use-opportunities'
import type { Opportunity, OpportunityStatus } from '@/lib/types/opportunities'
import {
  WORKFLOW_STATUS_LABELS,
  deadlineLabel,
  documentLabel,
  formatDate,
  formatMoney,
  ingestStatusLabel,
  pipelineStatusLabel,
  sourceStageVariant,
  workflowStatusVariant,
} from '@/app/(dashboard)/opportunities/components/opportunityUtils'

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


export function OpportunityDetail({
  opportunity: listOpportunity,
}: {
  opportunity: Opportunity
}) {
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


