'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  RefreshCw,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { opportunitiesApi } from '@/lib/api/opportunities'
import {
  useAcknowledgeOpportunityChanges,
  useCheckOpportunityNow,
  useOpportunities,
  useOpportunityChanges,
} from '@/lib/hooks/use-opportunities'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { OpportunityMonitoringHealth } from '@/lib/types/opportunities'
import { cn } from '@/lib/utils'

function healthLabel(t: TFunction, health: OpportunityMonitoringHealth): string {
  switch (health) {
    case 'inactive':
      return t('opportunities.monitoringHealthInactive')
    case 'pending':
      return t('opportunities.monitoringHealthPending')
    case 'healthy':
      return t('opportunities.monitoringHealthHealthy')
    case 'delayed':
      return t('opportunities.monitoringHealthDelayed')
    case 'failing':
      return t('opportunities.monitoringHealthFailing')
    case 'authentication_required':
      return t('opportunities.monitoringHealthAuthRequired')
    case 'source_unavailable':
      return t('opportunities.monitoringHealthSourceUnavailable')
    default: {
      const exhaustive: never = health
      return exhaustive
    }
  }
}

function formatMonitoringDate(t: TFunction, value: string | null): string {
  if (!value) return t('opportunities.notScheduled')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('opportunities.notScheduled')
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function healthVariant(health: OpportunityMonitoringHealth) {
  if (health === 'healthy') return 'secondary' as const
  if (health === 'failing' || health === 'authentication_required') {
    return 'destructive' as const
  }
  return 'outline' as const
}

function isAttentionHealth(health: OpportunityMonitoringHealth): boolean {
  return health !== 'healthy' && health !== 'inactive'
}

/** Collapse long URLs so error alerts wrap cleanly at narrow widths. */
function formatMonitoringError(error: string): string {
  return error.replace(/https?:\/\/\S+/g, (url) => {
    try {
      const parsed = new URL(url.replace(/[),.;]+$/, ''))
      return `${parsed.origin}${parsed.pathname}`
    } catch {
      return `${url.slice(0, 48)}…`
    }
  })
}

function changeSeverityLabel(t: TFunction, severity: string): string {
  if (severity === 'critical') {
    return t('opportunities.changeSeverityCritical')
  }
  if (severity === 'informational') {
    return t('opportunities.changeSeverityInformational')
  }
  return severity
}

function OpportunityMonitoringPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data } = useOpportunities({})
  const monitored = useMemo(
    () => (data?.items ?? []).filter((opportunity) => opportunity.monitoring_enabled),
    [data?.items]
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected =
    monitored.find((opportunity) => opportunity.id === selectedId) ?? monitored[0] ?? null
  const { data: changes = [] } = useOpportunityChanges(selected?.id ?? null)
  const checkNow = useCheckOpportunityNow()
  const acknowledge = useAcknowledgeOpportunityChanges()

  useEffect(() => {
    if (selected?.id !== selectedId) {
      setSelectedId(selected?.id ?? null)
    }
  }, [selected?.id, selectedId])

  const unwatch = useMutation({
    mutationFn: opportunitiesApi.unwatch,
    onSuccess: (opportunity) => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      queryClient.invalidateQueries({
        queryKey: ['opportunity-changes', opportunity.id],
      })
      toast({
        title: t('opportunities.monitoringStoppedTitle'),
        description: t('opportunities.monitoringStoppedDescription').replace(
          '{title}',
          opportunity.title
        ),
      })
    },
    onError: () => {
      toast({
        title: t('opportunities.monitoringStopFailedTitle'),
        variant: 'destructive',
      })
    },
  })

  if (monitored.length === 0) return null

  const unread = monitored.reduce(
    (total, opportunity) => total + opportunity.monitoring_unread_changes,
    0
  )
  const latestChanges = changes.slice(0, 5)

  return (
    <details className="group border-b bg-background px-2 py-1 open:bg-muted/20">
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 text-xs font-medium">
        <Eye className="size-3.5 shrink-0" />
        <span className="truncate">
          {t('opportunities.monitoredCount').replace(
            '{count}',
            String(monitored.length)
          )}
        </span>
        {unread > 0 ? (
          <Badge variant="destructive" className="shrink-0">
            {unread}
          </Badge>
        ) : null}
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-1.5 grid min-w-0 gap-1.5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 divide-y rounded-md border">
          {monitored.map((opportunity) => {
            const selectedRow = opportunity.id === selected?.id
            return (
              <button
                key={opportunity.id}
                type="button"
                onClick={() => setSelectedId(opportunity.id)}
                className={cn(
                  'flex w-full min-w-0 items-start gap-1.5 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50',
                  selectedRow && 'bg-primary/5'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-medium">{opportunity.title}</span>
                    {opportunity.monitoring_unread_changes > 0 ? (
                      <Badge variant="destructive" className="shrink-0">
                        {opportunity.monitoring_unread_changes}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                    {isAttentionHealth(opportunity.monitoring_health) ? (
                      <Badge variant={healthVariant(opportunity.monitoring_health)}>
                        {healthLabel(t, opportunity.monitoring_health)}
                      </Badge>
                    ) : null}
                    <span className="truncate">
                      {t('opportunities.nextCheck').replace(
                        '{date}',
                        formatMonitoringDate(t, opportunity.monitoring_next_check_at)
                      )}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {selected ? (
          <div className="min-w-0 overflow-hidden rounded-md border bg-background p-2">
            <div className="flex min-w-0 items-start gap-1">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{selected.title}</div>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                  {isAttentionHealth(selected.monitoring_health) ? (
                    <Badge variant={healthVariant(selected.monitoring_health)}>
                      {healthLabel(t, selected.monitoring_health)}
                    </Badge>
                  ) : (
                    <span>{healthLabel(t, selected.monitoring_health)}</span>
                  )}
                  <span aria-hidden>·</span>
                  <span className="truncate">
                    {t('opportunities.officialStatus').replace(
                      '{status}',
                      selected.source_status
                    )}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="truncate">
                    {t('opportunities.checkedAt').replace(
                      '{date}',
                      formatMonitoringDate(t, selected.monitoring_last_checked_at)
                    )}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={checkNow.isPending}
                      aria-label={t('opportunities.checkNowAriaLabel')}
                      onClick={() => checkNow.mutate(selected.id)}
                    >
                      <RefreshCw
                        className={cn('size-3.5', checkNow.isPending && 'animate-spin')}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('opportunities.checkNowTooltip')}</TooltipContent>
                </Tooltip>

                {selected.monitoring_unread_changes > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        disabled={acknowledge.isPending}
                        aria-label={t('opportunities.markReadAriaLabel')}
                        onClick={() => acknowledge.mutate(selected.id)}
                      >
                        <Check className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('opportunities.markReadTooltip')}</TooltipContent>
                  </Tooltip>
                ) : null}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={unwatch.isPending}
                      aria-label={t('opportunities.stopMonitoringAriaLabel')}
                      onClick={() => unwatch.mutate(selected.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('opportunities.stopMonitoringTooltip')}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {selected.monitoring_last_error ? (
              <div className="mt-1.5 flex min-w-0 items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-1.5 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span
                  className="min-w-0 break-words"
                  title={selected.monitoring_last_error}
                >
                  {formatMonitoringError(selected.monitoring_last_error)}
                </span>
              </div>
            ) : null}

            <div className="mt-1.5 min-w-0">
              <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Clock3 className="size-3 shrink-0" />
                {t('opportunities.recentChanges')}
              </div>
              {latestChanges.length > 0 ? (
                <div className="mt-0.5 divide-y rounded-md border">
                  {latestChanges.map((change) => (
                    <div key={change.id} className="min-w-0 px-2 py-1.5 text-xs">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        {change.severity !== 'informational' ? (
                          <Badge
                            variant={
                              change.severity === 'critical' ? 'destructive' : 'outline'
                            }
                          >
                            {changeSeverityLabel(t, change.severity)}
                          </Badge>
                        ) : null}
                        <span className="text-[11px] text-muted-foreground">
                          {formatMonitoringDate(t, change.detected_at)}
                        </span>
                        {change.acknowledged ? (
                          <span className="text-[11px] text-muted-foreground">
                            {t('opportunities.changeRead')}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 break-words font-medium">{change.summary}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t('opportunities.changesEmpty')}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  )
}

export default function OpportunitiesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OpportunityMonitoringPanel />
      {children}
    </div>
  )
}
