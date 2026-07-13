'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { SourceListResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, FileText, Link2, ChevronDown, ListChecks } from 'lucide-react'
import { ColumnCardsSkeleton, CompactListRowSkeleton } from '@/components/common/LoadingSkeletons'
import { EmptyState } from '@/components/common/EmptyState'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import { AddExistingSourceDialog } from '@/components/sources/AddExistingSourceDialog'
import { SourceCard } from '@/components/sources/SourceCard'
import { useDeleteSource, useRetrySource, useRemoveSourceFromProject, useIngestAsSource } from '@/lib/hooks/use-sources'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import type { ContextMode } from '@/lib/types/project-context'
import type { SourceBulkAction } from '@/lib/utils/source-context'
import { CollapsibleColumn, createCollapseButton } from '@/components/projects/CollapsibleColumn'
import {
  ColumnHeader,
  columnBodyClassName,
  columnCardClassName,
  columnHeaderIconClassName,
  columnHeaderIconButtonClassName,
  columnHeaderPrimaryButtonClassName,
} from '@/components/projects/ColumnHeader'
import { useProjectColumnsStore } from '@/lib/stores/project-columns-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useRunArtifactInsight } from '@/lib/hooks/use-run-artifact-insight'
import {
  clearArtifactDragData,
  getActiveArtifactDragPayload,
  getArtifactDragData,
  isArtifactDragEvent,
  type ArtifactDragKind,
} from '@/lib/utils/artifact-drag'
import { cn } from '@/lib/utils'

interface SourcesColumnProps {
  sources?: SourceListResponse[]
  isLoading: boolean
  projectId: string
  projectName?: string
  onRefresh?: () => void
  contextSelections?: Record<string, ContextMode>
  onContextModeChange?: (sourceId: string, mode: ContextMode) => void
  onBulkContextModeChange?: (action: SourceBulkAction) => void
  // Pagination props
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  fetchNextPage?: () => void
  hasArtifactTemplates?: boolean
  hasIngestibleArtifacts?: boolean
}

