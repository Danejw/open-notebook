'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { NoteResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Trash2, ListChecks, FileText, EyeOff } from 'lucide-react'
import { CompactListRowSkeleton } from '@/components/common/LoadingSkeletons'
import { EmptyState } from '@/components/common/EmptyState'
import { ListSelectionBar } from '@/components/common/ListSelectionBar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NoteEditorDialog } from './NoteEditorDialog'
import { ArtifactTemplatePhases } from './ArtifactTemplatePhases'
import { ArtifactListRow } from './ArtifactListRow'
import { ArtifactViewerDialog } from './ArtifactViewerDialog'
import type { NoteContextMode } from '@/lib/types/project-context'
import type { NoteContextDefault } from '@/lib/utils/source-context'
import { useDeleteNote, useExportNotePdf, useNote, useUpdateNote } from '@/lib/hooks/use-notes'
import { useArtifacts } from '@/lib/hooks/use-artifacts'
import { useIngestAsSource } from '@/lib/hooks/use-sources'
import { useListSelection } from '@/lib/hooks/useListSelection'
import { useToast } from '@/lib/hooks/use-toast'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormDialogShell } from '@/components/common/FormDialogShell'
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
import { downloadNoteMarkdown, normalizeNoteId } from '@/lib/utils/export-note'
import { notesApi } from '@/lib/api/notes'
import { getApiErrorKey } from '@/lib/utils/error-handler'

interface ArtifactsColumnProps {
  notes?: NoteResponse[]
  isLoading: boolean
  projectId: string
  contextSelections?: Record<string, NoteContextMode>
  onContextModeChange?: (noteId: string, mode: NoteContextMode) => void
  onBulkContextModeChange?: (action: NoteContextDefault) => void
  onTemplateClick?: (artifactId: string) => void
}

export function ArtifactsColumn({
  notes,
  isLoading,
  projectId,
  contextSelections,
  onContextModeChange,
  onBulkContextModeChange,
  onTemplateClick,
}: ArtifactsColumnProps) {
  const { t, language } = useTranslation()
  const { data: templates = [], isLoading: templatesLoading } = useArtifacts()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingNote, setEditingNote] = useState<NoteResponse | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null)
  const [viewingArtifact, setViewingArtifact] = useState<NoteResponse | null>(null)
  const [renamingNote, setRenamingNote] = useState<NoteResponse | null>(null)
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

  const deleteNote = useDeleteNote()
  const updateNote = useUpdateNote()
  const exportNotePdf = useExportNotePdf()
  const ingestAsSource = useIngestAsSource()
  const { toast } = useToast()

  const viewingNoteId = viewingArtifact?.id
    ? viewingArtifact.id.includes(':')
      ? viewingArtifact.id
      : `note:${viewingArtifact.id}`
    : ''

  const { data: fetchedViewingNote, isLoading: viewingNoteLoading } = useNote(viewingNoteId, {
    enabled: Boolean(viewingArtifact),
  })

  const displayViewingNote = fetchedViewingNote ?? viewingArtifact

  // Collapsible column state
  const { notesCollapsed, toggleNotes } = useProjectColumnsStore()
  const notesLabel = t('common.artifacts')
  const collapseButton = useMemo(
    () => createCollapseButton(toggleNotes, notesLabel),
    [toggleNotes, notesLabel]
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

  const handleIngestNote = async (note: NoteResponse) => {
    if (note.note_type !== 'artifact') return
    await ingestAsSource.mutateAsync({
      kind: 'note',
      noteId: note.id,
      projectId,
    })
  }

  const handleExportPdf = async (note: NoteResponse) => {
    await exportNotePdf.mutateAsync(note.id)
  }

  const handleExportMarkdown = async (note: NoteResponse) => {
    try {
      let title = note.title || ''
      let content = note.content || ''

      if (!content) {
        const fullNote = await notesApi.get(normalizeNoteId(note.id))
        title = fullNote.title || title
        content = fullNote.content || ''
      }

      downloadNoteMarkdown(title, content)
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

  const handleRenameOpen = (note: NoteResponse) => {
    setRenamingNote(note)
    setRenameTitle(note.title || '')
  }

  const handleRenameConfirm = async () => {
    if (!renamingNote) return

    const trimmed = renameTitle.trim()
    if (!trimmed) return

    const noteId = renamingNote.id.includes(':') ? renamingNote.id : `note:${renamingNote.id}`

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
        isCollapsed={notesCollapsed}
        onToggle={toggleNotes}
        collapsedIcon={FileText}
        collapsedLabel={notesLabel}
      >
        <Card className={columnCardClassName}>
          <ColumnHeader
            title={notesLabel}
            actions={
              <>
                {onBulkContextModeChange && notes && notes.length > 0 && (
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
                      <DropdownMenuItem onClick={() => onBulkContextModeChange('include')}>
                        {t('sources.includeAllInContext')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onBulkContextModeChange('exclude')}>
                        {t('sources.excludeAllFromContext')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
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
                {collapseButton}
              </>
            }
          />

          <CardContent className={columnBodyClassName}>
            {templatesLoading ? (
              <div className="mb-2 flex flex-col divide-y divide-border/50">
                {Array.from({ length: 3 }).map((_, i) => (
                  <CompactListRowSkeleton key={i} />
                ))}
              </div>
            ) : templates.length > 0 ? (
              <ArtifactTemplatePhases
                templates={templates}
                onTemplateClick={(artifact) => onTemplateClick?.(artifact.id)}
              />
            ) : null}

            {isLoading ? (
              <div className="flex flex-col divide-y divide-border/50">
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
              <div className="flex flex-col divide-y divide-border/50">
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
                    onOpen={() => setViewingArtifact(note)}
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
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleColumn>

      <NoteEditorDialog
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
