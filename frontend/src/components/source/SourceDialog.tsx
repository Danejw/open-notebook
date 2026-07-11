'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SourceDetailSkeleton } from '@/components/common/LoadingSkeletons'
import { useTranslation } from '@/lib/hooks/use-translation'

const SourceDetailContent = dynamic(
  () =>
    import('@/components/source/SourceDetailContent').then((mod) => ({
      default: mod.SourceDetailContent,
    })),
  {
    ssr: false,
    loading: () => <SourceDetailSkeleton />,
  }
)

interface SourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceId: string | null
}

/**
 * Source Dialog Component
 *
 * Displays source details in a modal dialog.
 * Includes a "Chat with source" button that navigates to the full source page in-app.
 */
export function SourceDialog({ open, onOpenChange, sourceId }: SourceDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  // Ensure source ID has 'source:' prefix for API calls and routing
  const sourceIdWithPrefix = sourceId
    ? (sourceId.includes(':') ? sourceId : `source:${sourceId}`)
    : null

  const handleChatClick = () => {
    if (sourceIdWithPrefix) {
      onOpenChange(false)
      router.push(`/sources/${sourceIdWithPrefix}`)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  if (!sourceIdWithPrefix) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0">
        {/* Accessibility title (hidden visually but read by screen readers) */}
        <DialogTitle className="sr-only">{t('sources.detailsTitle')}</DialogTitle>

        {/* Source detail content — only mount when open to avoid eager fetch */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {open ? (
            <SourceDetailContent
              sourceId={sourceIdWithPrefix}
              showChatButton={true}
              onChatClick={handleChatClick}
              onClose={handleClose}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
