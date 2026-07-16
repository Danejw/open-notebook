'use client'

import { type MutableRefObject } from 'react'
import { ProjectArtifactResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Bot, User, MoreVertical, Trash2, FileText, Database, Pencil, Download } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { ContextToggle } from '@/components/common/ContextToggle'
import type { NoteContextMode } from '@/lib/types/project-context'
import { useSelectableRow } from '@/lib/hooks/useSelectableRow'
import { cn } from '@/lib/utils'
import { listActionTriggerClassName } from '@/lib/utils/list-action-trigger'
import { setArtifactDragData, clearArtifactDragData } from '@/lib/utils/artifact-drag'
import {
  isAiArtifact,
  isGeneratedArtifact,
  isManualArtifact,
} from '@/lib/utils/project-artifact-kind'
import type { TFunction } from 'i18next'

function getArtifactTypeInfo(
  artifact: Pick<ProjectArtifactResponse, 'artifact_kind' | 'note_type'>,
  t: TFunction
) {
  if (isAiArtifact(artifact)) {
    return { icon: Bot, label: t('common.aiGenerated') }
  }
  if (isGeneratedArtifact(artifact)) {
    return { icon: Bot, label: t('navigation.artifact') }
  }
  if (isManualArtifact(artifact)) {
    return { icon: FileText, label: t('navigation.artifact') }
  }
  return { icon: User, label: t('common.human') }
}

export interface ArtifactListRowProps {
  note: ProjectArtifactResponse
  t: TFunction
  selectionMode: boolean
  selected: boolean
  contextMode?: NoteContextMode
  onContextModeChange?: (noteId: string, mode: NoteContextMode) => void
  onEnterSelection: (noteId: string) => void
  onToggleSelect: (noteId: string) => void
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
  onIngest: () => void
  onExportPdf: () => void
  onExportMarkdown: () => void
  exportPdfPending: boolean
  ingestPending: boolean
  draggingNoteId: string | null
  setDraggingNoteId: (id: string | null) => void
  suppressClickRef: MutableRefObject<boolean>
}

export function ArtifactListRow({
  note,
  t,
  selectionMode,
  selected,
  contextMode,
  onContextModeChange,
  onEnterSelection,
  onToggleSelect,
  onOpen,
  onRename,
  onDelete,
  onIngest,
  onExportPdf,
  onExportMarkdown,
  exportPdfPending,
  ingestPending,
  draggingNoteId,
  setDraggingNoteId,
  suppressClickRef,
}: ArtifactListRowProps) {
  const { icon: NoteTypeIcon, label: noteTypeLabel } = getArtifactTypeInfo(note, t)
  const title = note.title || t('sources.untitledNote')
  const isIngestibleArtifact = isGeneratedArtifact(note)
  const isDraggingNote = draggingNoteId === note.id

  const { rowProps, selectedClassName } = useSelectableRow({
    selectionMode,
    selected,
    onToggleSelect: () => onToggleSelect(note.id),
    onEnterSelection: () => onEnterSelection(note.id),
    onActivate: onOpen,
    suppressClickRef,
  })

  return (
    <div
      {...rowProps}
      draggable={isIngestibleArtifact && !selectionMode}
      aria-grabbed={isDraggingNote}
      className={cn(
        'group relative flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5',
        'cursor-pointer transition-colors select-none',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isIngestibleArtifact && !selectionMode && 'cursor-grab active:cursor-grabbing',
        selectedClassName
      )}
      onDragStart={
        isIngestibleArtifact && !selectionMode
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
        isIngestibleArtifact && !selectionMode
          ? (event) => {
              if (event.clientX !== 0 || event.clientY !== 0) {
                suppressClickRef.current = true
              }
            }
          : undefined
      }
      onDragEnd={
        isIngestibleArtifact && !selectionMode
          ? () => {
              setDraggingNoteId(null)
              clearArtifactDragData()
              window.setTimeout(() => {
                suppressClickRef.current = false
              }, 0)
            }
          : undefined
      }
    >
      {selectionMode ? (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(note.id)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
          aria-label={title}
        />
      ) : (
        <NoteTypeIcon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            isAiArtifact(note) || isGeneratedArtifact(note)
              ? 'text-primary'
              : 'text-muted-foreground'
          )}
          aria-label={noteTypeLabel}
        />
      )}

      <h4 className="min-w-0 flex-1 truncate text-sm font-medium leading-snug" title={title}>
        {title}
      </h4>

      {!selectionMode && (
        <div className="flex shrink-0 items-center gap-0.5">
          {onContextModeChange && contextMode && (
            <div onClick={(event) => event.stopPropagation()}>
              <ContextToggle
                mode={contextMode}
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
                className={cn('h-7 w-7 p-0', listActionTriggerClassName)}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('common.actions')}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isIngestibleArtifact ? (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Download className="mr-2 h-4 w-4" />
                      {t('projects.export')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          onExportPdf()
                        }}
                        disabled={exportPdfPending}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        {t('projects.exportPdf')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          onExportMarkdown()
                        }}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        {t('projects.exportMarkdown')}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onIngest()
                    }}
                    disabled={ingestPending}
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {t('sources.ingestAsSource')}
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onRename()
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                {t('projects.renameArtifact')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                variant="destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('projects.deleteArtifact') || t('projects.deleteNote')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
