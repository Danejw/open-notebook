'use client'

import { useEffect, type FormEventHandler, type ReactNode } from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

export interface PodcastProfileFormDialogShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  isSubmitting: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  children: ReactNode
  /** Called when the dialog opens; use to reset form defaults. */
  onOpen?: () => void
  /** Optional content between the header and the form (e.g. alerts). */
  beforeForm?: ReactNode
  disableSubmit?: boolean
  mode?: 'create' | 'edit'
  /** Override the default create-mode save label. */
  createLabel?: string
}

export function PodcastProfileFormDialogShell({
  open,
  onOpenChange,
  title,
  isSubmitting,
  onSubmit,
  children,
  onOpen,
  beforeForm,
  disableSubmit = false,
  mode = 'create',
  createLabel,
}: PodcastProfileFormDialogShellProps) {
  const { t } = useTranslation()
  const isEdit = mode === 'edit'

  useEffect(() => {
    if (!open) {
      return
    }
    onOpen?.()
  }, [open, onOpen])

  const saveLabel = isSubmitting
    ? t('common.saving')
    : isEdit
      ? t('common.saveChanges')
      : (createLabel ?? t('podcasts.createProfile'))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {beforeForm}

        <form onSubmit={onSubmit} className="space-y-3 px-1 py-1">
          {children}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={disableSubmit || isSubmitting}>
              {saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
