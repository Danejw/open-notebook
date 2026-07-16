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
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/hooks/use-translation'

/** Default spacing for form fields inside rename/edit dialogs. */
export const formDialogFormClassName = 'space-y-3 px-1 py-1'

export interface FormDialogShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  isSubmitting?: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  children: ReactNode
  /** Called when the dialog opens; use to reset form defaults. */
  onOpen?: () => void
  /** Optional content between the header and the form (e.g. alerts). */
  beforeForm?: ReactNode
  disableSubmit?: boolean
  /** Primary submit label when not submitting. Defaults to common.save. */
  submitLabel?: string
  contentClassName?: string
  formClassName?: string
  footerClassName?: string
  /** Compact footer buttons (size="sm" h-7) used on templates/images pages. */
  compactFooter?: boolean
}

export function FormDialogShell({
  open,
  onOpenChange,
  title,
  isSubmitting = false,
  onSubmit,
  children,
  onOpen,
  beforeForm,
  disableSubmit = false,
  submitLabel,
  contentClassName,
  formClassName,
  footerClassName,
  compactFooter = false,
}: FormDialogShellProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) {
      return
    }
    onOpen?.()
  }, [open, onOpen])

  const saveLabel = isSubmitting
    ? t('common.saving')
    : (submitLabel ?? t('common.save'))

  const footerButtonProps = compactFooter
    ? ({ size: 'sm' as const, className: 'h-7' })
    : {}

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {beforeForm}

        <form
          onSubmit={onSubmit}
          className={cn(formDialogFormClassName, formClassName)}
        >
          {children}

          <DialogFooter className={cn('pt-2', footerClassName)}>
            <Button
              type="button"
              variant="outline"
              {...footerButtonProps}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              {...footerButtonProps}
              disabled={disableSubmit || isSubmitting}
            >
              {saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
