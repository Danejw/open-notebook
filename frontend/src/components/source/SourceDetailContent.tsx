'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { sourcesApi } from '@/lib/api/sources'
import { insightsApi, SourceInsightResponse } from '@/lib/api/insights'
import { artifactsApi } from '@/lib/api/artifacts'
import { embeddingApi } from '@/lib/api/embedding'
import { SourceDetailResponse } from '@/lib/types/api'
import { Artifact } from '@/lib/types/artifacts'
import {
  InlineSkeleton,
  ListRowsSkeleton,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Link as LinkIcon,
  ExternalLink,
  Download,
  Copy,
  CheckCircle,
  MoreVertical,
  Trash2,
  Plus,
  Database,
  AlertCircle,
  MessageSquare,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '@/lib/utils/date-locale'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { SourceInsightDialog } from '@/components/source/SourceInsightDialog'
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
  const queryClient = useQueryClient()
  const [source, setSource] = useState<SourceDetailResponse | null>(null)
  const [insights, setInsights] = useState<SourceInsightResponse[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [creatingInsight, setCreatingInsight] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [isDownloadingFile, setIsDownloadingFile] = useState(false)
  const [fileAvailable, setFileAvailable] = useState<boolean | null>(null)
  const [selectedInsight, setSelectedInsight] = useState<SourceInsightResponse | null>(null)
  const [insightToDelete, setInsightToDelete] = useState<string | null>(null)
  const [deletingInsight, setDeletingInsight] = useState(false)
  const [sourceDeleteOpen, setSourceDeleteOpen] = useState(false)
  const [deletingSource, setDeletingSource] = useState(false)

  const fetchSource = useCallback(async () => {
    try {
      setLoading(true)
      const data = await sourcesApi.get(sourceId)
      setSource(data)
      if (typeof data.file_available === 'boolean') {
        setFileAvailable(data.file_available)
      } else if (!data.asset?.file_path) {
        setFileAvailable(null)
      } else {
        setFileAvailable(null)
      }
    } catch (err) {
      console.error('Failed to fetch source:', err)
      setError(t('sources.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [sourceId, t])

  const fetchInsights = useCallback(async () => {
    try {
      setLoadingInsights(true)
      const data = await insightsApi.listForSource(sourceId)
      setInsights(data)
    } catch (err) {
      console.error('Failed to fetch insights:', err)
    } finally {
      setLoadingInsights(false)
    }
  }, [sourceId])

  const fetchArtifacts = useCallback(async () => {
    try {
      const data = await artifactsApi.list()
      setArtifacts(data)
    } catch (err) {
      console.error('Failed to fetch artifacts:', err)
    }
  }, [])

  useEffect(() => {
    if (sourceId) {
      void fetchSource()
      void fetchInsights()
      void fetchArtifacts()
    }
  }, [fetchInsights, fetchSource, fetchArtifacts, sourceId])

  const createInsight = async () => {
    if (!selectedArtifactId) {
      toast.error(t('sources.selectArtifact'))
      return
    }

    try {
      setCreatingInsight(true)
      const response = await insightsApi.create(sourceId, {
        artifact_id: selectedArtifactId
      })
      // Show toast for async operation
      toast.success(t('sources.insightGenerationStarted'))
      setSelectedArtifactId('')

      // Poll for command completion if we have a command_id
      if (response.command_id) {
        // Poll in background (don't block UI)
        insightsApi.waitForCommand(response.command_id, {
          maxAttempts: 120, // Up to 4 minutes (120 * 2s)
          intervalMs: 2000
        }).then(success => {
          if (success) {
            void fetchInsights()
            // Invalidate sources queries so project page refreshes with updated insights_count
            queryClient.invalidateQueries({ queryKey: ['sources'] })
          }
        }).catch(err => {
          console.error('Error waiting for insight command:', err)
        })
      } else {
        // Fallback: refresh after delay if no command_id
        setTimeout(() => {
          void fetchInsights()
          // Also invalidate sources queries
          queryClient.invalidateQueries({ queryKey: ['sources'] })
        }, 5000)
      }
    } catch (err) {
      console.error('Failed to create insight:', err)
      toast.error(t('common.error'))
    } finally {
      setCreatingInsight(false)
    }
  }

  const handleDeleteInsight = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    if (!insightToDelete) return

    try {
      setDeletingInsight(true)
      await insightsApi.delete(insightToDelete)
      toast.success(t('common.success'))
      setInsightToDelete(null)
      await fetchInsights()
    } catch (err) {
      console.error('Failed to delete insight:', err)
      toast.error(t('common.error'))
    } finally {
      setDeletingInsight(false)
    }
  }

  const handleUpdateTitle = async (title: string) => {
    if (!source || title === source.title) return

    try {
      await sourcesApi.update(sourceId, { title })
      toast.success(t('common.success'))
      setSource({ ...source, title })
    } catch (err) {
      console.error('Failed to update source title:', err)
      toast.error(t('common.error'))
      await fetchSource()
    }
  }

  const handleEmbedContent = async () => {
    if (!source) return

    try {
      setIsEmbedding(true)
      const response = await embeddingApi.embedContent(sourceId, 'source')
      toast.success(response.message || t('common.success'))
      await fetchSource()
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

  if (loading) {
    return <SourceDetailSkeleton />
  }

  if (error || !source) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <p className="text-sm text-destructive">{error || t('sources.notFound')}</p>
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
          <TabsList className="sticky top-0 z-10 mt-0.5 grid w-full grid-cols-4">
            <TabsTrigger value="content">{t('sources.content')}</TabsTrigger>
            <TabsTrigger value="insights">
              {t('common.insights')}
              {insights.length > 0 ? ` (${insights.length})` : ''}
            </TabsTrigger>
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

          <TabsContent value="insights" className="mt-1 space-y-1">
            <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 p-0.5">
              <Select
                name="artifact"
                value={selectedArtifactId}
                onValueChange={setSelectedArtifactId}
                disabled={creatingInsight}
              >
                <SelectTrigger id="artifact-select" className="h-7 flex-1 text-[11px]">
                  <SelectValue placeholder={t('sources.selectArtifact')} />
                </SelectTrigger>
                <SelectContent>
                  {artifacts.map((artifact) => (
                    <SelectItem key={artifact.id} value={artifact.id}>
                      {artifact.title || artifact.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={createInsight}
                disabled={!selectedArtifactId || creatingInsight}
              >
                {creatingInsight ? (
                  <InlineSkeleton className="h-3 w-3" />
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">{t('common.create')}</span>
                  </>
                )}
              </Button>
            </div>

            {loadingInsights ? (
              <ListRowsSkeleton rows={3} withHeader={false} />
            ) : insights.length === 0 ? (
              <p className="px-0.5 py-3 text-center text-[11px] text-muted-foreground">
                {t('sources.noInsightsYet')}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border/60">
                {insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="flex items-start gap-1 px-1 py-1.5"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setSelectedInsight(insight)}
                    >
                      <span className="text-[11px] font-medium uppercase text-muted-foreground">
                        {insight.insight_type}
                      </span>
                      <p className="line-clamp-2 text-sm leading-snug text-foreground">
                        {insight.content.slice(0, 160)}
                        {insight.content.length > 160 ? '…' : ''}
                      </p>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setInsightToDelete(insight.id)}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
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
              onSave={fetchSource}
            />
          </TabsContent>
        </Tabs>
      </div>

      <SourceInsightDialog
        open={Boolean(selectedInsight)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedInsight(null)
          }
        }}
        insight={selectedInsight ?? undefined}
        projectId={source.projects?.[0]}
        onDelete={async (insightId) => {
          try {
            await insightsApi.delete(insightId)
            toast.success(t('common.success'))
            setSelectedInsight(null)
            await fetchInsights()
          } catch (err) {
            console.error('Failed to delete insight:', err)
            toast.error(t('common.error'))
          }
        }}
      />

      <ConfirmDialog
        open={!!insightToDelete}
        onOpenChange={(open) => { if (!open) setInsightToDelete(null) }}
        title={t('sources.deleteInsight')}
        description={t('sources.deleteInsightConfirm')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        isLoading={deletingInsight}
        onConfirm={handleDeleteInsight}
      />

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
