'use client'

import { ProjectAssociations } from '@/components/source/ProjectAssociations'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { SourceDetailResponse } from '@/lib/types/api'
import { getDateLocale } from '@/lib/utils/date-locale'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertCircle,
  CheckCircle,
  Copy,
  Database,
  Download,
  ExternalLink,
} from 'lucide-react'

export interface SourceDetailDetailsTabProps {
  sourceId: string
  source: SourceDetailResponse
  language: string
  copied: boolean
  isEmbedding: boolean
  isDownloadingFile: boolean
  fileAvailable: boolean | null
  onEmbedContent: () => void
  onCopyId: () => void
  onCopyUrl: () => void
  onOpenExternal: () => void
  onDownloadFile: () => void
  onAssociationsSaved: () => void
}

export function SourceDetailDetailsTab({
  sourceId,
  source,
  language,
  copied,
  isEmbedding,
  isDownloadingFile,
  fileAvailable,
  onEmbedContent,
  onCopyId,
  onCopyUrl,
  onOpenExternal,
  onDownloadFile,
  onAssociationsSaved,
}: SourceDetailDetailsTabProps) {
  const { t } = useTranslation()
  const dateLocale = getDateLocale(language)

  return (
    <>
      {!source.embedded && (
        <Alert className="py-1">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm">{t('sources.notEmbeddedAlert')}</AlertTitle>
          <AlertDescription className="text-[11px]">
            {t('sources.notEmbeddedDesc')}
            <div className="mt-1">
              <Button
                onClick={onEmbedContent}
                disabled={isEmbedding}
                size="sm"
                className="h-7"
              >
                <Database className="mr-1.5 h-3.5 w-3.5" />
                {isEmbedding ? t('sources.embedding') : t('sources.embedContent')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="divide-y divide-border rounded-md border border-border/60 text-sm">
        <div className="flex items-center gap-1 px-1 py-1.5">
          <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
            {t('sources.id')}
          </span>
          <code className="min-w-0 flex-1 truncate text-[11px]">{source.id}</code>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={onCopyId}
            aria-label={t('common.copyToClipboard')}
          >
            {copied ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {source.asset?.url && (
          <div className="flex items-center gap-1 px-1 py-1.5">
            <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
              {t('common.url')}
            </span>
            <code className="min-w-0 flex-1 truncate text-[11px]">{source.asset.url}</code>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={onCopyUrl}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={onOpenExternal}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {source.asset?.file_path && (
          <div className="space-y-0.5 px-1 py-1.5">
            <div className="flex items-center gap-1">
              <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
                {t('sources.uploadedFile')}
              </span>
              <code className="min-w-0 flex-1 truncate text-[11px]">
                {source.asset.file_path}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={onDownloadFile}
                disabled={isDownloadingFile || fileAvailable === false}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                {fileAvailable === false
                  ? t('sources.fileUnavailable')
                  : isDownloadingFile
                    ? t('sources.preparing')
                    : t('common.download')}
              </Button>
            </div>
            {fileAvailable === false ? (
              <p className="pl-20 text-[11px] text-muted-foreground">
                {t('sources.fileUnavailableDesc')}
              </p>
            ) : null}
          </div>
        )}

        <div className="grid gap-1 px-1 py-1.5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] text-muted-foreground">{t('common.created_label')}</p>
            <p className="text-sm leading-snug">
              {formatDistanceToNow(new Date(source.created), {
                addSuffix: true,
                locale: dateLocale,
              })}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {new Date(source.created).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{t('common.updated_label')}</p>
            <p className="text-sm leading-snug">
              {formatDistanceToNow(new Date(source.updated), {
                addSuffix: true,
                locale: dateLocale,
              })}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {new Date(source.updated).toLocaleString()}
            </p>
          </div>
        </div>

        {source.topics && source.topics.length > 0 && (
          <div className="px-1 py-1.5">
            <p className="mb-0.5 text-[11px] text-muted-foreground">{t('sources.topics')}</p>
            <div className="flex flex-wrap gap-0.5">
              {source.topics.map((topic, idx) => (
                <Badge key={idx} variant="outline" className="h-5 px-1.5 text-[10px]">
                  {topic}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <ProjectAssociations
        sourceId={sourceId}
        currentProjectIds={source.projects || []}
        onSave={onAssociationsSaved}
      />
    </>
  )
}
