'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  useEmbeddingDimensionHealth,
  useRebuildEmbeddings,
  useRebuildEmbeddingsStatus,
} from '@/lib/hooks/use-embedding-admin'
import { useTranslation } from '@/lib/hooks/use-translation'

export function RebuildEmbeddings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'existing' | 'all'>('existing')
  const [includeSources, setIncludeSources] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [chainKg, setChainKg] = useState(false)
  const [commandId, setCommandId] = useState<string | null>(null)

  const dimensionHealthQuery = useEmbeddingDimensionHealth()
  const rebuildMutation = useRebuildEmbeddings()
  const statusQuery = useRebuildEmbeddingsStatus(commandId)
  const status = statusQuery.data ?? null

  useEffect(() => {
    if (status?.status === 'completed' || status?.status === 'failed') {
      void queryClient.invalidateQueries({
        queryKey: ['embeddings', 'dimension-health'],
      })
    }
  }, [status?.status, queryClient])

  const handleStartRebuild = () => {
    rebuildMutation.mutate(
      {
        mode,
        include_sources: includeSources,
        include_artifacts: includeNotes,
        include_notes: includeNotes,
        chain_kg: chainKg,
      },
      {
        onSuccess: (data) => {
          setCommandId(data.command_id)
        },
      }
    )
  }

  const handleReset = () => {
    setCommandId(null)
    rebuildMutation.reset()
  }

  const isAnyTypeSelected = includeSources || includeNotes
  const isRebuildActive =
    !!commandId &&
    !!status &&
    (status.status === 'queued' || status.status === 'running')

  const progressData = status?.progress
  const stats = status?.stats

  const totalItems = progressData?.total_items ?? progressData?.total ?? 0
  const processedItems = progressData?.processed_items ?? progressData?.processed ?? 0
  const derivedProgressPercent = progressData?.percentage ?? (totalItems > 0 ? (processedItems / totalItems) * 100 : 0)
  const progressPercent = Number.isFinite(derivedProgressPercent) ? derivedProgressPercent : 0

  const sourcesProcessed = stats?.sources_processed ?? stats?.sources ?? 0
  const notesProcessed = stats?.notes_processed ?? stats?.notes ?? 0
  const failedItems = stats?.failed_items ?? stats?.failed ?? 0

  const computedDuration = status?.started_at && status?.completed_at
    ? (new Date(status.completed_at).getTime() - new Date(status.started_at).getTime()) / 1000
    : undefined
  const processingTimeSeconds = stats?.processing_time ?? computedDuration

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t('advanced.rebuildEmbeddings')}
        </CardTitle>
        <CardDescription>
          {t('advanced.rebuildEmbeddingsDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {dimensionHealthQuery.data?.needs_rebuild && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('models.rebuildRequired')}</AlertTitle>
            <AlertDescription>
              {dimensionHealthQuery.data.message || t('models.rebuildReason')}
            </AlertDescription>
          </Alert>
        )}
        {dimensionHealthQuery.data
          && !dimensionHealthQuery.data.needs_rebuild
          && dimensionHealthQuery.data.expected_dimension != null
          && dimensionHealthQuery.data.indexed_total > 0 && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              {dimensionHealthQuery.data.message}
            </AlertDescription>
          </Alert>
        )}
        {/* Configuration Form */}
        {!isRebuildActive && (
          <div className="space-y-3">
            <div className="space-y-3">
              <Label htmlFor="mode">{t('advanced.rebuild.mode')}</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as 'existing' | 'all')}>
                <SelectTrigger id="mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">{t('advanced.rebuild.existing')}</SelectItem>
                  <SelectItem value="all">{t('advanced.rebuild.all')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {mode === 'existing'
                  ? t('advanced.rebuild.existingDesc')
                  : t('advanced.rebuild.allDesc')}
              </p>
            </div>

            <div className="space-y-3" role="group" aria-labelledby="include-label">
              <span id="include-label" className="text-sm font-medium leading-none">{t('advanced.rebuild.include')}</span>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sources"
                    checked={includeSources}
                    onCheckedChange={(checked) => setIncludeSources(checked === true)}
                  />
                  <Label htmlFor="sources" className="font-normal cursor-pointer">
                    {t('navigation.sources')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="notes"
                    checked={includeNotes}
                    onCheckedChange={(checked) => setIncludeNotes(checked === true)}
                  />
                  <Label htmlFor="notes" className="font-normal cursor-pointer">
                    {t('common.notes')}
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="chain-kg"
                    checked={chainKg}
                    onCheckedChange={(checked) => setChainKg(checked === true)}
                    disabled={!includeSources}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="chain-kg" className="font-normal cursor-pointer">
                      {t('advanced.rebuild.chainKg')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('advanced.rebuild.chainKgDesc')}
                    </p>
                  </div>
                </div>
              </div>
              {!isAnyTypeSelected && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('advanced.rebuild.selectOneError')}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <Button
              onClick={handleStartRebuild}
              disabled={!isAnyTypeSelected || rebuildMutation.isPending}
              className="w-full"
            >
              {rebuildMutation.isPending ? (
                <>
                  <InlineSkeleton className="mr-2" />
                  {t('advanced.rebuild.starting')}
                </>
              ) : (
                t('advanced.rebuild.startBtn')
              )}
            </Button>

            {rebuildMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('advanced.rebuild.failed')}: {(rebuildMutation.error as Error)?.message || t('common.error')}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Status Display */}
        {status && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {status.status === 'queued' && <Clock className="h-5 w-5 text-yellow-500" />}
                {status.status === 'running' && <Skeleton className="h-5 w-5 rounded-sm" />}
                {status.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                {status.status === 'failed' && <XCircle className="h-5 w-5 text-destructive" />}
                <div className="flex flex-col">
                  <span className="font-medium">
                    {status.status === 'queued' && t('advanced.rebuild.queued')}
                    {status.status === 'running' && t('advanced.rebuild.running')}
                    {status.status === 'completed' && t('advanced.rebuild.completed')}
                    {status.status === 'failed' && t('advanced.rebuild.failed')}
                  </span>
                  {status.status === 'running' && (
                    <span className="text-sm text-muted-foreground">
                      {t('advanced.rebuild.leavePageHint')}
                    </span>
                  )}
                </div>
              </div>
              {(status.status === 'completed' || status.status === 'failed') && (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  {t('advanced.rebuild.startNew')}
                </Button>
              )}
            </div>

            {progressData && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('common.progress')}</span>
                  <span className="font-medium">
                    {t('advanced.rebuild.itemsProcessed')
                      .replace('{processed}', processedItems.toString())
                      .replace('{total}', totalItems.toString())
                      .replace('{percent}', progressPercent.toFixed(1))}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                {failedItems > 0 && (
                  <p className="text-sm text-yellow-600">
                    ⚠️ {t('advanced.rebuild.failedItems').replace('{count}', failedItems.toString())}
                  </p>
                )}
              </div>
            )}

             {stats && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('navigation.sources')}</p>
                  <p className="text-2xl font-bold">{sourcesProcessed}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('common.notes')}</p>
                  <p className="text-2xl font-bold">{notesProcessed}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('advanced.rebuild.time')}</p>
                  <p className="text-2xl font-bold">
                    {processingTimeSeconds !== undefined ? `${processingTimeSeconds.toFixed(1)}s` : '—'}
                  </p>
                </div>
              </div>
            )}

            {status.error_message && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{status.error_message}</AlertDescription>
              </Alert>
            )}

            {status.started_at && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{t('common.created').replace('{time}', new Date(status.started_at).toLocaleString())}</p>
                {status.completed_at && (
                  <p>{t('projects.updated')}: {new Date(status.completed_at).toLocaleString()}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Help Section */}
         <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="when">
            <AccordionTrigger>{t('advanced.rebuild.whenToRebuild')}</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm">
              <p>{t('advanced.rebuild.whenToRebuildAns')}</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="time">
            <AccordionTrigger>{t('advanced.rebuild.howLong')}</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm">
              <p>{t('advanced.rebuild.howLongAns')}</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="safe">
            <AccordionTrigger>{t('advanced.rebuild.isSafe')}</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm">
              <p>{t('advanced.rebuild.isSafeAns')}</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
