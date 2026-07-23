'use client'

import { CheckCircleIcon, XCircleIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/hooks/use-translation'
import type {
  BatchProgress,
  ProcessingState,
} from '@/components/sources/add-source/schema'

export interface AddSourceProcessingViewProps {
  open: boolean
  onClose: () => void
  processingStatus: ProcessingState | null
  batchProgress: BatchProgress | null
}

export function AddSourceProcessingView({
  open,
  onClose,
  processingStatus,
  batchProgress,
}: AddSourceProcessingViewProps) {
  const { t } = useTranslation()

  const progressPercent = batchProgress
    ? Math.round(
        ((batchProgress.completed + batchProgress.failed) / batchProgress.total) *
          100
      )
    : undefined

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[70vh]">
        <DialogHeader>
          <DialogTitle>
            {batchProgress
              ? t('sources.processingFiles')
              : t('sources.statusProcessing')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 px-1 py-1">
          <p className="text-xs text-muted-foreground">
            {processingStatus?.message || t('common.processing')}
          </p>

          {batchProgress && (
            <>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-sm gap-[2px]">
                <div className="flex items-center gap-[2px]">
                  <span className="flex items-center gap-[2px] text-green-600">
                    <CheckCircleIcon className="h-4 w-4" />
                    {batchProgress.completed} {t('common.completed')}
                  </span>
                  {batchProgress.failed > 0 && (
                    <span className="flex items-center gap-[2px] text-destructive">
                      <XCircleIcon className="h-4 w-4" />
                      {batchProgress.failed} {t('common.failed')}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground">
                  {batchProgress.completed + batchProgress.failed} /{' '}
                  {batchProgress.total}
                </span>
              </div>

              {batchProgress.currentItem && (
                <p className="truncate text-xs text-muted-foreground">
                  {t('common.current')}: {batchProgress.currentItem}
                </p>
              )}
            </>
          )}

          {!batchProgress && processingStatus?.progress ? (
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all duration-300"
                style={{ width: `${processingStatus.progress}%` }}
              />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
