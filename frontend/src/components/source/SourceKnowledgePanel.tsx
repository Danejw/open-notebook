'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Network, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4" />
          {t('knowledge.title')}
        </CardTitle>
        <CardDescription>{t('knowledge.sourceDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{t('knowledge.genericStatus')}</span>
              <Badge
                variant={statusBadgeVariant(isEmptyCompleted ? 'failed' : runStatus)}
                className="gap-1"
              >
                {isBuilding && <Loader2 className="h-3 w-3 animate-spin" />}
                {statusLabel(runStatus, t)}
                {primary && primary.id !== 'generic' ? ` · ${primary.label}` : ''}
              </Badge>
              {runStats && (runStatus === 'completed' || runStatus === 'failed') && (
                <span className="text-xs text-muted-foreground">
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
                disabled={isBuilding}
                onClick={() => runExtractor('generic', true)}
              >
                {isBuilding ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                {isBuilding
                  ? t('sources.buildingKnowledgeGraph')
                  : t('knowledge.rerunGeneric')}
              </Button>
            </div>

            {runStatus === 'failed' && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">{t('knowledge.extractRunFailed')}</p>
                  {primary?.last_run?.error_message ? (
                    <p className="break-words text-destructive/90">
                      {primary.last_run.error_message}
                    </p>
                  ) : null}
                  {runStats ? (
                    <p className="text-xs text-muted-foreground">
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
                  <p className="text-xs text-muted-foreground">
                    {t('knowledge.extractRunFailedHint')}
                  </p>
                </div>
              </div>
            )}

            {isEmptyCompleted && (
              <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">{t('knowledge.emptyExtractionBanner')}</p>
                  <p className="text-xs opacity-90">{t('knowledge.extractEmptyHint')}</p>
                  {runStats ? (
                    <p className="text-xs opacity-80">
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
              <p className="text-sm text-muted-foreground">
                {t('knowledge.extractQueuedHint')}
              </p>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] space-y-1">
                <label className="text-sm font-medium">
                  {t('knowledge.specializedExtractor')}
                </label>
                <Select value={selectedExtractor} onValueChange={setSelectedExtractor}>
                  <SelectTrigger>
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
                disabled={isBuilding || !selectedExtractor}
                onClick={() => runExtractor(selectedExtractor, true)}
              >
                <Play className="mr-2 h-3.5 w-3.5" />
                {t('knowledge.runExtractor')}
              </Button>
            </div>

            {knowledge?.entities && knowledge.entities.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t('knowledge.entitiesCount').replace(
                    '{count}',
                    String(knowledge.entities.length)
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {knowledge.entities.slice(0, 20).map((entity) => (
                    <Badge key={entity.id} variant="outline">
                      {entity.type}: {entity.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
