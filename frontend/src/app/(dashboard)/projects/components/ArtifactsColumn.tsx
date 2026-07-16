'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { ProjectArtifactResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Trash2, FileText, EyeOff } from 'lucide-react'
import { CompactListRowSkeleton } from '@/components/common/LoadingSkeletons'
import { EmptyState } from '@/components/common/EmptyState'
import { ListSelectionBar } from '@/components/common/ListSelectionBar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArtifactEditorDialog } from './ArtifactEditorDialog'
import { ArtifactTemplatePhases } from './ArtifactTemplatePhases'
import { ArtifactListRow } from './ArtifactListRow'
import { ArtifactViewerDialog } from './ArtifactViewerDialog'
import type { NoteContextMode } from '@/lib/types/project-context'
import {
  useDeleteProjectArtifact,
  useExportProjectArtifactPdf,
  useProjectArtifact,
  useUpdateProjectArtifact,
} from '@/lib/hooks/use-project-artifacts'
import { useArtifacts } from '@/lib/hooks/use-artifacts'
import { useIngestAsSource } from '@/lib/hooks/use-sources'
import { useListSelection } from '@/lib/hooks/useListSelection'
import { useToast } from '@/lib/hooks/use-toast'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormDialogShell } from '@/components/common/FormDialogShell'
import { CollapsibleColumn, createCollapseButton } from '@/components/projects/CollapsibleColumn'
import {
  ColumnHeader,
  columnCardClassName,
  columnHeaderIconClassName,
  columnHeaderPrimaryButtonClassName,
} from '@/components/projects/ColumnHeader'
import { useProjectColumnsStore } from '@/lib/stores/project-columns-store'
import { useProjectActivityStore } from '@/lib/stores/project-activity-store'
import { UnreadDot } from '@/components/ui/unread-dot'
import { useTranslation } from '@/lib/hooks/use-translation'
import { downloadArtifactMarkdown, normalizeArtifactId } from '@/lib/utils/export-artifact'
import { projectArtifactsApi } from '@/lib/api/project-artifacts'
import { isGeneratedArtifact } from '@/lib/utils/project-artifact-kind'
import { getApiErrorKey } from '@/lib/utils/error-handler'

interface ArtifactsColumnProps {
  notes?: ProjectArtifactResponse[]
  isLoading: boolean
  projectId: string
  contextSelections?: Record<string, NoteContextMode>
  onContextModeChange?: (noteId: string, mode: NoteContextMode) => void
  onTemplateClick?: (artifactId: string) => void
}

