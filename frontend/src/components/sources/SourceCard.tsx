'use client'

import React, { useState, useEffect, useRef, memo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SourceListResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { patchAllSourceListQueries } from '@/lib/utils/source-query-cache'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  FileText,
  ExternalLink,
  Upload,
  MoreVertical,
  Trash2,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  Unlink,
  EyeOff,
  Lightbulb,
  Network,
} from 'lucide-react'
import { useSourceStatus, useEmbedSource } from '@/lib/hooks/use-sources'
import { useExtractKnowledge, useSourceExtractors } from '@/lib/hooks/use-knowledge'
import { useGraphLiveStore } from '@/lib/stores/graph-live-store'
import { useKnowledgeExtractStore } from '@/lib/stores/knowledge-extract-store'
import { useLongPress } from '@/lib/hooks/use-long-press'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { TFunction } from 'i18next'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { getArtifactDragData, getActiveArtifactDragPayload, isArtifactDragEvent, clearArtifactDragData } from '@/lib/utils/artifact-drag'
import { ContextMode } from '@/app/(dashboard)/projects/[id]/page'
import {
  SourceStageActions,
  type StageActionState,
} from '@/components/sources/SourceStageActions'

interface SourceCardProps {
  source: SourceListResponse
  projectId?: string
  onDelete?: (sourceId: string) => void
  onRetry?: (sourceId: string) => void
  onRefreshContent?: (sourceId: string) => void
  onRemoveFromProject?: (sourceId: string) => void
  onClick?: (sourceId: string) => void
  onRefresh?: () => void
  className?: string
  showRemoveFromProject?: boolean
  contextMode?: ContextMode
  onContextModeChange?: (mode: ContextMode) => void
  onArtifactDrop?: (artifactId: string) => void
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: (sourceId: string) => void
  onEnterSelection?: (sourceId: string) => void
}

const SOURCE_TYPE_ICONS = {
  link: ExternalLink,
  upload: Upload,
  text: FileText,
} as const

/** Discrete pipeline milestones — the card fill width is the only progress UI. */
const PIPELINE_FILL_PERCENT: Record<string, number> = {
  new: 14,
  queued: 10,
  extracting: 32,
  embedding: 58,
  knowledge_graph: 84,
  running: 32,
}

function resolvePipelineFillPercent(
  pipelineStage: string | undefined,
  currentStatus: string,
  apiProgress: number | null
): number {
  const stageFloor =
    (pipelineStage && PIPELINE_FILL_PERCENT[pipelineStage]) ||
    PIPELINE_FILL_PERCENT[currentStatus] ||
    16
  if (apiProgress !== null) {
    return Math.min(99, Math.max(apiProgress, stageFloor))
  }
  return stageFloor
}

const getStatusConfig = (t: TFunction) => ({
  new: {
    icon: Clock,
    color: 'text-blue-600',
    label: t('sources.statusProcessing'),
  },
  queued: {
    icon: Clock,
    color: 'text-blue-600',
    label: t('sources.statusQueued'),
  },
  running: {
    icon: Clock,
    color: 'text-blue-600',
    label: t('sources.statusProcessing'),
  },
  extracting: {
    icon: Clock,
    color: 'text-blue-600',
    label: t('sources.statusProcessing'),
  },
  embedding: {
    icon: Clock,
    color: 'text-blue-600',
    label: t('sources.statusEmbedding'),
  },
  knowledge_graph: {
    icon: Network,
    color: 'text-blue-600',
    label: t('sources.statusKnowledgeGraph'),
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-600',
    label: t('sources.statusCompleted'),
  },
  failed: {
    icon: AlertTriangle,
    color: 'text-red-600',
    label: t('sources.statusFailed'),
  }
} as const)

type SourceStatus = 'new' | 'queued' | 'running' | 'completed' | 'failed'

function isSourceStatus(status: unknown): status is SourceStatus {
  return typeof status === 'string' && ['new', 'queued', 'running', 'completed', 'failed'].includes(status)
}

