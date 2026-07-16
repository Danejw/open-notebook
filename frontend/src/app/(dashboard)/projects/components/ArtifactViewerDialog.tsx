'use client'

import { NoteResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Download, FileText, Database } from 'lucide-react'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import type { TFunction } from 'i18next'

export interface ArtifactViewerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  displayNote: NoteResponse | null | undefined
  isLoading: boolean
  t: TFunction
  onExportPdf: (note: NoteResponse) => void
  onExportMarkdown: (note: NoteResponse) => void
  onIngest: (note: NoteResponse) => void
  onEdit: (note: NoteResponse) => void
  exportPdfPending: boolean
  ingestPending: boolean
}

export function ArtifactViewerDialog({
  open,
  onOpenChange,
  displayNote,
  isLoading,
  t,
  onExportPdf,
  onExportMarkdown,
  onIngest,
  onEdit,
  exportPdfPending,
  ingestPending,
}: ArtifactViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b">
          <DialogTitle>
            {displayNote?.title || t('sources.untitledNote')}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <MarkdownRenderer>{displayNote?.content || ''}</MarkdownRenderer>
          )}
        </div>
        <DialogFooter className="border-t">
          {displayNote?.note_type === 'artifact' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-7">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {t('projects.export')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    if (displayNote) {
                      void onExportPdf(displayNote)
                    }
                  }}
                  disabled={exportPdfPending}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {t('projects.exportPdf')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (displayNote) {
                      void onExportMarkdown(displayNote)
                    }
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {t('projects.exportMarkdown')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {displayNote?.note_type === 'artifact' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7"
              onClick={() => {
                if (displayNote) {
                  void onIngest(displayNote)
                }
              }}
              disabled={ingestPending}
            >
              <Database className="mr-1.5 h-3.5 w-3.5" />
              {t('sources.ingestAsSource')}
            </Button>
          ) : null}
          {displayNote ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                onEdit(displayNote)
              }}
            >
              {t('common.edit')}
            </Button>
          ) : null}
          <Button type="button" size="sm" className="h-7" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
