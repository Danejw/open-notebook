'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Clock3, Eye, RefreshCw, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { opportunitiesApi } from '@/lib/api/opportunities'
import {
  useAcknowledgeOpportunityChanges,
  useCheckOpportunityNow,
  useOpportunities,
  useOpportunityChanges,
} from '@/lib/hooks/use-opportunities'
import { useToast } from '@/lib/hooks/use-toast'
import type { OpportunityMonitoringHealth } from '@/lib/types/opportunities'

const HEALTH_LABELS: Record<OpportunityMonitoringHealth, string> = {
  inactive: 'Inactive',
  pending: 'Checking',
  healthy: 'Healthy',
  delayed: 'Delayed',
  failing: 'Failing',
  authentication_required: 'API key required',
  source_unavailable: 'Source unavailable',
}

function formatDate(value: string | null): string {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not scheduled'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function healthVariant(health: OpportunityMonitoringHealth) {
  if (health === 'healthy') return 'secondary' as const
  if (health === 'failing' || health === 'authentication_required') return 'destructive' as const
  return 'outline' as const
}

function OpportunityMonitoringPanel() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data } = useOpportunities({})
  const monitored = useMemo(
    () => (data?.items ?? []).filter((opportunity) => opportunity.monitoring_enabled),
    [data?.items]
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = monitored.find((opportunity) => opportunity.id === selectedId) ?? monitored[0] ?? null
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
      queryClient.invalidateQueries({ queryKey: ['opportunity-changes', opportunity.id] })
      toast({
        title: 'Monitoring stopped',
        description: `${opportunity.title} returned to review.`,
      })
    },
    onError: () => {
      toast({
        title: 'Monitoring could not be stopped',
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
    <details className="border-b bg-background px-3 py-2 open:bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium">
        <Eye className="size-4" />
        <span>{monitored.length} monitored opportunities</span>
        {unread > 0 ? <Badge variant="destructive">{unread} unread updates</Badge> : null}
        <span className="ml-auto text-muted-foreground">Open monitoring center</span>
      </summary>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-1.5">
          {monitored.map((opportunity) => (
            <button
              key={opportunity.id}
              type="button"
              onClick={() => setSelectedId(opportunity.id)}
              className={`w-full rounded-md border p-2 text-left text-xs transition-colors hover:bg-muted/50 ${
                opportunity.id === selected?.id ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 font-medium">{opportunity.title}</span>
                {opportunity.monitoring_unread_changes > 0 ? (
                  <Badge variant="destructive">{opportunity.monitoring_unread_changes}</Badge>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge variant={healthVariant(opportunity.monitoring_health)}>
                  {HEALTH_LABELS[opportunity.monitoring_health]}
                </Badge>
                <span>Next {formatDate(opportunity.monitoring_next_check_at)}</span>
              </div>
            </button>
          ))}
        </div>

        {selected ? (
          <div className="rounded-md border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{selected.title}</div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant={healthVariant(selected.monitoring_health)}>
                    {HEALTH_LABELS[selected.monitoring_health]}
                  </Badge>
                  <Badge variant="outline">Official: {selected.source_status}</Badge>
                  <span>Last checked {formatDate(selected.monitoring_last_checked_at)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={checkNow.isPending}
                  onClick={() => checkNow.mutate(selected.id)}
                >
                  <RefreshCw className={`mr-1 size-3.5 ${checkNow.isPending ? 'animate-spin' : ''}`} />
                  Check now
                </Button>
                {selected.monitoring_unread_changes > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acknowledge.isPending}
                    onClick={() => acknowledge.mutate(selected.id)}
                  >
                    <Check className="mr-1 size-3.5" />
                    Mark read
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={unwatch.isPending}
                  onClick={() => unwatch.mutate(selected.id)}
                >
                  <X className="mr-1 size-3.5" />
                  Stop monitoring
                </Button>
              </div>
            </div>

            {selected.monitoring_last_error ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{selected.monitoring_last_error}</span>
              </div>
            ) : null}

            <div className="mt-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Clock3 className="size-3.5" />
                Recent source changes
              </div>
              {latestChanges.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {latestChanges.map((change) => (
                    <div key={change.id} className="rounded-md border p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={change.severity === 'critical' ? 'destructive' : 'outline'}>
                          {change.severity}
                        </Badge>
                        <span className="text-muted-foreground">{formatDate(change.detected_at)}</span>
                        {change.acknowledged ? <span className="text-muted-foreground">Read</span> : null}
                      </div>
                      <div className="mt-1 font-medium">{change.summary}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  The current source snapshot is established. New changes will appear here.
                </div>
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
