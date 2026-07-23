'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SourceListResponse } from '@/lib/types/api'
import { patchAllSourceListQueries } from '@/lib/utils/source-query-cache'
import { useSourceStatus, useEmbedSource } from '@/lib/hooks/use-sources'
import {
  useExtractKnowledge,
  useSourceExtractors,
} from '@/lib/hooks/use-knowledge'
import { useGraphLiveStore } from '@/lib/stores/graph-live-store'
import { useKnowledgeExtractStore } from '@/lib/stores/knowledge-extract-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { StageActionState } from '@/components/sources/SourceStageActions'
import {
  type SourceCardListFields,
  type SourceStatus,
  drawingProgressLabelKey,
  drawingStageState,
  getStatusConfig,
  isSourceStatus,
  resolveDrawingFillPercent,
  resolvePipelineFillPercent,
} from '@/components/sources/source-card/sourceCardStatus'

export interface UseSourceCardPipelineArgs {
  source: SourceListResponse
  projectId?: string
  menuOpen: boolean
  drawingStatus?: string | null
  drawingBusy?: boolean
}

export function useSourceCardPipeline({
  source,
  projectId,
  menuOpen,
  drawingStatus,
  drawingBusy = false,
}: UseSourceCardPipelineArgs) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [wasProcessing, setWasProcessing] = useState(false)
  const wasKnowledgeGraphRef = useRef(false)

  const sourceWithStatus = source as SourceCardListFields

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
    : sourceWithStatus.command_id
      ? 'new'
      : 'completed'

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
      (currentStatusFromData === 'completed' ||
        currentStatusFromData === 'failed') &&
      (stage === 'completed' || stage === 'failed' || !stage)
    ) {
      setWasProcessing(false)
      useKnowledgeExtractStore.getState().clearPending(source.id)

      if (projectId) {
        if (
          wasKnowledgeGraphRef.current &&
          currentStatusFromData === 'completed'
        ) {
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
  const statusConfig =
    statusConfigMap[stageStatusKey as keyof typeof statusConfigMap] ||
    statusConfigMap.completed

  const isProcessing: boolean =
    currentStatus === 'new' ||
    currentStatus === 'running' ||
    currentStatus === 'queued' ||
    pipelineStage === 'extracting' ||
    pipelineStage === 'embedding' ||
    pipelineStage === 'knowledge_graph'
  const isFailed: boolean =
    currentStatus === 'failed' || pipelineStage === 'failed'
  const isCompleted: boolean = currentStatus === 'completed' && !isFailed
  const apiProgress =
    typeof statusData?.processing_info?.progress === 'number'
      ? Math.round(statusData.processing_info.progress as number)
      : null
  const statusLabel =
    isProcessing &&
    typeof statusData?.message === 'string' &&
    statusData.message.trim()
      ? statusData.message.replace(/\u2026$/, '').replace(/\.\.\.$/, '').trim() ||
        statusConfig.label
      : statusConfig.label

  const isKgPending = useKnowledgeExtractStore((state) =>
    Boolean(state.pendingSourceIds[source.id])
  )
  const { data: extractorData, isFetching: kgStatusLoading } =
    useSourceExtractors(source.id, isCompleted && (menuOpen || isKgPending))
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
  const kgFailed = liveKgStatus === 'failed' || extractorKgStatus === 'failed'
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

  const resolvedDrawingStatus =
    drawingStatus ?? sourceWithStatus.drawing_status ?? null
  const drawingState = drawingStageState(resolvedDrawingStatus)
  const isDrawingProcessing = drawingState === 'running' || Boolean(drawingBusy)
  const showProgressFill = isProcessing || isDrawingProcessing
  const fillPercent = isProcessing
    ? resolvePipelineFillPercent(pipelineStage, currentStatus, apiProgress)
    : isDrawingProcessing
      ? resolveDrawingFillPercent(resolvedDrawingStatus)
      : 0
  const progressLabel = isProcessing
    ? statusData?.message || statusLabel
    : isDrawingProcessing
      ? t(drawingProgressLabelKey(resolvedDrawingStatus))
      : statusLabel

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

  return {
    shouldFetchStatus,
    statusData,
    statusLoading,
    pipelineStage,
    statusConfig,
    statusLabel,
    isProcessing,
    isFailed,
    isCompleted,
    showProgressFill,
    fillPercent,
    progressLabel,
    extractReady,
    embedState,
    kgState,
    drawingState,
    resolvedDrawingStatus,
    embedFailure,
    kgFailure,
    failureDetailsUnavailable,
    kgStatusLoading,
    kgBuilding,
    kgFailed,
    showBuildKnowledgeGraph,
    hasKnowledgeGraph,
    extractKnowledge,
    embedSource,
    handleBuildKnowledgeGraph,
    handleRunEmbeddings,
  }
}
