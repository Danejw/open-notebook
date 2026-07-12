'use client'

import { useState, useMemo } from 'react'
import { NoteResponse } from '@/lib/types/api'
import type { Artifact } from '@/lib/types/artifacts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Bot, User, MoreVertical, Trash2, ListChecks, FileText, Sparkles } from 'lucide-react'
import { ColumnCardsSkeleton } from '@/components/common/LoadingSkeletons'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { NoteEditorDialog } from './NoteEditorDialog'
import { getDateLocale } from '@/lib/utils/date-locale'
import { formatDistanceToNow } from 'date-fns'
import { ContextToggle } from '@/components/common/ContextToggle'
import type { NoteContextMode } from '@/lib/types/project-context'
import type { NoteContextDefault } from '@/lib/utils/source-context'
import { useDeleteNote } from '@/lib/hooks/use-notes'
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

interface ArtifactsColumnProps {
  notes?: NoteResponse[]
  isLoading: boolean
  projectId: string
  contextSelections?: Record<string, NoteContextMode>
  onContextModeChange?: (noteId: string, mode: NoteContextMode) => void
  onBulkContextModeChange?: (action: NoteContextDefault) => void
  templates?: Artifact[]
  onTemplateClick?: (artifact: Artifact) => void
}

export function ArtifactsColumn({
  notes,
  isLoading,
  projectId,
  contextSelections,
  onContextModeChange,
  onBulkContextModeChange,
  templates = [],
  onTemplateClick,
}: ArtifactsColumnProps) {
  const { t, language } = useTranslation()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingNote, setEditingNote] = useState<NoteResponse | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null)
  const [viewingArtifact, setViewingArtifact] = useState<NoteResponse | null>(null)

  const deleteNote = useDeleteNote()

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
            {templates.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('projects.artifactTemplates') || 'Artifact templates'}
                </div>
                <div className="grid gap-2">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                      onClick={() => onTemplateClick?.(template)}
                    >
                      <div className="text-sm font-medium">{template.title}</div>
                      {template.description ? (
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {template.description}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('common.artifacts')}
            </div>
            {isLoading ? (
              <ColumnCardsSkeleton count={3} />
            ) : !notes || notes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={t('projects.noArtifactsYet') || 'No artifacts yet'}
                description={t('projects.createFirstArtifact') || 'Run a template or write a note to create the first project artifact.'}
              />
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 border rounded-lg card-hover group relative cursor-pointer"
                    onClick={() => setViewingArtifact(note)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {note.note_type === 'ai' || note.note_type === 'artifact' ? (
                          <Bot className="h-4 w-4 text-primary" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {note.note_type === 'note' ? 'Note' : note.note_type === 'artifact' ? t('common.artifact') : note.note_type === 'ai' ? t('common.aiGenerated') : t('common.human')}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(note.updated), { 
                            addSuffix: true,
                            locale: getDateLocale(language)
                          })}
                        </span>

                        {/* Context toggle - only show if handler provided */}
                        {onContextModeChange && contextSelections?.[note.id] && (
                          <div onClick={(event) => event.stopPropagation()}>
                            <ContextToggle
                              mode={contextSelections[note.id]}
                              hasInsights={false}
                              onChange={(mode) => onContextModeChange(note.id, mode)}
                            />
                          </div>
                        )}

                        {/* Ellipsis menu for delete action */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
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

                    {note.title && (
                      <h4 className="text-sm font-medium mb-2 break-all">{note.title}</h4>
                    )}

                    {note.content && (
                      <p className="text-sm text-muted-foreground line-clamp-3 break-all">
                        {note.content}
                      </p>
                    )}
                  </div>
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


      <Dialog open={Boolean(viewingArtifact)} onOpenChange={(open) => !open && setViewingArtifact(null)}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
          <div className="border-b px-6 py-4">
            <DialogTitle className="text-xl">
              {viewingArtifact?.title || 'Untitled artifact'}
            </DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {viewingArtifact?.updated
                ? formatDistanceToNow(new Date(viewingArtifact.updated), {
                    addSuffix: true,
                    locale: getDateLocale(language),
                  })
                : null}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <MarkdownRenderer>{viewingArtifact?.content || ''}</MarkdownRenderer>
          </div>
          <div className="flex justify-end gap-2 border-t px-6 py-3">
            {viewingArtifact ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingNote(viewingArtifact)
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