export function ArtifactsColumn({
  notes,
  isLoading,
  projectId,
  contextSelections,
  onContextModeChange,
  onTemplateClick,
}: ArtifactsColumnProps) {
  const { t, language } = useTranslation()
  const { data: templates = [], isLoading: templatesLoading } = useArtifacts()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingNote, setEditingNote] = useState<ProjectArtifactResponse | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null)
  const [viewingArtifact, setViewingArtifact] = useState<ProjectArtifactResponse | null>(null)
  const [renamingNote, setRenamingNote] = useState<ProjectArtifactResponse | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const suppressClickRef = useRef(false)

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

  const handleSelectAllVisible = useCallback(() => {
    selectAllVisible((notes ?? []).map((n) => n.id))
  }, [selectAllVisible, notes])

  const applyBulkNoteContext = useCallback(
    (mode: NoteContextMode) => {
      if (!onContextModeChange) return
      for (const id of selectedList) {
        onContextModeChange(id, mode)
      }
    },
    [onContextModeChange, selectedList]
  )

  const deleteNote = useDeleteProjectArtifact()
  const updateNote = useUpdateProjectArtifact()
  const exportNotePdf = useExportProjectArtifactPdf()
  const ingestAsSource = useIngestAsSource()
  const { toast } = useToast()

  const viewingNoteId = viewingArtifact?.id ? normalizeArtifactId(viewingArtifact.id) : ''

  const { data: fetchedViewingNote, isLoading: viewingNoteLoading } = useProjectArtifact(
    viewingNoteId,
    {
      enabled: Boolean(viewingArtifact),
    }
  )

  const displayViewingNote = fetchedViewingNote ?? viewingArtifact

  const { artifactsCollapsed, toggleArtifacts } = useProjectColumnsStore()
  const unseenArtifactIds = useProjectActivityStore(
    (state) => state.unseenArtifactIdsByProject[projectId] ?? []
  )
  const markArtifactSeen = useProjectActivityStore((state) => state.markArtifactSeen)
  const hasUnseenArtifacts = unseenArtifactIds.length > 0
  const unseenIdSet = useMemo(() => new Set(unseenArtifactIds), [unseenArtifactIds])
  const notesLabel = t('common.artifacts')
  const collapseButton = useMemo(
    () => createCollapseButton(toggleArtifacts, notesLabel),
    [toggleArtifacts, notesLabel]
  )
  const artifactsTitleAdornment = hasUnseenArtifacts ? <UnreadDot /> : undefined

  const handleOpenArtifact = useCallback(
    (note: ProjectArtifactResponse) => {
      markArtifactSeen(projectId, note.id)
      setViewingArtifact(note)
    },
    [markArtifactSeen, projectId]
  )

  const handleDeleteClick = (noteId: string) => {
    setNoteToDelete(noteId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!noteToDelete) return

    try {
      await deleteNote.mutateAsync(noteToDelete)
      setDeleteDialogOpen(false)
      setNoteToDelete(null)
    } catch (error) {
      console.error('Failed to delete note:', error)
    }
  }

  const handleBulkDeleteConfirm = async () => {
    setBulkBusy(true)
    try {
      for (const id of selectedList) {
        await deleteNote.mutateAsync(id)
      }
      setBulkDeleteOpen(false)
      clearSelection()
    } catch (error) {
      console.error('Failed to bulk delete artifacts:', error)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleIngestNote = async (note: ProjectArtifactResponse) => {
    if (!isGeneratedArtifact(note)) return
    await ingestAsSource.mutateAsync({
      kind: 'note',
      noteId: note.id,
      projectId,
    })
  }

  const handleExportPdf = async (note: ProjectArtifactResponse) => {
    await exportNotePdf.mutateAsync(note.id)
  }

  const handleExportMarkdown = async (note: ProjectArtifactResponse) => {
    try {
      let title = note.title || ''
      let content = note.content || ''

      if (!content) {
        const fullNote = await projectArtifactsApi.get(normalizeArtifactId(note.id))
        title = fullNote.title || title
        content = fullNote.content || ''
      }

      downloadArtifactMarkdown(title, content)
      toast({
        title: t('common.success'),
        description: t('projects.exportMarkdownSuccess'),
      })
    } catch (error) {
      toast({
        title: t('common.error'),
        description: getApiErrorKey(error, t('projects.failedToExportMarkdown')),
        variant: 'destructive',
      })
    }
  }

  const handleRenameOpen = (note: ProjectArtifactResponse) => {
    setRenamingNote(note)
    setRenameTitle(note.title || '')
  }

  const handleRenameConfirm = async () => {
    if (!renamingNote) return

    const trimmed = renameTitle.trim()
    if (!trimmed) return

    const noteId = normalizeArtifactId(renamingNote.id)

    try {
      const updated = await updateNote.mutateAsync({
        id: noteId,
        data: { title: trimmed },
      })

      if (viewingArtifact?.id === renamingNote.id) {
        setViewingArtifact(updated)
      }

      setRenamingNote(null)
      setRenameTitle('')
    } catch (error) {
      console.error('Failed to rename artifact:', error)
    }
  }

  return (
    <>
      <CollapsibleColumn
        isCollapsed={artifactsCollapsed}
        onToggle={toggleArtifacts}
        collapsedIcon={FileText}
        collapsedLabel={notesLabel}
        showUnread={hasUnseenArtifacts}
      >
        <Card className={columnCardClassName}>
          <ColumnHeader
            title={notesLabel}
            titleAdornment={artifactsTitleAdornment}
            actions={collapseButton}
            className="mx-2 my-1 border-b-0"
          />

          <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
            {(templatesLoading || templates.length > 0) && (
              <div className="px-1 pt-0.5">
                {templatesLoading ? (
                  <div className="flex flex-col divide-y divide-border/50">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <CompactListRowSkeleton key={i} />
                    ))}
                  </div>
                ) : (
                  <ArtifactTemplatePhases
                    templates={templates}
                    onTemplateClick={(artifact) => onTemplateClick?.(artifact.id)}
                  />
                )}
              </div>
            )}

            <ColumnHeader
              title={t('projects.projectArtifacts')}
              actions={
                <Button
                  size="sm"
                  className={columnHeaderPrimaryButtonClassName}
                  onClick={() => {
                    setEditingNote(null)
                    setShowAddDialog(true)
                  }}
                >
                  <Plus className={columnHeaderIconClassName} />
                  {t('common.writeNote')}
                </Button>
              }
            />

            <div className="px-1 pb-0.5 pt-0.5">
              {isLoading ? (
                <div className="flex flex-col">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <CompactListRowSkeleton key={i} />
                  ))}
                </div>
              ) : !notes || notes.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title={t('projects.noArtifactsYet')}
                  description={t('projects.createFirstArtifact')}
                />
              ) : (
                <div className="flex flex-col">
                  {selectionMode && (
                    <ListSelectionBar
                      count={selectedIds.size}
                      countLabel={t('common.selectedItems').replace(
                        '{count}',
                        String(selectedIds.size)
                      )}
                      onClear={clearSelection}
                      onSelectAll={handleSelectAllVisible}
                    >
                      {onContextModeChange && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => applyBulkNoteContext('full')}
                          >
                            <FileText className="mr-1 h-3.5 w-3.5" />
                            {t('sources.includeAllInContext')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => applyBulkNoteContext('off')}
                          >
                            <EyeOff className="mr-1 h-3.5 w-3.5" />
                            {t('sources.excludeAllFromContext')}
                          </Button>
                        </>
                      )}
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
                  {notes.map((note) => (
                    <ArtifactListRow
                      key={note.id}
                      note={note}
                      t={t}
                      selectionMode={selectionMode}
                      selected={isSelected(note.id)}
                      contextMode={contextSelections?.[note.id]}
                      onContextModeChange={onContextModeChange}
                      onEnterSelection={enterSelection}
                      onToggleSelect={toggleSelect}
                      onOpen={() => handleOpenArtifact(note)}
                      onRename={() => handleRenameOpen(note)}
                      onDelete={() => handleDeleteClick(note.id)}
                      onIngest={() => void handleIngestNote(note)}
                      onExportPdf={() => void handleExportPdf(note)}
                      onExportMarkdown={() => void handleExportMarkdown(note)}
                      exportPdfPending={exportNotePdf.isPending}
                      ingestPending={ingestAsSource.isPending}
                      draggingNoteId={draggingNoteId}
                      setDraggingNoteId={setDraggingNoteId}
                      suppressClickRef={suppressClickRef}
                      isUnseen={unseenIdSet.has(note.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </CollapsibleColumn>

      <ArtifactEditorDialog
        open={showAddDialog || Boolean(editingNote)}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false)
            setEditingNote(null)
          } else {
            setShowAddDialog(true)
          }
        }}
        projectId={projectId}
        note={editingNote ?? undefined}
      />


      <ArtifactViewerDialog
        open={Boolean(viewingArtifact)}
        onOpenChange={(open) => !open && setViewingArtifact(null)}
        displayNote={displayViewingNote}
        isLoading={viewingNoteLoading}
        t={t}
        onExportPdf={handleExportPdf}
        onExportMarkdown={handleExportMarkdown}
        onIngest={handleIngestNote}
        onEdit={(note) => {
          setEditingNote(note)
          setViewingArtifact(null)
        }}
        exportPdfPending={exportNotePdf.isPending}
        ingestPending={ingestAsSource.isPending}
      />

      <FormDialogShell
        open={Boolean(renamingNote)}
        onOpenChange={(open) => {
          if (!open) {
            setRenamingNote(null)
            setRenameTitle('')
          }
        }}
        title={t('projects.renameArtifact')}
        isSubmitting={updateNote.isPending}
        compactFooter
        contentClassName="sm:max-w-md"
        disableSubmit={!renameTitle.trim()}
        onSubmit={(event) => {
          event.preventDefault()
          void handleRenameConfirm()
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="artifact-rename-title">{t('common.title')}</Label>
          <Input
            id="artifact-rename-title"
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            placeholder={t('sources.addTitle')}
            autoFocus
          />
        </div>
      </FormDialogShell>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('projects.deleteArtifact') || t('projects.deleteNote')}
        description={t('projects.deleteArtifactConfirm') || t('projects.deleteNoteConfirm')}
        confirmText={t('common.delete')}
        onConfirm={handleDeleteConfirm}
        isLoading={deleteNote.isPending}
        confirmVariant="destructive"
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t('projects.deleteArtifact') || t('projects.deleteNote')}
        description={t('projects.deleteArtifactConfirm') || t('projects.deleteNoteConfirm')}
        confirmText={t('common.delete')}
        onConfirm={handleBulkDeleteConfirm}
        isLoading={bulkBusy}
        confirmVariant="destructive"
      />
    </>
  )
}