function getSourceType(source: SourceListResponse): 'link' | 'upload' | 'text' {
  if (source.asset?.url) return 'link'
  if (source.asset?.file_path) return 'upload'
  return 'text'
}

function getSourceTypeLabel(sourceType: 'link' | 'upload' | 'text', t: TFunction): string {
  if (sourceType === 'link') return t('sources.type.link')
  if (sourceType === 'upload') return t('sources.type.file')
  return t('sources.type.text')
}

function SourceCardImpl({
  source,
  projectId,
  onClick,
  onDelete,
  onRetry,
  onRefreshContent,
  onRemoveFromProject,
  onRefresh,
  className,
  showRemoveFromProject = false,
  contextMode,
  onContextModeChange,
  onArtifactDrop,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: SourceCardProps) {
  const { t } = useTranslation()

  const [isArtifactDragOver, setIsArtifactDragOver] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const queryClient = useQueryClient()

  const sourceWithStatus = source as SourceListResponse & {
    command_id?: string
    status?: string
    stage?: string
    pipeline_stage?: string
  }

  // Track processing state to continue polling until we detect completion
  const [wasProcessing, setWasProcessing] = useState(false)
  const wasKnowledgeGraphRef = useRef(false)

  // Only poll status while the source is actually being processed (or just finished
  // and we still need one more poll to catch completion). The list endpoint already
  // populates `status` alongside `command_id`, so we no longer poll for every
  // completed source — that scaled linearly with the number of cards and caused the
  // list lag reported in #503.
  //
  // A source with a `command_id` but no resolved `status` yet is still ambiguous
  // (it renders as a synthetic "new"), so keep polling those until a real status
  // arrives — otherwise such a card would be stuck "processing" forever.
  // Also keep polling while pipeline stages (embed / knowledge graph) are active.
  const listStage = sourceWithStatus.stage || sourceWithStatus.pipeline_stage
  const shouldFetchStatus =
    sourceWithStatus.status === 'new' ||
    sourceWithStatus.status === 'queued' ||
    sourceWithStatus.status === 'running' ||
    listStage === 'extracting' ||
    listStage === 'embedding' ||
    listStage === 'knowledge_graph' ||
    (!!sourceWithStatus.command_id && !sourceWithStatus.status) ||
    wasProcessing

  const { data: statusData, isLoading: statusLoading } = useSourceStatus(
    source.id,
    shouldFetchStatus
  )

  const pipelineStage =
    statusData?.stage ||
    (typeof statusData?.processing_info?.stage === 'string'
      ? statusData.processing_info.stage
      : undefined) ||
    listStage

  const rawStatus = statusData?.status || sourceWithStatus.status
  const currentStatus: SourceStatus = isSourceStatus(rawStatus)
    ? rawStatus
    : (sourceWithStatus.command_id ? 'new' : 'completed')

  useEffect(() => {
    const currentStatusFromData = statusData?.status || sourceWithStatus.status
    const stage =
      statusData?.stage ||
      sourceWithStatus.stage ||
      sourceWithStatus.pipeline_stage

    if (stage === 'knowledge_graph' && projectId) {
      wasKnowledgeGraphRef.current = true
      useGraphLiveStore.getState().setSourceUpdating(projectId, source.id, true)
    }

    if (
      currentStatusFromData === 'new' ||
      currentStatusFromData === 'running' ||
      currentStatusFromData === 'queued' ||
      stage === 'extracting' ||
      stage === 'embedding' ||
      stage === 'knowledge_graph'
    ) {
      setWasProcessing(true)
    }

    if (
      wasProcessing &&
      (currentStatusFromData === 'completed' || currentStatusFromData === 'failed') &&
      (stage === 'completed' || stage === 'failed' || !stage)
    ) {
      setWasProcessing(false)
      useKnowledgeExtractStore.getState().clearPending(source.id)

      if (projectId) {
        if (wasKnowledgeGraphRef.current && currentStatusFromData === 'completed') {
          useGraphLiveStore
            .getState()
            .notifySourceKnowledgeReady(projectId, source.id)
        } else {
          useGraphLiveStore
            .getState()
            .setSourceUpdating(projectId, source.id, false)
        }
        wasKnowledgeGraphRef.current = false
      }

      // Patch this card in the list cache — full list refetch freezes large projects.
      patchAllSourceListQueries(queryClient, (sources) =>
        sources.map((item) =>
          item.id === source.id
            ? {
                ...item,
                status: currentStatusFromData,
                stage: stage || currentStatusFromData,
                pipeline_stage: stage || item.pipeline_stage,
                embedded:
                  typeof statusData?.embedded === 'boolean'
                    ? statusData.embedded
                    : item.embedded,
                kg_status: statusData?.kg_status ?? item.kg_status,
                processing_failures:
                  statusData?.processing_failures ?? item.processing_failures,
                failure_details_unavailable:
                  statusData?.failure_details_unavailable ??
                  item.failure_details_unavailable,
              }
            : item
        )
      )
    }
  }, [
    statusData,
    sourceWithStatus.status,
    sourceWithStatus.stage,
    sourceWithStatus.pipeline_stage,
    wasProcessing,
    source.id,
    projectId,
    queryClient,
  ])

  const statusConfigMap = getStatusConfig(t)
  const stageStatusKey =
    pipelineStage === 'extracting' ||
    pipelineStage === 'embedding' ||
    pipelineStage === 'knowledge_graph'
      ? pipelineStage
      : currentStatus
  const statusConfig = statusConfigMap[stageStatusKey as keyof typeof statusConfigMap] || statusConfigMap.completed
  const StatusIcon = statusConfig.icon
  const sourceType = getSourceType(source)
  const SourceTypeIcon = SOURCE_TYPE_ICONS[sourceType]
  const sourceTypeLabel = getSourceTypeLabel(sourceType, t)

  const title = source.title || t('sources.untitledSource')

  const handleRetry = () => {
    if (onRetry) {
      onRetry(source.id)
    }
  }

  const handleRefreshContent = () => {
    if (onRefreshContent) {
      onRefreshContent(source.id)
    }
  }

  const handleDelete = () => {
    if (onDelete) {
      onDelete(source.id)
    }
  }

  const handleRemoveFromProject = () => {
    if (onRemoveFromProject) {
      onRemoveFromProject(source.id)
    }
  }

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.(source.id)
      return
    }
    if (onClick) {
      onClick(source.id)
    }
  }

  const longPressHandlers = useLongPress({
    disabled: !onEnterSelection && !selectionMode,
    onLongPress: () => {
      if (selectionMode) {
        onToggleSelect?.(source.id)
      } else {
        onEnterSelection?.(source.id)
      }
    },
    onClick: handleCardClick,
  })

  const isProcessing: boolean =
    currentStatus === 'new' ||
    currentStatus === 'running' ||
    currentStatus === 'queued' ||
    pipelineStage === 'extracting' ||
    pipelineStage === 'embedding' ||
    pipelineStage === 'knowledge_graph'
  const isFailed: boolean = currentStatus === 'failed' || pipelineStage === 'failed'
  const isCompleted: boolean = currentStatus === 'completed' && !isFailed
  const apiProgress =
    typeof statusData?.processing_info?.progress === 'number'
      ? Math.round(statusData.processing_info.progress as number)
      : null
  const fillPercent = isProcessing
    ? resolvePipelineFillPercent(pipelineStage, currentStatus, apiProgress)
    : 0
  // Prefer live pipeline message (“Extracting content…”) over generic “Processing”
  const statusLabel =
    isProcessing &&
    typeof statusData?.message === 'string' &&
    statusData.message.trim()
      ? statusData.message.replace(/\u2026$/, '').replace(/\.\.\.$/, '').trim() ||
        statusConfig.label
      : statusConfig.label

  const isKgPending = useKnowledgeExtractStore(
    (state) => Boolean(state.pendingSourceIds[source.id])
  )
  // Lazy-load KG status when the actions menu opens; also poll while a build is pending.
  const { data: extractorData, isFetching: kgStatusLoading } = useSourceExtractors(
    source.id,
    isCompleted && (menuOpen || isKgPending)
  )
  const extractKnowledge = useExtractKnowledge(source.id)
  const embedSource = useEmbedSource()
  const genericRun = extractorData?.extractors?.find((e) => e.id === 'generic')
  const extractorKgStatus = genericRun?.last_run?.status
  const processingFailures =
    statusData?.processing_failures ?? sourceWithStatus.processing_failures
  const embedFailure = processingFailures?.embedding
  const kgFailure =
    processingFailures?.knowledge_graph ??
    (genericRun?.last_run?.status === 'failed' &&
    genericRun.last_run.error_message
      ? {
          stage: 'knowledge_graph' as const,
          message: genericRun.last_run.error_message,
          occurred_at:
            genericRun.last_run.finished_at ?? genericRun.last_run.started_at,
          command_id: genericRun.last_run.command_id,
        }
      : undefined)
  const failureDetailsUnavailable =
    statusData?.failure_details_unavailable ??
    sourceWithStatus.failure_details_unavailable ??
    false
  const liveEmbedded =
    typeof statusData?.embedded === 'boolean'
      ? statusData.embedded
      : Boolean(sourceWithStatus.embedded)
  const liveKgStatus =
    statusData?.kg_status ??
    sourceWithStatus.kg_status ??
    extractorKgStatus ??
    null
  const hasKnowledgeGraph =
    liveKgStatus === 'completed' || extractorKgStatus === 'completed'
  const kgFailed =
    liveKgStatus === 'failed' || extractorKgStatus === 'failed'
  const kgBuilding =
    extractKnowledge.isBuilding ||
    liveKgStatus === 'running' ||
    liveKgStatus === 'queued' ||
    liveKgStatus === 'new'
  const showBuildKnowledgeGraph =
    isCompleted &&
    menuOpen &&
    !kgStatusLoading &&
    !hasKnowledgeGraph &&
    !kgBuilding

  const extractReady =
    liveEmbedded ||
    pipelineStage === 'embedding' ||
    pipelineStage === 'knowledge_graph' ||
    pipelineStage === 'completed' ||
    pipelineStage === 'failed' ||
    isCompleted ||
    isFailed

  const embedState: StageActionState =
    pipelineStage === 'embedding' || embedSource.isPending
      ? 'running'
      : embedFailure || (isFailed && !liveEmbedded)
        ? 'failed'
        : liveEmbedded
          ? 'done'
          : 'idle'

  const kgState: StageActionState = kgBuilding
    ? 'running'
    : kgFailure ||
        kgFailed ||
        (isFailed && liveEmbedded && pipelineStage !== 'embedding')
        ? 'failed'
      : hasKnowledgeGraph
        ? 'done'
        : 'idle'

  const handleBuildKnowledgeGraph = () => {
    extractKnowledge.mutate({
      extractor: 'generic',
      project_id: projectId,
      force: true,
    })
  }

  const handleRunEmbeddings = () => {
    embedSource.mutate({ sourceId: source.id, chainKg: false })
  }

  const handleArtifactDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onArtifactDrop || !isArtifactDragEvent(event)) return
    if (getActiveArtifactDragPayload()?.kind !== 'template') return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setIsArtifactDragOver(true)
  }

  const handleArtifactDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onArtifactDrop || !isArtifactDragEvent(event)) return
    if (getActiveArtifactDragPayload()?.kind !== 'template') return
    event.stopPropagation()
    setIsArtifactDragOver(true)
  }

  const handleArtifactDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onArtifactDrop || !isArtifactDragEvent(event)) return
    if (getActiveArtifactDragPayload()?.kind !== 'template') return
    event.stopPropagation()
    setIsArtifactDragOver(false)
  }

  const handleArtifactDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onArtifactDrop || !isArtifactDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()
    setIsArtifactDragOver(false)

    const payload = getArtifactDragData(event.dataTransfer)
    clearArtifactDragData()
    if (payload?.kind === 'template') {
      onArtifactDrop(payload.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selectionMode ? selected : undefined}
      aria-busy={isProcessing || undefined}
      className={cn(
        'group relative flex flex-col gap-0.5 overflow-hidden rounded-md px-1 py-0.5',
        'cursor-pointer transition-colors select-none',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isFailed && 'bg-destructive/5 hover:bg-destructive/10',
        isProcessing && 'bg-muted/40',
        isArtifactDragOver && 'ring-2 ring-primary bg-primary/10',
        selected && !isProcessing && 'bg-primary/10 ring-1 ring-primary/40',
        selected && isProcessing && 'ring-1 ring-primary/40',
        className
      )}
      {...longPressHandlers}
      onDragEnter={handleArtifactDragEnter}
      onDragOver={handleArtifactDragOver}
      onDragLeave={handleArtifactDragLeave}
      onDrop={handleArtifactDrop}
      title={
        isArtifactDragOver
          ? t('sources.dropArtifactOnSource')
          : isProcessing
            ? `${title} — ${statusData?.message || statusLabel}`
            : title
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCardClick()
        }
      }}
    >
      {isProcessing && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 bg-primary/20 transition-[width] duration-700 ease-out"
          style={{ width: `${fillPercent}%` }}
        />
      )}

      <div className="relative z-[1] flex items-center gap-2 min-w-0">
        {selectionMode ? (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect?.(source.id)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
            aria-label={title}
          />
        ) : (
          <SourceTypeIcon
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-label={sourceTypeLabel}
          />
        )}

        <h4
          className="min-w-0 flex-1 truncate text-sm font-medium leading-snug"
          title={title}
        >
          {title}
        </h4>

        <div className="flex shrink-0 items-center gap-0.5">
          {!selectionMode && (
            <SourceStageActions
              embedState={embedState}
              kgState={kgState}
              extractReady={extractReady}
              embedBusy={embedSource.isPending}
              kgBusy={extractKnowledge.isPending || extractKnowledge.isBuilding}
              embedFailure={embedFailure}
              kgFailure={kgFailure}
              failureDetailsUnavailable={failureDetailsUnavailable}
              onRunEmbeddings={handleRunEmbeddings}
              onRunKnowledgeGraph={handleBuildKnowledgeGraph}
            />
          )}
          {!isCompleted && pipelineStage === 'extracting' && (
            <span
              className={cn(
                'mr-1 inline-flex max-w-[9.5rem] items-center gap-1 truncate text-[11px] font-medium',
                statusConfig.color
              )}
              title={
                statusLoading && shouldFetchStatus
                  ? t('sources.checking')
                  : statusData?.message || statusLabel
              }
            >
              <StatusIcon className={cn('h-3 w-3 shrink-0', isProcessing && 'animate-pulse')} />
              <span className="hidden truncate sm:inline">
                {statusLoading && shouldFetchStatus ? t('sources.checking') : statusLabel}
              </span>
            </span>
          )}
          {!isCompleted && pipelineStage !== 'extracting' && !selectionMode && isProcessing && (
            <span className="sr-only">{statusLabel}</span>
          )}

          {!selectionMode && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                aria-label={t('common.actions')}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {onContextModeChange && contextMode && (
                <>
                  <DropdownMenuLabel>{t('sources.bulkContext')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={contextMode}
                    onValueChange={(value) => onContextModeChange(value as ContextMode)}
                  >
                    <DropdownMenuRadioItem
                      value="off"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EyeOff className="h-4 w-4" />
                      {t('common.contextModes.off')}
                    </DropdownMenuRadioItem>
                    {source.insights_count > 0 && (
                      <DropdownMenuRadioItem
                        value="insights"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Lightbulb className="h-4 w-4" />
                        {t('common.contextModes.insights')}
                      </DropdownMenuRadioItem>
                    )}
                    <DropdownMenuRadioItem
                      value="full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FileText className="h-4 w-4" />
                      {t('common.contextModes.full')}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                </>
              )}

              {showRemoveFromProject && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveFromProject()
                    }}
                    disabled={!onRemoveFromProject}
                  >
                    <Unlink className="h-4 w-4 mr-2" />
                    {t('sources.removeFromProject')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {isFailed && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRetry()
                    }}
                    disabled={!onRetry}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('sources.retryProcessing')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {sourceType === 'link' && isCompleted && onRefreshContent && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRefreshContent()
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('sources.refreshContent')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {isCompleted && (
                <>
                  {kgStatusLoading ? (
                    <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                      <Network className="h-4 w-4 mr-2" />
                      {t('sources.checkingKnowledgeGraph')}
                    </DropdownMenuItem>
                  ) : kgBuilding ? (
                    <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                      <Network className="h-4 w-4 mr-2 animate-pulse" />
                      {t('sources.buildingKnowledgeGraph')}
                    </DropdownMenuItem>
                  ) : kgFailed ? (
                    <>
                      <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                        <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
                        <span className="text-destructive">
                          {t('sources.knowledgeGraphFailed')}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleBuildKnowledgeGraph()
                        }}
                        disabled={extractKnowledge.isBuilding}
                      >
                        <Network className="h-4 w-4 mr-2" />
                        {t('sources.retryKnowledgeGraph')}
                      </DropdownMenuItem>
                    </>
                  ) : showBuildKnowledgeGraph ? (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        handleBuildKnowledgeGraph()
                      }}
                      disabled={extractKnowledge.isBuilding}
                    >
                      <Network className="h-4 w-4 mr-2" />
                      {t('sources.buildKnowledgeGraph')}
                    </DropdownMenuItem>
                  ) : hasKnowledgeGraph ? (
                    <DropdownMenuItem disabled onClick={(e) => e.stopPropagation()}>
                      <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                      {t('sources.knowledgeGraphReady')}
                    </DropdownMenuItem>
                  ) : null}
                  {(kgStatusLoading ||
                    showBuildKnowledgeGraph ||
                    kgBuilding ||
                    kgFailed ||
                    hasKnowledgeGraph) && <DropdownMenuSeparator />}
                </>
              )}

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete()
                }}
                disabled={!onDelete}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('sources.deleteSource')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * SourceCard is rendered in long lists (one per source). Without memoization, any
 * parent re-render (layout toggles, context-selection changes elsewhere) re-rendered
 * every card, causing UI jank that scaled with the number of sources (#503).
 *
 * We compare only the props that affect this card's rendered output. Handler identity
 * is intentionally ignored: callers often pass inline closures, and those closures
 * capture the source id, so a stale closure stays correct as long as the source data
 * below is unchanged.
 */
function topicsEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true
  if ((a?.length ?? 0) !== (b?.length ?? 0)) return false
  if (!a || !b) return true
  return a.every((topic, i) => topic === b[i])
}

