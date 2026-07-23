'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { isAxiosError } from 'axios'
import { sourcesApi } from '@/lib/api/sources'
import { embeddingApi } from '@/lib/api/embedding'
import { useSource } from '@/lib/hooks/use-sources'
import { SourceDetailSkeleton } from '@/components/common/LoadingSkeletons'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { PageError } from '@/components/common/PageError'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { SourceKnowledgePanel } from '@/components/source/SourceKnowledgePanel'
import { DrawingExtractionResultsDialog } from '@/components/sources/DrawingExtractionResultsDialog'
import { selectInspectableDrawingRun } from '@/lib/drawing/select-inspectable-drawing-run'
import { useSourceDrawingRuns } from '@/lib/hooks/use-drawing-extraction'
import { useCitationFocusStore } from '@/lib/stores/citation-focus-store'
import { SourceDetailHeader } from '@/components/source/source-detail/SourceDetailHeader'
import { SourceDetailContentTab } from '@/components/source/source-detail/SourceDetailContentTab'
import { SourceDetailDrawingTab } from '@/components/source/source-detail/SourceDetailDrawingTab'
import { SourceDetailDetailsTab } from '@/components/source/source-detail/SourceDetailDetailsTab'
import {
  buildHighlightedTextView,
  extractFilename,
  focusForSource,
  getYouTubeVideoId,
  isDensePlainExtraction,
  isPdfAssetPath,
  parseContentDisposition,
} from '@/components/source/source-detail/sourceDetailUtils'

interface SourceDetailContentProps {
  sourceId: string
  onClose?: () => void
}

export function SourceDetailContent({
  sourceId,
  onClose,
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
  const [activeTab, setActiveTab] = useState('content')
  const [drawingResultsOpen, setDrawingResultsOpen] = useState(false)
  const activeFocus = useCitationFocusStore((s) => s.activeFocus)
  const clearActiveFocus = useCitationFocusStore((s) => s.clearActiveFocus)

  useEffect(() => {
    return () => {
      clearActiveFocus()
    }
  }, [clearActiveFocus, sourceId])

  const { data: drawingRunsData, isSuccess: drawingRunsReady } =
    useSourceDrawingRuns(sourceId)
  const inspectableDrawingRun = useMemo(
    () =>
      drawingRunsReady
        ? selectInspectableDrawingRun(drawingRunsData?.runs)
        : null,
    [drawingRunsReady, drawingRunsData?.runs]
  )
  const showDrawingTab = Boolean(inspectableDrawingRun)

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

  useEffect(() => {
    if (!showDrawingTab && activeTab === 'drawing') {
      setActiveTab('content')
    }
  }, [showDrawingTab, activeTab])

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
      const fallbackName = extractFilename(
        source.asset.file_path,
        `source-${source.id}`
      )
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

  const isYouTubeUrl = useMemo(() => {
    if (!source?.asset?.url) return false
    return !!getYouTubeVideoId(source.asset.url)
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
  const isPdfAsset = useMemo(() => {
    const path = source?.asset?.file_path || source?.asset?.url || ''
    return isPdfAssetPath(path)
  }, [source?.asset?.file_path, source?.asset?.url])
  const showPdfViewer = Boolean(
    isPdfAsset && fileAvailable !== false && source?.asset?.file_path
  )
  const focusForThisSource = focusForSource(activeFocus, sourceId)
  const highlightedTextView = useMemo(
    () => buildHighlightedTextView(contentText, focusForThisSource),
    [contentText, focusForThisSource]
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
      <PageError
        title={isError ? t('sources.loadFailed') : t('sources.notFound')}
        centered
        className="h-full p-4"
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <SourceDetailHeader
        title={source.title}
        hasFilePath={Boolean(source.asset?.file_path)}
        embedded={source.embedded}
        isEmbedding={isEmbedding}
        isDownloadingFile={isDownloadingFile}
        fileAvailable={fileAvailable}
        onUpdateTitle={handleUpdateTitle}
        onDownloadFile={handleDownloadFile}
        onEmbedContent={handleEmbedContent}
        onRequestDelete={() => setSourceDeleteOpen(true)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList
            className={cn(
              'sticky top-0 z-10 mt-0.5 grid w-full',
              showDrawingTab ? 'grid-cols-4' : 'grid-cols-3'
            )}
          >
            <TabsTrigger value="content">{t('sources.content')}</TabsTrigger>
            <TabsTrigger value="knowledge">{t('knowledge.tab')}</TabsTrigger>
            {showDrawingTab ? (
              <TabsTrigger value="drawing">{t('sources.drawingTab')}</TabsTrigger>
            ) : null}
            <TabsTrigger value="details">{t('sources.details')}</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-1 space-y-1">
            <SourceDetailContentTab
              sourceId={sourceId}
              assetUrl={source.asset?.url}
              contentText={contentText}
              isYouTubeUrl={isYouTubeUrl}
              youTubeVideoId={youTubeVideoId}
              showPdfViewer={showPdfViewer}
              usePlainExtractionView={usePlainExtractionView}
              highlightedTextView={highlightedTextView}
              focusForThisSource={focusForThisSource}
            />
          </TabsContent>

          <TabsContent value="knowledge" className="mt-1">
            <SourceKnowledgePanel
              sourceId={sourceId}
              projectId={source.projects?.[0]}
            />
          </TabsContent>

          {showDrawingTab && inspectableDrawingRun ? (
            <TabsContent value="drawing" className="mt-1 space-y-2">
              <SourceDetailDrawingTab
                run={inspectableDrawingRun}
                onInspectResults={() => setDrawingResultsOpen(true)}
              />
            </TabsContent>
          ) : null}

          <TabsContent value="details" className="mt-1 space-y-2">
            <SourceDetailDetailsTab
              sourceId={sourceId}
              source={source}
              language={language}
              copied={copied}
              isEmbedding={isEmbedding}
              isDownloadingFile={isDownloadingFile}
              fileAvailable={fileAvailable}
              onEmbedContent={handleEmbedContent}
              onCopyId={handleCopyId}
              onCopyUrl={handleCopyUrl}
              onOpenExternal={handleOpenExternal}
              onDownloadFile={handleDownloadFile}
              onAssociationsSaved={() => {
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

      <DrawingExtractionResultsDialog
        open={drawingResultsOpen}
        onOpenChange={setDrawingResultsOpen}
        runId={inspectableDrawingRun?.id ?? null}
        projectId={source.projects?.[0]}
      />
    </div>
  )
}
