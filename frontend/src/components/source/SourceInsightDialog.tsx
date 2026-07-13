'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Database } from 'lucide-react'
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer'
import { useInsight } from '@/lib/hooks/use-insights'
import { useIngestAsSource } from '@/lib/hooks/use-sources'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SourceInsightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  insight?: {
    id: string
    insight_type?: string
    content?: string
    created?: string
    source_id?: string
  }
  projectId?: string
  onDelete?: (insightId: string) => Promise<void>
}

export function SourceInsightDialog({
  open,
  onOpenChange,
  insight,
  projectId,
  onDelete,
}: SourceInsightDialogProps) {
  const { t } = useTranslation()
  const { openModal } = useModalManager()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const ingestAsSource = useIngestAsSource()

  const insightIdWithPrefix = insight?.id
    ? (insight.id.includes(':') ? insight.id : `source_insight:${insight.id}`)
    : ''

  const { data: fetchedInsight, isLoading } = useInsight(insightIdWithPrefix, { enabled: open && !!insight?.id })

  const displayInsight = fetchedInsight ?? insight
  const sourceId = fetchedInsight?.source_id ?? insight?.source_id

  const handleViewSource = () => {
    if (sourceId) {
      openModal('source', sourceId)
    }
  }

  const handleIngest = async () => {
    if (!insightIdWithPrefix) return
    await ingestAsSource.mutateAsync({
      kind: 'insight',
      insightId: insightIdWithPrefix,
      projectId,
    })
  }

  const handleDelete = async () => {
    if (!insight?.id || !onDelete) return
    setIsDeleting(true)
    try {
      await onDelete(insight.id)
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setShowDeleteConfirm(false)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>{t('sources.sourceInsight')}</span>
            <div className="flex items-center gap-2">
              {displayInsight?.insight_type && (
                <Badge variant="outline" className="text-xs uppercase">
                  {displayInsight.insight_type}
                </Badge>
              )}
              {sourceId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewSource}
                  className="gap-1"
                >
                  <FileText className="h-3 w-3" />
                  {t('sources.viewSource')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleIngest()}
                disabled={ingestAsSource.isPending || isLoading}
                className="gap-1"
              >
                <Database className="h-3 w-3" />
                {t('sources.ingestAsSource')}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {showDeleteConfirm ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <p className="text-center text-muted-foreground">
              {t('sources.deleteInsightConfirm').split(/[?？]/)[0]}?<br />
              <span className="text-sm">{t('sources.deleteInsightConfirm').split(/[?？]/)[1]?.trim() || t('common.deleteForever')}</span>
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? t('common.deleting') : t('common.delete')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
              </div>
            ) : displayInsight ? (
              <MarkdownRenderer size="sm">
                {displayInsight.content ?? ''}
              </MarkdownRenderer>
            ) : (
              <p className="text-sm text-muted-foreground">{t('sources.noInsightSelected')}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
