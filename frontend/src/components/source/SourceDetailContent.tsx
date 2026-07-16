'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { isAxiosError } from 'axios'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { sourcesApi } from '@/lib/api/sources'
import { embeddingApi } from '@/lib/api/embedding'
import { useSource } from '@/lib/hooks/use-sources'
import {
  SourceDetailSkeleton,
} from '@/components/common/LoadingSkeletons'
import { InlineEdit } from '@/components/common/InlineEdit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import {
  Link as LinkIcon,
  ExternalLink,
  Download,
  Copy,
  CheckCircle,
  MoreVertical,
  Trash2,
  Database,
  AlertCircle,
  MessageSquare,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '@/lib/utils/date-locale'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { ProjectAssociations } from '@/components/source/ProjectAssociations'
import { SourceKnowledgePanel } from '@/components/source/SourceKnowledgePanel'

/** OCR / drawing dumps are often one long line — mono + wrap is more scannable than Markdown. */
function isDensePlainExtraction(text: string): boolean {
  if (text.length < 400) return false
  const newlines = (text.match(/\n/g) ?? []).length
  return newlines / text.length < 0.008
}

interface SourceDetailContentProps {
  sourceId: string
  showChatButton?: boolean
  onChatClick?: () => void
  onClose?: () => void
}