function areEqual(prev: SourceCardProps, next: SourceCardProps): boolean {
  if (prev === next) return true

  const p = prev.source as SourceListResponse & {
    command_id?: string
    status?: string
    stage?: string
    pipeline_stage?: string
  }
  const n = next.source as SourceListResponse & {
    command_id?: string
    status?: string
    stage?: string
    pipeline_stage?: string
  }

  return (
    p.id === n.id &&
    p.title === n.title &&
    p.updated === n.updated &&
    p.status === n.status &&
    p.command_id === n.command_id &&
    p.stage === n.stage &&
    p.pipeline_stage === n.pipeline_stage &&
    p.embedded === n.embedded &&
    p.kg_status === n.kg_status &&
    p.processing_failures === n.processing_failures &&
    p.failure_details_unavailable === n.failure_details_unavailable &&
    p.insights_count === n.insights_count &&
    p.asset?.url === n.asset?.url &&
    p.asset?.file_path === n.asset?.file_path &&
    topicsEqual(p.topics, n.topics) &&
    prev.projectId === next.projectId &&
    prev.selectionMode === next.selectionMode &&
    prev.selected === next.selected &&
    prev.contextMode === next.contextMode &&
    prev.showRemoveFromProject === next.showRemoveFromProject &&
    prev.className === next.className
  )
}

export const SourceCard = memo(SourceCardImpl, areEqual)
