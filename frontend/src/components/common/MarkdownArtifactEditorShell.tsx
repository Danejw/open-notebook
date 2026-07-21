'use client'

import { type FormEventHandler, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  dialogLargeContentClassName,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DialogBodyLoading } from '@/components/common/LoadingSkeletons'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface MarkdownArtifactEditorShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  header?: ReactNode
  accessibilityTitle?: string
  children: ReactNode
  onSave: FormEventHandler<HTMLFormElement>
  onCancel: () => void
  isSaving?: boolean
  disableSave?: boolean
  isLoading?: boolean
  loadingLabel?: string
  saveLabel: string
  savingLabel: string
  cancelLabel?: string
  contentClassName?: string
  bodyClassName?: string
}

export function MarkdownArtifactEditorShell({
  open,
  onOpenChange,
  header,
  accessibilityTitle,
  children,
  onSave,
  onCancel,
  isSaving = false,
  disableSave = false,
  isLoading = false,
  loadingLabel,
  saveLabel,
  savingLabel,
  cancelLabel,
  contentClassName,
  bodyClassName,
}: MarkdownArtifactEditorShellProps) {
  const { t } = useTranslation()
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel')

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onCancel()
      return
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(dialogLargeContentClassName, 'overflow-hidden p-0', contentClassName)}
      >
        {accessibilityTitle ? (
          <DialogTitle className="sr-only">{accessibilityTitle}</DialogTitle>
        ) : null}
        {header ? <DialogHeader className="border-b">{header}</DialogHeader> : null}
        <form onSubmit={onSave} className="flex h-full min-h-0 min-w-0 flex-col">
          {isLoading && loadingLabel ? (
            <DialogBodyLoading label={loadingLabel} />
          ) : bodyClassName ? (
            <div className={bodyClassName}>{children}</div>
          ) : (
            children
          )}
          <DialogFooter className="border-t">
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={onCancel}>
              {resolvedCancelLabel}
            </Button>
            <Button type="submit" size="sm" className="h-7" disabled={isSaving || disableSave}>
              {isSaving ? savingLabel : saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