export function SourceDetailContent({
  sourceId,
  showChatButton = false,
  onChatClick,
  onClose
}: SourceDetailContentProps) {
  const { t, language } = useTranslation()
  const {
    data: source,
    isLoading,
    isError,
    refetch,
  } = useSource(sourceId)
  const [copied, setCopied] = useState(false)
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [isDownloadingFile, setIsDownloadingFile] = useState(false)
  const [fileAvailable, setFileAvailable] = useState<boolean | null>(null)
  const [sourceDeleteOpen, setSourceDeleteOpen] = useState(false)
  const [deletingSource, setDeletingSource] = useState(false)

  useEffect(() => {
    if (!source) {
      setFileAvailable(null)
      return
    }
    if (typeof source.file_available === 'boolean') {
      setFileAvailable(source.file_available)
    } else if (!source.asset?.file_path) {
      setFileAvailable(null)
    } else {
      setFileAvailable(null)
    }
  }, [source])

  const handleUpdateTitle = async (title: string) => {
    if (!source || title === source.title) return

    try {
      await sourcesApi.update(sourceId, { title })
      toast.success(t('common.success'))
      await refetch()
    } catch (err) {
      console.error('Failed to update source title:', err)
      toast.error(t('common.error'))
      await refetch()
    }
  }

  const handleEmbedContent = async () => {
    if (!source) return

    try {
      setIsEmbedding(true)
      const response = await embeddingApi.embedContent(sourceId, 'source')
      toast.success(response.message || t('common.success'))
      await refetch()
    } catch (err) {
      console.error('Failed to embed content:', err)
      toast.error(t('common.error'))
    } finally {
      setIsEmbedding(false)
    }
  }

  const extractFilename = (pathOrUrl: string | undefined, fallback: string) => {
    if (!pathOrUrl) {
      return fallback
    }
    const segments = pathOrUrl.split(/[/\\]/)
    return segments.pop() || fallback
  }

  const parseContentDisposition = (header?: string | null) => {
    if (!header) {
      return null
    }
    const match = header.match(/filename\*?=([^;]+)/i)
    if (!match) {
      return null
    }
    const value = match[1].trim()
    if (value.toLowerCase().startsWith("utf-8''")) {
      return decodeURIComponent(value.slice(7))
    }
    return value.replace(/^["']|["']$/g, '')
  }

  const handleDownloadFile = async () => {
    if (!source?.asset?.file_path || isDownloadingFile || fileAvailable === false) {
      return
    }

    try {
      setIsDownloadingFile(true)
      const response = await sourcesApi.downloadFile(source.id)
      const filenameFromHeader = parseContentDisposition(
        response.headers?.['content-disposition'] as string | undefined
      )
      const fallbackName = extractFilename(source.asset.file_path, `source-${source.id}`)
      const filename = filenameFromHeader || fallbackName

      const blobUrl = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
      setFileAvailable(true)
      toast.success(t('common.success'))
    } catch (err) {
      console.error('Failed to download file:', err)
      if (isAxiosError(err) && err.response?.status === 404) {
        setFileAvailable(false)
        toast.error(t('sources.fileUnavailable'))
      } else {
        toast.error(t('common.error'))
      }
    } finally {
      setIsDownloadingFile(false)
    }
  }

  const handleCopyId = useCallback(() => {
    if (!source?.id) return
    void navigator.clipboard.writeText(source.id)
    setCopied(true)
    toast.success(t('common.success'))
    setTimeout(() => setCopied(false), 2000)
  }, [source?.id, t])

  const handleCopyUrl = useCallback(() => {
    if (source?.asset?.url) {
      navigator.clipboard.writeText(source.asset.url)
      setCopied(true)
      toast.success(t('sources.urlCopied'))
      setTimeout(() => setCopied(false), 2000)
    }
  }, [source, t])

  const handleOpenExternal = useCallback(() => {
    if (source?.asset?.url) {
      window.open(source.asset.url, '_blank')
    }
  }, [source])

  const getYouTubeVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  const isYouTubeUrl = useMemo(() => {
    if (!source?.asset?.url) return false
    return !!(getYouTubeVideoId(source.asset.url))
  }, [source?.asset?.url])

  const youTubeVideoId = useMemo(() => {
    if (!source?.asset?.url) return null
    return getYouTubeVideoId(source.asset.url)
  }, [source?.asset?.url])

  const contentText = source?.full_text ?? ''
  const usePlainExtractionView = useMemo(
    () => Boolean(contentText && isDensePlainExtraction(contentText)),
    [contentText]
  )

  const handleDeleteSource = async () => {
    if (!source) return

    try {
      setDeletingSource(true)
      await sourcesApi.delete(source.id)
      toast.success(t('common.success'))
      setSourceDeleteOpen(false)
      onClose?.()
    } catch (error) {
      console.error('Failed to delete source:', error)
      toast.error(t('common.error'))
    } finally {
      setDeletingSource(false)
    }
  }

  if (isLoading) {
    return <SourceDetailSkeleton />
  }

  if (isError || !source) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <p className="text-sm text-destructive">
          {isError ? t('sources.loadFailed') : t('sources.notFound')}
        </p>
      </div>
    )
  }

  const relativeCreated = formatDistanceToNow(new Date(source.created), {
    addSuffix: true,
    locale: getDateLocale(language),
  })

  return (
    <div className="flex h-full flex-col">
      {/* Header — pr-8 clears DialogContent absolute close (same as DialogHeader) */}
      <div className="flex shrink-0 items-center justify-center gap-1 border-b border-border py-0.5 pl-1 pr-8">
        <div className="flex min-w-0 flex-1 items-start gap-1">
          <div className="min-w-0 flex-1">
            <InlineEdit
              value={source.title || ''}
              onSave={handleUpdateTitle}
              className="text-base font-semibold leading-snug"
              inputClassName="text-base font-semibold"
              placeholder={t('sources.titlePlaceholder')}
              emptyText={t('sources.untitledSource')}
            />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={t('common.actions')}>
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {showChatButton && onChatClick && (
              <DropdownMenuItem onClick={onChatClick}>
                <MessageSquare className="mr-2 h-4 w-4" />
                {t('chat.chatWith').replace('{name}', t('navigation.sources'))}
              </DropdownMenuItem>
            )}
            {source.asset?.file_path && (
              <DropdownMenuItem
                onClick={handleDownloadFile}
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
            <DropdownMenuItem
              onClick={handleEmbedContent}
              disabled={isEmbedding || source.embedded}
            >
              <Database className="mr-2 h-4 w-4" />
              {isEmbedding
                ? t('sources.embedding')
                : source.embedded
                  ? t('sources.alreadyEmbedded')
                  : t('sources.embedContent')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setSourceDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('sources.deleteSource')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        <Tabs defaultValue="content" className="w-full">
          <TabsList className="sticky top-0 z-10 mt-0.5 grid w-full grid-cols-3">
            <TabsTrigger value="content">{t('sources.content')}</TabsTrigger>
            <TabsTrigger value="knowledge">{t('knowledge.tab')}</TabsTrigger>
            <TabsTrigger value="details">{t('sources.details')}</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-1 space-y-1">
            {source.asset?.url && !isYouTubeUrl && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <LinkIcon className="h-3 w-3 shrink-0" />
                <a
                  href={source.asset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate hover:underline"
                >
                  {source.asset.url}
                </a>
              </div>
            )}

            {isYouTubeUrl && youTubeVideoId && (
              <div className="space-y-1">
                <div className="aspect-video overflow-hidden rounded-md bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${youTubeVideoId}`}
                    title={t('common.accessibility.ytVideo')}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                {source.asset?.url && (
                  <a
                    href={source.asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t('sources.openOnYoutube')}
                  </a>
                )}
              </div>
            )}

            {!contentText ? (
              <p className="px-0.5 py-2 text-sm text-muted-foreground">{t('sources.noContent')}</p>
            ) : usePlainExtractionView ? (
              <pre
                className={cn(
                  'max-h-[min(52vh,560px)] overflow-auto rounded-md border border-border/60',
                  'bg-muted/20 px-1.5 py-1 font-mono text-[11px] leading-snug',
                  'whitespace-pre-wrap break-words text-foreground'
                )}
              >
                {contentText}
              </pre>
            ) : (
              <div className="rounded-md border border-border/60 bg-muted/20 px-1.5 py-1">
                <MarkdownRenderer size="sm">{contentText}</MarkdownRenderer>
              </div>
            )}
          </TabsContent>

          <TabsContent value="knowledge" className="mt-1">
            <SourceKnowledgePanel
              sourceId={sourceId}
              projectId={source.projects?.[0]}
            />
          </TabsContent>

          <TabsContent value="details" className="mt-1 space-y-2">
            {!source.embedded && (
              <Alert className="py-1">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-sm">{t('sources.notEmbeddedAlert')}</AlertTitle>
                <AlertDescription className="text-[11px]">
                  {t('sources.notEmbeddedDesc')}
                  <div className="mt-1">
                    <Button
                      onClick={handleEmbedContent}
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
                  onClick={handleCopyId}
                  aria-label={t('common.copyToClipboard')}
                >
                  {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>

              {source.asset?.url && (
                <div className="flex items-center gap-1 px-1 py-1.5">
                  <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
                    {t('common.url')}
                  </span>
                  <code className="min-w-0 flex-1 truncate text-[11px]">{source.asset.url}</code>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCopyUrl}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleOpenExternal}>
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
                      onClick={handleDownloadFile}
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
                  <p className="text-sm leading-snug">{relativeCreated}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(source.created).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t('common.updated_label')}</p>
                  <p className="text-sm leading-snug">
                    {formatDistanceToNow(new Date(source.updated), {
                      addSuffix: true,
                      locale: getDateLocale(language),
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
              onSave={() => {
                void refetch()
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={sourceDeleteOpen}
        onOpenChange={setSourceDeleteOpen}
        title={t('sources.deleteSource')}
        description={t('sources.deleteSourceConfirm') || t('common.confirm')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        isLoading={deletingSource}
        onConfirm={handleDeleteSource}
      />
    </div>
  )
}