export function SourcesColumn({
  sources,
  isLoading,
  projectId,
  onRefresh,
  contextSelections,
  onContextModeChange,
  onBulkContextModeChange,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  hasArtifactTemplates = false,
  hasIngestibleArtifacts = false,
}: SourcesColumnProps) {
  const { t } = useTranslation()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [droppedArtifactIds, setDroppedArtifactIds] = useState<string[]>([])
  const [isArtifactDragOver, setIsArtifactDragOver] = useState(false)
  const [dragOverKind, setDragOverKind] = useState<ArtifactDragKind | null>(null)
  const [addExistingDialogOpen, setAddExistingDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [sourceToRemove, setSourceToRemove] = useState<string | null>(null)

  const { openModal } = useModalManager()
  const deleteSource = useDeleteSource()
  const retrySource = useRetrySource()
  const removeFromProject = useRemoveSourceFromProject()
  const { runArtifactOnSource } = useRunArtifactInsight()
  const ingestAsSource = useIngestAsSource()

  const enableArtifactDrop = hasArtifactTemplates || hasIngestibleArtifacts

  // Collapsible column state
  const { sourcesCollapsed, toggleSources } = useProjectColumnsStore()
  const collapseButton = useMemo(
    () => createCollapseButton(toggleSources, t('navigation.sources')),
    [toggleSources, t('navigation.sources')]
  )

  // Scroll container ref for infinite scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const artifactDragCounterRef = useRef(0)

  const handleArtifactDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!enableArtifactDrop || !isArtifactDragEvent(event)) return
    event.preventDefault()
    artifactDragCounterRef.current += 1
    setIsArtifactDragOver(true)
    setDragOverKind(getActiveArtifactDragPayload()?.kind ?? null)
  }, [enableArtifactDrop])

  const handleArtifactDragLeave = useCallback(() => {
    artifactDragCounterRef.current = Math.max(0, artifactDragCounterRef.current - 1)
    if (artifactDragCounterRef.current === 0) {
      setIsArtifactDragOver(false)
      setDragOverKind(null)
    }
  }, [])

  const handleArtifactDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!enableArtifactDrop || !isArtifactDragEvent(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragOverKind(getActiveArtifactDragPayload()?.kind ?? null)
  }, [enableArtifactDrop])

  const handleColumnArtifactDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!enableArtifactDrop) return
    event.preventDefault()
    artifactDragCounterRef.current = 0
    setIsArtifactDragOver(false)
    setDragOverKind(null)

    const payload = getArtifactDragData(event.dataTransfer)
    clearArtifactDragData()
    if (!payload) return

    if (payload.kind === 'note') {
      void ingestAsSource.mutateAsync({
        kind: 'note',
        noteId: payload.id,
        projectId,
      })
      return
    }

    setDroppedArtifactIds([payload.id])
    setAddDialogOpen(true)
  }, [enableArtifactDrop, ingestAsSource, projectId])

  const handleArtifactDropOnSource = useCallback(
    (sourceId: string, artifactId: string) => {
      void runArtifactOnSource({ sourceId, artifactId })
    },
    [runArtifactOnSource]
  )

  const handleAddDialogOpenChange = useCallback((open: boolean) => {
    setAddDialogOpen(open)
    if (!open) {
      setDroppedArtifactIds([])
    }
  }, [])

  const emptyStateDescription = hasArtifactTemplates || hasIngestibleArtifacts
    ? `${t('sources.createFirstSource')} ${t('sources.dragTemplateToSource')}`
    : t('sources.createFirstSource')

  const dropOverlayHint =
    dragOverKind === 'note'
      ? t('sources.dropArtifactNoteHint')
      : t('sources.dropArtifactHint')

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || !hasNextPage || isFetchingNextPage || !fetchNextPage) return

    const { scrollTop, scrollHeight, clientHeight } = container
    // Load more when user scrolls within 200px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 200) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Attach scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])
  
  const handleDeleteClick = (sourceId: string) => {
    setSourceToDelete(sourceId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!sourceToDelete) return

    try {
      await deleteSource.mutateAsync(sourceToDelete)
      setDeleteDialogOpen(false)
      setSourceToDelete(null)
      onRefresh?.()
    } catch (error) {
      console.error('Failed to delete source:', error)
    }
  }

  const handleRemoveFromProject = (sourceId: string) => {
    setSourceToRemove(sourceId)
    setRemoveDialogOpen(true)
  }

  const handleRemoveConfirm = async () => {
    if (!sourceToRemove) return

    try {
      await removeFromProject.mutateAsync({
        projectId,
        sourceId: sourceToRemove
      })
      setRemoveDialogOpen(false)
      setSourceToRemove(null)
    } catch (error) {
      console.error('Failed to remove source from project:', error)
      // Error toast is handled by the hook
    }
  }

  const handleRetry = async (sourceId: string) => {
    try {
      await retrySource.mutateAsync(sourceId)
    } catch (error) {
      console.error('Failed to retry source:', error)
    }
  }

  const handleSourceClick = (sourceId: string) => {
    openModal('source', sourceId)
  }

  return (
    <>
      <CollapsibleColumn
        isCollapsed={sourcesCollapsed}
        onToggle={toggleSources}
        collapsedIcon={FileText}
        collapsedLabel={t('navigation.sources')}
      >
        <Card className={columnCardClassName}>
          <ColumnHeader
            title={t('navigation.sources')}
            actions={
              <>
                {onBulkContextModeChange && sources && sources.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={columnHeaderIconButtonClassName}
                        title={t('sources.bulkContext')}
                      >
                        <ListChecks className={columnHeaderIconClassName} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onBulkContextModeChange('insights')}>
                        {t('sources.includeAllInsights')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onBulkContextModeChange('full')}>
                        {t('sources.includeAllFull')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onBulkContextModeChange('exclude')}>
                        {t('sources.excludeAllFromContext')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className={columnHeaderPrimaryButtonClassName}>
                      <Plus className={columnHeaderIconClassName} />
                      {t('sources.addSource')}
                      <ChevronDown className={columnHeaderIconClassName} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setDropdownOpen(false); setAddDialogOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      {t('sources.addSource')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setDropdownOpen(false); setAddExistingDialogOpen(true); }}>
                      <Link2 className="h-4 w-4 mr-2" />
                      {t('sources.addExistingTitle')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {collapseButton}
              </>
            }
          />

          <CardContent
            ref={scrollContainerRef}
            className={cn(columnBodyClassName, 'relative')}
            onDragEnter={enableArtifactDrop ? handleArtifactDragEnter : undefined}
            onDragLeave={enableArtifactDrop ? handleArtifactDragLeave : undefined}
            onDragOver={enableArtifactDrop ? handleArtifactDragOver : undefined}
            onDrop={enableArtifactDrop ? handleColumnArtifactDrop : undefined}
          >
            {isArtifactDragOver && (
              <div
                className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/5"
                aria-hidden
              >
                <p className="px-4 text-center text-sm font-medium text-primary">
                  {dropOverlayHint}
                </p>
              </div>
            )}
            {isLoading ? (
              <ColumnCardsSkeleton count={3} />
            ) : !sources || sources.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={t('sources.noSourcesYet')}
                description={emptyStateDescription}
              />
            ) : (
              <div className="flex flex-col divide-y divide-border/50">
                {sources.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    onClick={handleSourceClick}
                    onDelete={handleDeleteClick}
                    onRetry={handleRetry}
                    onRefreshContent={handleRetry}
                    onRemoveFromProject={handleRemoveFromProject}
                    onRefresh={onRefresh}
                    showRemoveFromProject={true}
                    contextMode={contextSelections?.[source.id]}
                    onContextModeChange={onContextModeChange
                      ? (mode) => onContextModeChange(source.id, mode)
                      : undefined
                    }
                    onArtifactDrop={
                      hasArtifactTemplates
                        ? (artifactId) => handleArtifactDropOnSource(source.id, artifactId)
                        : undefined
                    }
                  />
                ))}
                {/* Loading indicator for infinite scroll */}
                {isFetchingNextPage && <CompactListRowSkeleton />}
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleColumn>

      <AddSourceDialog
        open={addDialogOpen}
        onOpenChange={handleAddDialogOpenChange}
        defaultprojectId={projectId}
        initialArtifactIds={droppedArtifactIds}
      />

      <AddExistingSourceDialog
        open={addExistingDialogOpen}
        onOpenChange={setAddExistingDialogOpen}
        projectId={projectId}
        onSuccess={onRefresh}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('sources.delete')}
        description={t('sources.deleteConfirm')}
        confirmText={t('common.delete')}
        onConfirm={handleDeleteConfirm}
        isLoading={deleteSource.isPending}
        confirmVariant="destructive"
      />

      <ConfirmDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title={t('sources.removeFromProject')}
        description={t('sources.removeConfirm')}
        confirmText={t('common.remove')}
        onConfirm={handleRemoveConfirm}
        isLoading={removeFromProject.isPending}
        confirmVariant="default"
      />
    </>
  )
}
