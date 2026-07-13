'use client'

import { useState, useMemo, useRef } from 'react'
import { NoteResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Bot, User, MoreVertical, Trash2, ListChecks, FileText, Database, Pencil } from 'lucide-react'
import { CompactListRowSkeleton } from '@/components/common/LoadingSkeletons'
import { EmptyState } from '@/components/common/EmptyState'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { NoteEditorDialog } from './NoteEditorDialog'
import { ArtifactTemplatePhases } from './ArtifactTemplatePhases'
import { getDateLocale } from '@/lib/utils/date-locale'
import { formatDistanceToNow } from 'date-fns'
import { ContextToggle } from '@/components/common/ContextToggle'
import type { NoteContextMode } from '@/lib/types/project-context'
import type { NoteContextDefault } from '@/lib/utils/source-context'
import { useDeleteNote, useNote, useUpdateNote } from '@/lib/hooks/use-notes'
import { useArtifacts } from '@/lib/hooks/use-artifacts'
import { useIngestAsSource } from '@/lib/hooks/use-sources'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
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
import { cn } from '@/lib/utils'
import { setArtifactDragData, clearArtifactDragData } from '@/lib/utils/artifact-drag'
import type { TFunction } from 'i18next'

interface ArtifactsColumnProps {
  notes?: NoteResponse[]
  isLoading: boolean
  projectId: string
  contextSelections?: Record<string, NoteContextMode>
  onContextModeChange?: (noteId: string, mode: NoteContextMode) => void
  onBulkContextModeChange?: (action: NoteContextDefault) => void
  onTemplateClick?: (artifactId: string) => void
}

function getNoteTypeInfo(noteType: string | null, t: TFunction) {
  if (noteType === 'ai') {
    return { icon: Bot, label: t('common.aiGenerated') }
  }
  if (noteType === 'artifact') {
    return { icon: Bot, label: t('navigation.artifact') }
  }
  if (noteType === 'note') {
    return { icon: FileText, label: t('common.note') }
  }
  return { icon: User, label: t('common.human') }
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
  const suppressClickRef = useRef(false)

  const deleteNote = useDeleteNote()
  const updateNote = useUpdateNote()
  const ingestAsSource = useIngestAsSource()

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

  const handleIngestNote = async (note: NoteResponse) => {
    if (note.note_type !== 'artifact') return
    await ingestAsSource.mutateAsync({
      kind: 'note',
      noteId: note.id,
      projectId,
    })
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
                {notes.map((note) => {
                  const { icon: NoteTypeIcon, label: noteTypeLabel } = getNoteTypeInfo(
                    note.note_type,
                    t
                  )
                  const title = note.title || t('sources.untitledNote')

                  const isIngestibleArtifact = note.note_type === 'artifact'
                  const isDraggingNote = draggingNoteId === note.id

                  return (
                    <div
                      key={note.id}
                      role="button"
                      tabIndex={0}
                      draggable={isIngestibleArtifact}
                      aria-grabbed={isDraggingNote}
                      className={cn(
                        'group relative flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5',
                        'cursor-pointer transition-colors',
                        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        isIngestibleArtifact && 'cursor-grab active:cursor-grabbing'
                      )}
                      onClick={() => {
                        if (suppressClickRef.current) return
                        setViewingArtifact(note)
                      }}
                      onDragStart={
                        isIngestibleArtifact
                          ? (event) => {
                              suppressClickRef.current = false
                              setDraggingNoteId(note.id)
                              setArtifactDragData(event.dataTransfer, {
                                kind: 'note',
                                id: note.id,
                                title,
                              })
                            }
                          : undefined
                      }
                      onDrag={
                        isIngestibleArtifact
                          ? (event) => {
                              if (event.clientX !== 0 || event.clientY !== 0) {
                                suppressClickRef.current = true
                              }
                            }
                          : undefined
                      }
                      onDragEnd={
                        isIngestibleArtifact
                          ? () => {
                              setDraggingNoteId(null)
                              clearArtifactDragData()
                              window.setTimeout(() => {
                                suppressClickRef.current = false
                              }, 0)
                            }
                          : undefined
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setViewingArtifact(note)
                        }
                      }}
                    >
                      <NoteTypeIcon
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          note.note_type === 'ai' || note.note_type === 'artifact'
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        )}
                        aria-label={noteTypeLabel}
                      />

                      <h4 className="min-w-0 flex-1 truncate text-sm font-medium leading-snug" title={title}>
                        {title}
                      </h4>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {onContextModeChange && contextSelections?.[note.id] && (
                          <div onClick={(event) => event.stopPropagation()}>
                            <ContextToggle
                              mode={contextSelections[note.id]}
                              hasInsights={false}
                              onChange={(mode) => onContextModeChange(note.id, mode)}
                              className="h-7 w-7"
                            />
                          </div>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={t('common.actions')}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {note.note_type === 'artifact' && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleIngestNote(note)
                                }}
                                disabled={ingestAsSource.isPending}
                              >
                                <Database className="h-4 w-4 mr-2" />
                                {t('sources.ingestAsSource')}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRenameOpen(note)
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              {t('projects.renameArtifact')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteClick(note.id)
                              }}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('projects.deleteArtifact') || t('projects.deleteNote')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )
                })}
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


      <Dialog open={Boolean(viewingArtifact)} onOpenChange={(open) => !open && setViewingArtifact(null)}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
          <div className="border-b px-6 py-4">
            <DialogTitle className="text-xl">
              {displayViewingNote?.title || t('sources.untitledNote')}
            </DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {displayViewingNote?.updated
                ? formatDistanceToNow(new Date(displayViewingNote.updated), {
                    addSuffix: true,
                    locale: getDateLocale(language),
                  })
                : null}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {viewingNoteLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : (
              <MarkdownRenderer>{displayViewingNote?.content || ''}</MarkdownRenderer>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t px-6 py-3">
            {displayViewingNote?.note_type === 'artifact' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (displayViewingNote) {
                    void handleIngestNote(displayViewingNote)
                  }
                }}
                disabled={ingestAsSource.isPending}
              >
                <Database className="mr-2 h-4 w-4" />
                {t('sources.ingestAsSource')}
              </Button>
            ) : null}
            {displayViewingNote ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingNote(displayViewingNote)
                  setViewingArtifact(null)
                }}
              >
                {t('common.edit')}
              </Button>
            ) : null}
            <Button type="button" onClick={() => setViewingArtifact(null)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renamingNote)}
        onOpenChange={(open) => {
          if (!open) {
            setRenamingNote(null)
            setRenameTitle('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('projects.renameArtifact')}</DialogTitle>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleRenameConfirm()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="artifact-rename-title">{t('common.title')}</Label>
              <Input
                id="artifact-rename-title"
                value={renameTitle}
                onChange={(event) => setRenameTitle(event.target.value)}
                placeholder={t('sources.addTitle')}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRenamingNote(null)
                  setRenameTitle('')
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!renameTitle.trim() || updateNote.isPending}>
                {updateNote.isPending ? `${t('common.saving')}...` : t('common.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
    </>
  )
}
