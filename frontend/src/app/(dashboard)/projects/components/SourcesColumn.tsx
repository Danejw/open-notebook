'use client'

import { Suspense, useState, useMemo, useRef, useCallback, useEffect, useDeferredValue } from 'react'
import { SourceListResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, FileText, Link2, ChevronDown, ListChecks, Trash2, Unlink, Network, List, Waypoints, RefreshCw, DraftingCompass } from 'lucide-react'
import { ColumnCardsSkeleton, CompactListRowSkeleton } from '@/components/common/LoadingSkeletons'
import { EmptyState } from '@/components/common/EmptyState'
import { ListSelectionBar } from '@/components/common/ListSelectionBar'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import { AddExistingSourceDialog } from '@/components/sources/AddExistingSourceDialog'
import { SourceCard } from '@/components/sources/SourceCard'
import { SourcesFilterBar } from '@/components/sources/SourcesFilterBar'
import { DrawingExtractionResultsDialog } from '@/components/sources/DrawingExtractionResultsDialog'
import { KnowledgeGraphView } from '@/components/knowledge-graph/KnowledgeGraphView'
import { useDeleteSource, useRetrySource, useBulkRetrySources, useRemoveSourceFromProject, useIngestAsSource } from '@/lib/hooks/use-sources'
import { useBulkExtractKnowledge } from '@/lib/hooks/use-knowledge'
import {
  useExtractArchitecturalDrawings,
  useProjectDrawingRuns,
} from '@/lib/hooks/use-drawing-extraction'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import type { ContextMode } from '@/lib/types/project-context'
import type { SourceBulkAction } from '@/lib/utils/source-context'
import {
  collectSourceExtensions,
  DEFAULT_SOURCE_LIST_FILTERS,
  isSourceListFilterActive,
  matchesSourceFilters,
  type SourceListFilterState,
} from '@/lib/utils/source-filters'
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
import { useListSelection } from '@/lib/hooks/useListSelection'
import {
  clearArtifactDragData,
  getActiveArtifactDragPayload,
  getArtifactDragData,
  isArtifactDragEvent,
  type ArtifactDragKind,
} from '@/lib/utils/artifact-drag'
import { cn } from '@/lib/utils'

