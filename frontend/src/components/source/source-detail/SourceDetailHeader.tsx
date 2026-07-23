'use client'

import { InlineEdit } from '@/components/common/InlineEdit'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Database, Download, MoreVertical, Trash2 } from 'lucide-react'

export interface SourceDetailHeaderProps {
  title: string | null
  hasFilePath: boolean
  embedded: boolean
  isEmbedding: boolean
  isDownloadingFile: boolean
  fileAvailable: boolean | null
  onUpdateTitle: (title: string) => Promise<void>
  onDownloadFile: () => void
  onEmbedContent: () => void
  onRequestDelete: () => void
}

export function SourceDetailHeader({
  title,
  hasFilePath,
  embedded,
  isEmbedding,
  isDownloadingFile,
  fileAvailable,
  onUpdateTitle,
  onDownloadFile,
  onEmbedContent,
  onRequestDelete,
}: SourceDetailHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="flex shrink-0 items-center justify-center gap-1 border-b border-border py-0.5 pl-1 pr-8">
      <div className="flex min-w-0 flex-1 items-start gap-1">
        <div className="min-w-0 flex-1">
          <InlineEdit
            value={title || ''}
            onSave={onUpdateTitle}
            className="text-base font-semibold leading-snug"
            inputClassName="text-base font-semibold"
            placeholder={t('sources.titlePlaceholder')}
            emptyText={t('sources.untitledSource')}
          />
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={t('common.actions')}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {hasFilePath && (
            <DropdownMenuItem
              onClick={onDownloadFile}
              disabled={isDownloadingFile || fileAvailable === false}
            >
              <Download className="mr-2 h-4 w-4" />
              {fileAvailable === false
                ? t('sources.fileUnavailable')
                : isDownloadingFile
                  ? t('sources.preparing')
                  : t('sources.downloadFile')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onEmbedContent} disabled={isEmbedding || embedded}>
            <Database className="mr-2 h-4 w-4" />
            {isEmbedding
              ? t('sources.embedding')
              : embedded
                ? t('sources.alreadyEmbedded')
                : t('sources.embedContent')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onRequestDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('sources.deleteSource')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
