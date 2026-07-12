'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Save, Copy, Check } from 'lucide-react'
import { InlineSkeleton } from '@/components/common/LoadingSkeletons'
import { useCreateNote } from '@/lib/hooks/use-notes'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'

interface MessageActionsProps {
  content: string
  projectId?: string
  noteTitle?: string
  saveAsArtifact?: boolean
}

export function MessageActions({
  content,
  projectId,
  noteTitle,
  saveAsArtifact = false,
}: MessageActionsProps) {
  const { t } = useTranslation()
  const [copySuccess, setCopySuccess] = useState(false)
  const createNote = useCreateNote()

  const handleSaveToNote = () => {
    if (!projectId) {
      toast.error(t('sources.cannotSaveNoteNoProject'))
      return
    }

    createNote.mutate({
      content,
      note_type: saveAsArtifact ? 'artifact' : 'ai',
      project_id: projectId,
      title: noteTitle,
    })
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

  const saveLabel = saveAsArtifact ? t('chat.saveArtifactToNotes') : t('common.saveToNote')

  return (
    <TooltipProvider>
      <div className="flex gap-0.5">
        {projectId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleSaveToNote}
                disabled={createNote.isPending}
              >
                {createNote.isPending ? (
                  <InlineSkeleton className="h-3 w-3" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{saveLabel}</p>
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
              disabled={createNote.isPending}
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