type SourcesViewMode = 'list' | 'graph'

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
  const [sourcesView, setSourcesView] = useState<SourcesViewMode>('list')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [isArtifactDragOver, setIsArtifactDragOver] = useState(false)
  const [dragOverKind, setDragOverKind] = useState<ArtifactDragKind | null>(null)
  const [addExistingDialogOpen, setAddExistingDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [sourceToRemove, setSourceToRemove] = useState<string | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [drawingResultsRunId, setDrawingResultsRunId] = useState<string | null>(
    null
  )
  const [drawingResultsOpen, setDrawingResultsOpen] = useState(false)
  const [sourceFilters, setSourceFilters] = useState<SourceListFilterState>(
    DEFAULT_SOURCE_LIST_FILTERS
  )
  const deferredFilterQuery = useDeferredValue(sourceFilters.query)

  const {
    selectedIds,
    selectionMode,
    selectedList,
    clearSelection,
    enterSelection,
    toggleSelect,
    selectAllVisible,
    isSelected,
  } = useListSelection()

  const { openModal } = useModalManager()
  const deleteSource = useDeleteSource()
  const retrySource = useRetrySource()
  const bulkRetrySources = useBulkRetrySources()
  const removeFromProject = useRemoveSourceFromProject()
  const ingestAsSource = useIngestAsSource()
  const bulkExtractKnowledge = useBulkExtractKnowledge()
  const extractDrawings = useExtractArchitecturalDrawings()
  const { data: drawingRunsData } = useProjectDrawingRuns(projectId)

  const selectedSources = useMemo(
    () => (sources ?? []).filter((s) => selectedIds.has(s.id)),
    [sources, selectedIds]
  )

  const canExtractDrawings = useMemo(() => {
    if (selectedSources.length === 0) return false
    return selectedSources.every((source) => {
      const path = source.asset?.file_path || ''
      return path.toLowerCase().endsWith('.pdf')
    })
  }, [selectedSources])

  const handleBulkExtractDrawings = useCallback(async () => {
    if (selectedList.length === 0 || !canExtractDrawings) return
    setBulkBusy(true)
    try {
      const result = await extractDrawings.mutateAsync({
        source_ids: selectedList,
        project_id: projectId,
        force: false,
      })
      const firstRun = result.jobs.find((j) => j.success && j.run_id)?.run_id
      if (firstRun) {
        setDrawingResultsRunId(firstRun)
        setDrawingResultsOpen(true)
      }
      clearSelection()
    } catch (error) {
      console.error('Failed to queue drawing extractions:', error)
    } finally {
      setBulkBusy(false)
    }
  }, [
    selectedList,
    canExtractDrawings,
    extractDrawings,
    projectId,
    clearSelection,
  ])

  /** Latest drawing run per source (project poll keeps icons live). */
  const drawingRunBySourceId = useMemo(() => {
    const map = new Map<string, { status: string; runId: string }>()
    for (const run of drawingRunsData?.runs ?? []) {
      const sourceId = String(run.source_id)
      if (map.has(sourceId)) continue
      map.set(sourceId, { status: run.status, runId: run.id })
    }
    return map
  }, [drawingRunsData])

  const effectiveFilters = useMemo(
    () => ({ ...sourceFilters, query: deferredFilterQuery }),
    [sourceFilters, deferredFilterQuery]
  )

  const filteredSources = useMemo(() => {
    const list = sources ?? []
    if (!isSourceListFilterActive(effectiveFilters)) return list
    return list.filter((source) =>
      matchesSourceFilters(source, effectiveFilters, {
        drawingStatus:
          drawingRunBySourceId.get(source.id)?.status ?? source.drawing_status,
      })
    )
  }, [sources, effectiveFilters, drawingRunBySourceId])

  const sourceExtensions = useMemo(
    () => collectSourceExtensions(sources ?? []),
    [sources]
  )

  const handleSelectAllVisible = useCallback(() => {
    selectAllVisible(filteredSources.map((s) => s.id))
  }, [selectAllVisible, filteredSources])

  const handleRunDrawingExtraction = useCallback(
    async (sourceId: string) => {
      try {
        const result = await extractDrawings.mutateAsync({
          source_ids: [sourceId],
          project_id: projectId,
          force: true,
        })
        const runId = result.jobs.find((j) => j.success && j.run_id)?.run_id
        if (runId) {
          setDrawingResultsRunId(runId)
          setDrawingResultsOpen(true)
        }
      } catch (error) {
        console.error('Failed to queue drawing extraction:', error)
      }
    },
    [extractDrawings, projectId]
  )

  const handleInspectDrawing = useCallback((runId: string) => {
    setDrawingResultsRunId(runId)
    setDrawingResultsOpen(true)
  }, [])

  const handleBulkBuildKnowledgeGraph = useCallback(async () => {
    if (selectedList.length === 0) return
    setBulkBusy(true)
    try {
      await bulkExtractKnowledge.mutateAsync({
        sourceIds: selectedList,
        project_id: projectId,
        extractor: 'generic',
        force: true,
      })
      clearSelection()
    } catch (error) {
      console.error('Failed to queue bulk knowledge graph builds:', error)
    } finally {
      setBulkBusy(false)
    }
  }, [
    selectedList,
    bulkExtractKnowledge,
    projectId,
    clearSelection,
  ])

  const handleBulkRetryProcessing = useCallback(async () => {
    if (selectedList.length === 0) return
    setBulkBusy(true)
    try {
      await bulkRetrySources.mutateAsync(selectedList)
      clearSelection()
    } catch (error) {
      console.error('Failed to bulk retry sources:', error)
    } finally {
      setBulkBusy(false)
    }
  }, [selectedList, bulkRetrySources, clearSelection])

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

    setAddDialogOpen(true)
  }, [enableArtifactDrop, ingestAsSource, projectId])

  const handleAddDialogOpenChange = useCallback((open: boolean) => {
    setAddDialogOpen(open)
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

  const handleBulkDeleteConfirm = async () => {
    setBulkBusy(true)
    try {
      for (const id of selectedList) {
        await deleteSource.mutateAsync(id)
      }
      setBulkDeleteOpen(false)
      clearSelection()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to bulk delete sources:', error)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkRemoveConfirm = async () => {
    setBulkBusy(true)
    try {
      for (const id of selectedList) {
        await removeFromProject.mutateAsync({ projectId, sourceId: id })
      }
      setBulkRemoveOpen(false)
      clearSelection()
    } catch (error) {
      console.error('Failed to bulk remove sources:', error)
    } finally {
      setBulkBusy(false)
    }
  }

  const viewModeTabs = (
    <Tabs
      value={sourcesView}
      onValueChange={(value) => {
        if (value === 'list' || value === 'graph') {
          setSourcesView(value)
        }
      }}
      className="gap-0"
    >
      <TabsList className="h-6">
        <TabsTrigger
          value="list"
          className="h-5 gap-0.5 px-1.5"
          title={t('sources.viewList')}
        >
          <List className={columnHeaderIconClassName} />
          <span className="hidden sm:inline">{t('sources.viewList')}</span>
        </TabsTrigger>
        <TabsTrigger
          value="graph"
          className="h-5 gap-0.5 px-1.5"
          title={t('sources.viewGraph')}
        >
          <Waypoints className={columnHeaderIconClassName} />
          <span className="hidden sm:inline">{t('sources.viewGraph')}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const addSourceMenuItems = (
    <>
      <DropdownMenuItem
        onClick={() => {
          setDropdownOpen(false)
          setAddDialogOpen(true)
        }}
      >
        <Plus className="h-4 w-4 mr-2" />
        {t('sources.addSource')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          setDropdownOpen(false)
          setAddExistingDialogOpen(true)
        }}
      >
        <Link2 className="h-4 w-4 mr-2" />
        {t('sources.addExistingTitle')}
      </DropdownMenuItem>
    </>
  )

  const addSourceMenu = (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className={columnHeaderPrimaryButtonClassName}>
          <Plus className={columnHeaderIconClassName} />
          {t('sources.addSource')}
          <ChevronDown className={columnHeaderIconClassName} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{addSourceMenuItems}</DropdownMenuContent>
    </DropdownMenu>
  )

  const addSourceMenuIcon = (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={cn(
            columnHeaderIconButtonClassName,
            'border bg-background/80 shadow-sm backdrop-blur-sm'
          )}
          aria-label={t('sources.addSource')}
          title={t('sources.addSource')}
        >
          <Plus className={columnHeaderIconClassName} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{addSourceMenuItems}</DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      <CollapsibleColumn
        isCollapsed={sourcesCollapsed}
        onToggle={toggleSources}
        collapsedIcon={FileText}
        collapsedLabel={t('navigation.sources')}
      >
        <Card className={columnCardClassName}>
          {sourcesView === 'list' ? (
            <ColumnHeader
              title={t('navigation.sources')}
              actions={
                <>
                  {viewModeTabs}
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
                        <DropdownMenuItem onClick={() => onBulkContextModeChange('full')}>
                          {t('sources.includeAllFull')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onBulkContextModeChange('exclude')}>
                          {t('sources.excludeAllFromContext')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {addSourceMenu}
                  {collapseButton}
                </>
              }
            />
          ) : null}

          <CardContent
            ref={sourcesView === 'list' ? scrollContainerRef : undefined}
            className={cn(
              columnBodyClassName,
              'relative',
              sourcesView === 'graph' && 'overflow-hidden p-0'
            )}
            onDragEnter={
              sourcesView === 'list' && enableArtifactDrop
                ? handleArtifactDragEnter
                : undefined
            }
            onDragLeave={
              sourcesView === 'list' && enableArtifactDrop
                ? handleArtifactDragLeave
                : undefined
            }
            onDragOver={
              sourcesView === 'list' && enableArtifactDrop
                ? handleArtifactDragOver
                : undefined
            }
            onDrop={
              sourcesView === 'list' && enableArtifactDrop
                ? handleColumnArtifactDrop
                : undefined
            }
          >
            {sourcesView === 'graph' ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {t('knowledge.graphLoading')}
                  </div>
                }
              >
                <KnowledgeGraphView
                  projectId={projectId}
                  embedded
                  headerLeading={viewModeTabs}
                  headerTrailing={addSourceMenuIcon}
                />
              </Suspense>
            ) : (
              <>
            {isArtifactDragOver && (
              <div
                className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/5"
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
              <div className="flex min-h-0 flex-1 flex-col">
                <SourcesFilterBar
                  filters={sourceFilters}
                  onChange={setSourceFilters}
                  extensions={sourceExtensions}
                />
                {filteredSources.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title={t('sources.filterNoMatches')}
                    description={t('common.tryDifferentSearch')}
                  />
                ) : (
              <div className="flex flex-col divide-y divide-border/50">
                {selectionMode && (
                  <ListSelectionBar
                    count={selectedIds.size}
                    countLabel={t('sources.selectedCount').replace(
                      '{count}',
                      String(selectedIds.size)
                    )}
                    onClear={clearSelection}
                    onSelectAll={handleSelectAllVisible}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={bulkBusy || bulkRetrySources.isPending}
                      onClick={() => void handleBulkRetryProcessing()}
                    >
                      <RefreshCw
                        className={cn(
                          'mr-1 h-3.5 w-3.5',
                          bulkRetrySources.isPending && 'animate-spin'
                        )}
                      />
                      {bulkRetrySources.isPending
                        ? t('sources.retryingProcessing')
                        : t('sources.retryProcessing')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={bulkBusy || bulkExtractKnowledge.isPending}
                      onClick={() => void handleBulkBuildKnowledgeGraph()}
                    >
                      <Network className="mr-1 h-3.5 w-3.5" />
                      {bulkExtractKnowledge.isPending
                        ? t('sources.buildingKnowledgeGraph')
                        : t('sources.buildKnowledgeGraph')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={
                        bulkBusy ||
                        extractDrawings.isPending ||
                        !canExtractDrawings
                      }
                      title={
                        canExtractDrawings
                          ? t('sources.extractArchitecturalDrawings')
                          : t('sources.drawingExtractPdfOnly')
                      }
                      onClick={() => void handleBulkExtractDrawings()}
                    >
                      <DraftingCompass className="mr-1 h-3.5 w-3.5" />
                      {extractDrawings.isPending
                        ? t('sources.extractingArchitecturalDrawings')
                        : t('sources.extractArchitecturalDrawings')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => setBulkRemoveOpen(true)}
                    >
                      <Unlink className="mr-1 h-3.5 w-3.5" />
                      {t('common.bulkRemove')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-destructive hover:text-destructive"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {t('common.bulkDelete')}
                    </Button>
                  </ListSelectionBar>
                )}
                {filteredSources.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    projectId={projectId}
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
                    selectionMode={selectionMode}
                    selected={isSelected(source.id)}
                    onToggleSelect={toggleSelect}
                    onEnterSelection={enterSelection}
                    drawingStatus={
                      drawingRunBySourceId.get(source.id)?.status ??
                      source.drawing_status
                    }
                    drawingRunId={
                      drawingRunBySourceId.get(source.id)?.runId ?? null
                    }
                    onRunDrawingExtraction={handleRunDrawingExtraction}
                    onInspectDrawing={handleInspectDrawing}
                    drawingBusy={extractDrawings.isPending}
                  />
                ))}
                {/* Loading indicator for infinite scroll */}
                {isFetchingNextPage && <CompactListRowSkeleton />}
              </div>
                )}
              </div>
            )}
              </>
            )}
          </CardContent>
        </Card>
      </CollapsibleColumn>

      <AddSourceDialog
        open={addDialogOpen}
        onOpenChange={handleAddDialogOpenChange}
        defaultprojectId={projectId}
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

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t('sources.delete')}
        description={t('sources.deleteConfirm')}
        confirmText={t('common.delete')}
        onConfirm={handleBulkDeleteConfirm}
        isLoading={bulkBusy}
        confirmVariant="destructive"
      />

      <ConfirmDialog
        open={bulkRemoveOpen}
        onOpenChange={setBulkRemoveOpen}
        title={t('sources.removeFromProject')}
        description={t('sources.removeConfirm')}
        confirmText={t('common.remove')}
        onConfirm={handleBulkRemoveConfirm}
        isLoading={bulkBusy}
        confirmVariant="default"
      />

      <DrawingExtractionResultsDialog
        open={drawingResultsOpen}
        onOpenChange={setDrawingResultsOpen}
        runId={drawingResultsRunId}
        projectId={projectId}
      />
    </>
  )
}
