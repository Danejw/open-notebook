'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Save, Copy, Check, Sparkles, FileCode2, Download } from 'lucide-react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { useCreateNote } from '@/lib/hooks/use-notes'
import { htmlDocumentsApi } from '@/lib/api/html-documents'
import { extractHtmlFromChatContent } from '@/lib/utils/extract-html-from-chat'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'

interface MessageActionsProps {
  content: string
  projectId?: string
  noteTitle?: string
  htmlTemplateId?: string | null
}

export function MessageActions({
  content,
  projectId,
  noteTitle,
  htmlTemplateId,
}: MessageActionsProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [copySuccess, setCopySuccess] = useState(false)
  const [savingDocument, setSavingDocument] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const createNote = useCreateNote()

  const extractedHtml = extractHtmlFromChatContent(content)
  const canSaveDocument = Boolean(projectId && htmlTemplateId && extractedHtml)
  const canExportPdf = Boolean(extractedHtml)

  const handleSave = (asArtifact: boolean) => {
    if (!projectId) {
      toast.error(t('sources.cannotSaveNoteNoProject'))
      return
    }

    createNote.mutate({
      content,
      note_type: asArtifact ? 'artifact' : 'ai',
      project_id: projectId,
      title: asArtifact ? noteTitle : undefined,
    })
  }

  const handleSaveAsDocument = async () => {
    if (!projectId || !htmlTemplateId || !extractedHtml) {
      return
    }

    setSavingDocument(true)
    try {
      const doc = await htmlDocumentsApi.createDocument(projectId, {
        template_id: htmlTemplateId,
        scenario_label: 'Chat',
        html_body: extractedHtml,
      })
      toast.success(t('documents.saveAsDocumentSuccess'), {
        action: {
          label: t('common.open'),
          onClick: () => router.push(`/documents/${doc.id}`),
        },
      })
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(err, (key) => t(key), 'documents.saveAsDocumentFailed')
      )
    } finally {
      setSavingDocument(false)
    }
  }

  const handleExportPdf = async () => {
    if (!extractedHtml) return

    setExportingPdf(true)
    try {
      await htmlDocumentsApi.renderPdfFromHtml({
        html_body: extractedHtml,
        title: noteTitle || t('documents.title'),
      })
      toast.success(t('documents.exportSuccess'))
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(err, (key) => t(key), 'documents.exportPdfFailed')
      )
    } finally {
      setExportingPdf(false)
    }
  }

  const handleCopyToClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content)
        toast.success(t('common.copyToClipboard'))
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = content
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()

        try {
          document.execCommand('copy')
          toast.success(t('common.copyToClipboard'))
          setCopySuccess(true)
          setTimeout(() => setCopySuccess(false), 2000)
        } catch {
          toast.error(t('common.error'))
        }

        document.body.removeChild(textArea)
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      toast.error(t('common.error'))
    }
  }

  const busy = createNote.isPending || savingDocument || exportingPdf

  return (
    <TooltipProvider>
      <div className="flex gap-0.5">
        {projectId && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleSave(false)}
                  disabled={busy}
                >
                  {createNote.isPending ? (
                    <InlineSkeleton className="h-3 w-3" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('common.saveToNote')}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleSave(true)}
                  disabled={busy}
                >
                  {createNote.isPending ? (
                    <InlineSkeleton className="h-3 w-3" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('chat.saveAsArtifact')}</p>
              </TooltipContent>
            </Tooltip>
            {canSaveDocument && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => void handleSaveAsDocument()}
                    disabled={busy}
                  >
                    {savingDocument ? (
                      <InlineSkeleton className="h-3 w-3" />
                    ) : (
                      <FileCode2 className="h-3 w-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('documents.saveAsDocument')}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </>
        )}
        {canExportPdf && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => void handleExportPdf()}
                disabled={busy}
                aria-label={t('documents.exportPdf')}
              >
                {exportingPdf ? (
                  <InlineSkeleton className="h-3 w-3" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('documents.exportPdf')}</p>
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleCopyToClipboard}
              disabled={busy}
            >
              {copySuccess ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('common.copyToClipboard')}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
