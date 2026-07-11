'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, Trash2, Wand2, Edit, MoreVertical } from 'lucide-react'
import { Artifact } from '@/lib/types/artifacts'
import { useDeleteArtifact } from '@/lib/hooks/use-artifacts'
import { useTranslation } from '@/lib/hooks/use-translation'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'

interface ArtifactCardProps {
  artifact: Artifact
  onPlayground?: () => void
  onEdit?: () => void
}

export function ArtifactCard({ artifact, onPlayground, onEdit }: ArtifactCardProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const deleteArtifact = useDeleteArtifact()

  const handleDelete = () => {
    deleteArtifact.mutate(artifact.id)
    setShowDeleteDialog(false)
  }

  return (
    <>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="group">
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-sm font-medium">{artifact.name}</span>
              {artifact.apply_default ? (
                <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                  {t('common.default')}
                </Badge>
              ) : null}
              {!isExpanded && artifact.title ? (
                <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
                  · {artifact.title}
                </span>
              ) : null}
            </CollapsibleTrigger>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
                  aria-label={t('common.actions') || 'Actions'}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit ? (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="mr-2 h-3.5 w-3.5" />
                    {t('common.edit')}
                  </DropdownMenuItem>
                ) : null}
                {onPlayground ? (
                  <DropdownMenuItem onClick={onPlayground}>
                    <Wand2 className="mr-2 h-3.5 w-3.5" />
                    {t('artifacts.playground')}
                  </DropdownMenuItem>
                ) : null}
                {(onEdit || onPlayground) ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <CollapsibleContent>
            <div className="space-y-2 border-t px-3 py-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">{t('common.title')}:</span>{' '}
                {artifact.title || t('sources.untitledSource')}
              </p>

              {artifact.description ? (
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('common.description')}
                  </p>
                  <MarkdownRenderer size="sm">{artifact.description}</MarkdownRenderer>
                </div>
              ) : null}

              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('artifacts.systemPrompt')}
                </p>
                <MarkdownRenderer size="sm" className="rounded-md border bg-muted/30 p-2">
                  {artifact.prompt}
                </MarkdownRenderer>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t('sources.delete')}
        description={t('artifacts.deleteConfirm')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteArtifact.isPending}
      />
    </>
  )
}
