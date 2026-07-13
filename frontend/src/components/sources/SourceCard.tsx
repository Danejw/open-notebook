'use client'

import React, { useState, useEffect, memo } from 'react'
import { SourceListResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
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
  Lightbulb
} from 'lucide-react'
import { useSourceStatus } from '@/lib/hooks/use-sources'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { TFunction } from 'i18next'
import { cn } from '@/lib/utils'
import { getArtifactDragData, getActiveArtifactDragPayload, isArtifactDragEvent, clearArtifactDragData } from '@/lib/utils/artifact-drag'
import { ContextToggle } from '@/components/common/ContextToggle'
import { ContextMode } from '@/app/(dashboard)/projects/[id]/page'

interface SourceCardProps {
  source: SourceListResponse
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
}

const SOURCE_TYPE_ICONS = {
  link: ExternalLink,
  upload: Upload,
  text: FileText,
} as const

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
}: SourceCardProps) {
  const { t } = useTranslation()
  const statusConfigMap = getStatusConfig(t)

  const [isArtifactDragOver, setIsArtifactDragOver] = useState(false)

  const sourceWithStatus = source as SourceListResponse & { command_id?: string; status?: string }

  // Track processing state to continue polling until we detect completion
  const [wasProcessing, setWasProcessing] = useState(false)

  // Only poll status while the source is actually being processed (or just finished
  // and we still need one more poll to catch completion). The list endpoint already
  // populates `status` alongside `command_id`, so we no longer poll for every
  // completed source — that scaled linearly with the number of cards and caused the
  // list lag reported in #503.
  //
  // A source with a `command_id` but no resolved `status` yet is still ambiguous
  // (it renders as a synthetic "new"), so keep polling those until a real status
  // arrives — otherwise such a card would be stuck "processing" forever.
  const shouldFetchStatus =
    sourceWithStatus.status === 'new' ||
    sourceWithStatus.status === 'queued' ||
    sourceWithStatus.status === 'running' ||
    (!!sourceWithStatus.command_id && !sourceWithStatus.status) ||
    wasProcessing

  const { data: statusData, isLoading: statusLoading } = useSourceStatus(
    source.id,
    shouldFetchStatus
  )

  const rawStatus = statusData?.status || sourceWithStatus.status
  const currentStatus: SourceStatus = isSourceStatus(rawStatus)
    ? rawStatus
    : (sourceWithStatus.command_id ? 'new' : 'completed')

  useEffect(() => {
    const currentStatusFromData = statusData?.status || sourceWithStatus.status

    if (currentStatusFromData === 'new' || currentStatusFromData === 'running' || currentStatusFromData === 'queued') {
      setWasProcessing(true)
    }

    if (wasProcessing &&
        (currentStatusFromData === 'completed' || currentStatusFromData === 'failed')) {
      setWasProcessing(false)

      if (onRefresh) {
        setTimeout(() => onRefresh(), 500)
      }
    }
  }, [statusData, sourceWithStatus.status, wasProcessing, onRefresh, source.id])

  const statusConfig = statusConfigMap[currentStatus] || statusConfigMap.completed
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
    if (onClick) {
      onClick(source.id)
    }
  }

  const isProcessing: boolean = currentStatus === 'new' || currentStatus === 'running' || currentStatus === 'queued'
  const isFailed: boolean = currentStatus === 'failed'
  const isCompleted: boolean = currentStatus === 'completed'
  const progress =
    typeof statusData?.processing_info?.progress === 'number'
      ? Math.round(statusData.processing_info.progress as number)
      : null

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
      className={cn(
        'group relative flex flex-col gap-0.5 rounded-md px-2 py-1',
        'cursor-pointer transition-colors',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isFailed && 'bg-destructive/5 hover:bg-destructive/10',
        isProcessing && 'bg-primary/5',
        isArtifactDragOver && 'ring-2 ring-primary bg-primary/10',
        className
      )}
      onClick={handleCardClick}
      onDragEnter={handleArtifactDragEnter}
      onDragOver={handleArtifactDragOver}
      onDragLeave={handleArtifactDragLeave}
      onDrop={handleArtifactDrop}
      title={isArtifactDragOver ? t('sources.dropArtifactOnSource') : title}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCardClick()
        }
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <SourceTypeIcon
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-label={sourceTypeLabel}
        />

        <h4
          className="min-w-0 flex-1 truncate text-sm font-medium leading-snug"
          title={title}
        >
          {title}
        </h4>

        <div className="flex shrink-0 items-center gap-0.5">
          {!isCompleted && (
            <span
              className={cn(
                'mr-1 inline-flex items-center gap-1 text-[11px] font-medium',
                statusConfig.color
              )}
              title={statusLoading && shouldFetchStatus ? t('sources.checking') : statusConfig.label}
            >
              <StatusIcon className={cn('h-3 w-3', isProcessing && 'animate-pulse')} />
              <span className="hidden sm:inline">
                {statusLoading && shouldFetchStatus ? t('sources.checking') : statusConfig.label}
              </span>
            </span>
          )}

          {onContextModeChange && contextMode && (
            <ContextToggle
              mode={contextMode}
              hasInsights={source.insights_count > 0}
              onChange={onContextModeChange}
              className="h-7 w-7"
            />
          )}

          <DropdownMenu>
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
            <DropdownMenuContent align="end" className="w-48">
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
        </div>
      </div>

      {/* Compact meta: type once + insights; status message only when useful */}
      <div className="flex items-center gap-1.5 pl-[22px] text-[11px] text-muted-foreground min-w-0">
        <span className="shrink-0">{sourceTypeLabel}</span>

        {isCompleted && source.insights_count > 0 && (
          <>
            <span className="text-border" aria-hidden>·</span>
            <span className="inline-flex items-center gap-0.5 shrink-0">
              <Lightbulb className="h-3 w-3" />
              {source.insights_count}
            </span>
          </>
        )}

        {statusData?.message && (isProcessing || isFailed) && (
          <>
            <span className="text-border" aria-hidden>·</span>
            <span className="truncate italic" title={statusData.message}>
              {statusData.message}
            </span>
          </>
        )}

        {isProcessing && progress !== null && (
          <>
            <span className="text-border" aria-hidden>·</span>
            <span className="shrink-0 tabular-nums">{progress}%</span>
          </>
        )}

        {isFailed && (
          <>
            <span className="text-border" aria-hidden>·</span>
            <button
              type="button"
              className="shrink-0 font-medium text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                handleRetry()
              }}
              disabled={!onRetry}
            >
              {t('sources.retryProcessing')}
            </button>
          </>
        )}
      </div>

      {isProcessing && progress !== null && (
        <div className="ml-[22px] h-0.5 w-[calc(100%-22px)] overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
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

  const p = prev.source as SourceListResponse & { command_id?: string; status?: string }
  const n = next.source as SourceListResponse & { command_id?: string; status?: string }

  return (
    p.id === n.id &&
    p.title === n.title &&
    p.updated === n.updated &&
    p.status === n.status &&
    p.command_id === n.command_id &&
    p.embedded === n.embedded &&
    p.insights_count === n.insights_count &&
    p.asset?.url === n.asset?.url &&
    p.asset?.file_path === n.asset?.file_path &&
    topicsEqual(p.topics, n.topics) &&
    prev.contextMode === next.contextMode &&
    prev.showRemoveFromProject === next.showRemoveFromProject &&
    prev.className === next.className
  )
}

export const SourceCard = memo(SourceCardImpl, areEqual)
