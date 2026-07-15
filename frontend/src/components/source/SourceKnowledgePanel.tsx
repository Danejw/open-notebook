'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  useExtractKnowledge,
  useSourceExtractors,
  useSourceKnowledge,
} from '@/lib/hooks/use-knowledge'
import type { KnowledgeExtractorInfo } from '@/lib/api/knowledge'

interface SourceKnowledgePanelProps {
  sourceId: string
  projectId?: string
}

function statusBadgeVariant(
  status?: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default'
    case 'failed':
      return 'destructive'
    case 'running':
    case 'queued':
      return 'secondary'
    default:
      return 'outline'
  }
}

function statusLabel(
  status: string | undefined,
  t: (key: string) => string
): string {
  switch (status) {
    case 'running':
      return t('knowledge.statusRunning')
    case 'queued':
      return t('knowledge.statusQueued')
    case 'completed':
      return t('knowledge.statusCompleted')
    case 'failed':
      return t('knowledge.statusFailed')
    default:
      return t('knowledge.notRun')
  }
}

function runGraphContentCount(stats?: Record<string, number>): number {
  if (!stats) return 0
  return (
    Number(stats.entities ?? 0) +
    Number(stats.claims ?? 0) +
    Number(stats.relations ?? 0)
  )
}

function pickPrimaryExtractor(
  extractors: KnowledgeExtractorInfo[]
): KnowledgeExtractorInfo | undefined {
  const withRuns = extractors
    .filter((e) => e.last_run?.status)
    .sort((a, b) => {
      const aTime = String(a.last_run?.started_at ?? a.last_run?.finished_at ?? '')
      const bTime = String(b.last_run?.started_at ?? b.last_run?.finished_at ?? '')
      return bTime.localeCompare(aTime)
    })
  if (withRuns.length > 0) return withRuns[0]
  return extractors.find((e) => e.id === 'generic') ?? extractors[0]
}

export function SourceKnowledgePanel({ sourceId, projectId }: SourceKnowledgePanelProps) {
  const { t } = useTranslation()
  const { data: extractorData, isLoading } = useSourceExtractors(sourceId)
  const { data: knowledge } = useSourceKnowledge(sourceId)
  const extractMutation = useExtractKnowledge(sourceId)
  const [selectedExtractor, setSelectedExtractor] = useState('drawing')

  const specialized = useMemo(
    () => (extractorData?.extractors ?? []).filter((e) => !e.auto_run),
    [extractorData]
  )
  const primary = useMemo(
    () => pickPrimaryExtractor(extractorData?.extractors ?? []),
    [extractorData]
  )

  const runStatus = primary?.last_run?.status
  const runStats = primary?.last_run?.stats
  const graphContent = runGraphContentCount(runStats)
  const entityCount = knowledge?.entities?.length ?? Number(runStats?.entities ?? 0)
  const isEmptyCompleted = runStatus === 'completed' && graphContent === 0 && entityCount === 0
  const isBuilding =
    extractMutation.isBuilding ||
    runStatus === 'running' ||
    runStatus === 'queued'

  const runExtractor = (extractor: string, force = true) => {
    extractMutation.mutate({
      extractor,
      project_id: projectId,
      force,
    })
  }

  return (
    <div className="space-y-1 rounded-md border border-border/60 p-1">
      {isLoading ? (
        <p className="px-0.5 py-2 text-[11px] text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1">
            <Badge
              variant={statusBadgeVariant(isEmptyCompleted ? 'failed' : runStatus)}
              className="h-5 gap-1 px-1.5 text-[10px]"
            >
              {isBuilding && <Loader2 className="h-3 w-3 animate-spin" />}
              {statusLabel(runStatus, t)}
              {primary && primary.id !== 'generic' ? ` · ${primary.label}` : ''}
            </Badge>
            {runStats && (runStatus === 'completed' || runStatus === 'failed') && (
              <span className="text-[11px] text-muted-foreground">
                {t('knowledge.statsSummary')
                  .replace(
                    '{entities}',
                    String(runStats.entities ?? knowledge?.entities?.length ?? 0)
                  )
                  .replace(
                    '{claims}',
                    String(runStats.claims ?? knowledge?.claims?.length ?? 0)
                  )
                  .replace(
                    '{relations}',
                    String(
                      runStats.relations ?? knowledge?.relations?.length ?? 0
                    )
                  )}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7"
              disabled={isBuilding}
              onClick={() => runExtractor('generic', true)}
            >
              {isBuilding ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isBuilding
                ? t('sources.buildingKnowledgeGraph')
                : t('knowledge.rerunGeneric')}
            </Button>
          </div>

          {runStatus === 'failed' && (
            <div className="flex gap-1 rounded-md border border-destructive/30 bg-destructive/5 p-1.5 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{t('knowledge.extractRunFailed')}</p>
                {primary?.last_run?.error_message ? (
                  <p className="break-words text-destructive/90">
                    {primary.last_run.error_message}
                  </p>
                ) : null}
                {runStats ? (
                  <p className="text-muted-foreground">
                    {[
                      runStats.extractor
                        ? `extractor=${String(runStats.extractor)}`
                        : primary?.id
                          ? `extractor=${primary.id}`
                          : null,
                      runStats.full_text_length != null
                        ? `full_text_length=${String(runStats.full_text_length)}`
                        : null,
                      runStats.callout_count != null
                        ? `callout_count=${String(runStats.callout_count)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  {t('knowledge.extractRunFailedHint')}
                </p>
              </div>
            </div>
          )}

          {isEmptyCompleted && (
            <div className="flex gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-1.5 text-[11px] text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{t('knowledge.emptyExtractionBanner')}</p>
                <p className="opacity-90">{t('knowledge.extractEmptyHint')}</p>
                {runStats ? (
                  <p className="opacity-80">
                    {[
                      primary?.id ? `extractor=${primary.id}` : null,
                      runStats.full_text_length != null
                        ? `full_text_length=${String(runStats.full_text_length)}`
                        : null,
                      runStats.callout_count != null
                        ? `callout_count=${String(runStats.callout_count)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {isBuilding && (
            <p className="px-0.5 text-[11px] text-muted-foreground">
              {t('knowledge.extractQueuedHint')}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-1">
            <div className="min-w-[160px] flex-1 space-y-0.5">
              <label className="text-[11px] text-muted-foreground">
                {t('knowledge.specializedExtractor')}
              </label>
              <Select value={selectedExtractor} onValueChange={setSelectedExtractor}>
                <SelectTrigger className="h-7">
                  <SelectValue placeholder={t('knowledge.selectExtractor')} />
                </SelectTrigger>
                <SelectContent>
                  {specialized.map((ext) => (
                    <SelectItem key={ext.id} value={ext.id}>
                      {ext.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="h-7"
              disabled={isBuilding || !selectedExtractor}
              onClick={() => runExtractor(selectedExtractor, true)}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              {t('knowledge.runExtractor')}
            </Button>
          </div>

          {knowledge?.entities && knowledge.entities.length > 0 && (
            <div className="space-y-0.5 px-0.5">
              <p className="text-[11px] text-muted-foreground">
                {t('knowledge.entitiesCount').replace(
                  '{count}',
                  String(knowledge.entities.length)
                )}
              </p>
              <div className="flex flex-wrap gap-0.5">
                {knowledge.entities.slice(0, 20).map((entity) => (
                  <Badge key={entity.id} variant="outline" className="h-5 px-1.5 text-[10px]">
                    {entity.type}: {entity.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
